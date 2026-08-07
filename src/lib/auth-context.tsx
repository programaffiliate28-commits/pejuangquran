import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';
import { evaluateStrikes, shouldEnterRestMode, todayISODate, getNow } from './habit';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  needsOnboarding: boolean;
}

interface AuthContextValue extends AuthState {
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  setProfile: (updater: (prev: Profile | null) => Profile | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
    needsOnboarding: false,
  });

  const setProfile = useCallback((updater: (prev: Profile | null) => Profile | null) => {
    setState((s) => ({ ...s, profile: updater(s.profile) }));
  }, []);

  const loadProfile = useCallback(async (uid: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error('loadProfile error', error);
      return null;
    }
    return data as Profile | null;
  }, []);

  // Client-side daily sanksi check: kalau kemarin ada slot (pagi/siang/sore)
  // yang belum diisi dan belum diproses, tiap slot kosong nambah 1 sanksi
  // (bukan flat 1 per hari). Uses getNow()/todayISODate() supaya respect
  // IS_TESTING date override.
  const checkYesterdayMissedLogs = useCallback(async (uid: string) => {
    const yesterday = getNow();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    // Already processed for this yesterday?
    const { data: prof } = await supabase
      .from('profiles')
      .select('last_sanksi_check, hutang_sanksi, total_sanksi, rest_mode, created_at')
      .eq('id', uid)
      .maybeSingle();
    if (!prof || prof.rest_mode) return;
    if (prof.last_sanksi_check === yStr) return;

    // Akun yang baru dibuat gak boleh kena sanksi untuk tanggal SEBELUM
    // dia terdaftar (mis. baru daftar hari ini, jangan langsung kena
    // sanksi "kemarin" cuma karena belum ada log — wajar, akunnya
    // emang belum ada kemarin).
    const createdDateStr = (prof.created_at ?? '').slice(0, 10);
    if (createdDateStr && createdDateStr >= yStr) {
      await supabase
        .from('profiles')
        .update({ last_sanksi_check: yStr, updated_at: new Date().toISOString() })
        .eq('id', uid);
      return;
    }

    // Check how many of the 3 required slots were done yesterday
    const { data: yLogs } = await supabase
      .from('tilawah_logs')
      .select('prayer_time')
      .eq('user_id', uid)
      .eq('log_date', yStr)
      .eq('is_recovery', false);

    const doneSlots = new Set((yLogs ?? []).map((l) => l.prayer_time));
    // 1 slot kosong = 1 sanksi. Kalau pagi terlewat tapi tetap diisi di hari
    // yang sama (siang/malam, log_date-nya tetap kemarin), slot itu sudah
    // masuk doneSlots -> sanksi untuk slot itu batal.
    const missedSlots = ['pagi', 'siang', 'sore'].filter((s) => !doneSlots.has(s));

    if (missedSlots.length === 0) {
      // Semua slot terisi kemarin — tidak ada sanksi baru, hanya tandai sudah dicek
      await supabase
        .from('profiles')
        .update({ last_sanksi_check: yStr, updated_at: new Date().toISOString() })
        .eq('id', uid);
      return;
    }

    // Tiap slot yang kosong menambah 1 sanksi.
    // hutang_sanksi (aktif) dibatasi maksimal 3, tapi total_sanksi (riwayat
    // lifetime) tidak dibatasi supaya datanya tetap akurat.
    const missedCount = missedSlots.length;
    const newHutang = Math.min(3, (prof.hutang_sanksi ?? 0) + missedCount);
    const newTotal = (prof.total_sanksi ?? 0) + missedCount;
    const { error: sanksiErr } = await supabase
      .from('profiles')
      .update({
        hutang_sanksi: newHutang,
        total_sanksi: newTotal,
        last_sanksi_check: yStr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid);

    if (!sanksiErr) {
      // Optimistic local state update — UI merespons seketika
      setProfile((prev) =>
        prev ? { ...prev, hutang_sanksi: newHutang, total_sanksi: newTotal } : null
      );
    }
  }, [setProfile]);

  const refreshProfile = useCallback(async () => {
    const uid = state.user?.id;
    if (!uid) return;
    // Run sanksi check first (idempotent via last_sanksi_check guard)
    await checkYesterdayMissedLogs(uid);
    const p = await loadProfile(uid);
    if (p) {
      // Evaluate strikes on load
      const { data: logDates } = await supabase
        .from('tilawah_logs')
        .select('log_date')
        .eq('user_id', uid);
      const dates = (logDates ?? []).map((r) => r.log_date as string);
      const strikeEval = evaluateStrikes(p, dates);
      if (strikeEval) {
        const enterRest = shouldEnterRestMode(strikeEval.strikes);
        const { error } = await supabase
          .from('profiles')
          .update({ strikes: strikeEval.strikes, rest_mode: enterRest, updated_at: new Date().toISOString() })
          .eq('id', uid);
        if (!error) {
          const updated = await loadProfile(uid);
          if (updated) {
            setState((s) => ({ ...s, profile: updated, needsOnboarding: !updated.onboarded }));
            return;
          }
        }
      }
      setState((s) => ({ ...s, profile: p, needsOnboarding: !p.onboarded }));
    }
  }, [state.user, loadProfile, checkYesterdayMissedLogs]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const session = data.session;
      if (session?.user) {
        (async () => {
          const p = await loadProfile(session.user.id);
          if (!mounted) return;
          setState({
            session,
            user: session.user,
            profile: p,
            loading: false,
            needsOnboarding: !p?.onboarded,
          });
          if (p) {
            // Strike evaluation
            const { data: logDates } = await supabase
              .from('tilawah_logs')
              .select('log_date')
              .eq('user_id', session.user.id);
            const dates = (logDates ?? []).map((r) => r.log_date as string);
            const strikeEval = evaluateStrikes(p, dates);
            if (strikeEval && mounted) {
              const enterRest = shouldEnterRestMode(strikeEval.strikes);
              await supabase
                .from('profiles')
                .update({ strikes: strikeEval.strikes, rest_mode: enterRest, updated_at: new Date().toISOString() })
                .eq('id', session.user.id);
            }
            // Sanksi check for yesterday's missed logs
            await checkYesterdayMissedLogs(session.user.id);
            // Final profile reload to reflect any sanksi/strike changes
            const finalProf = await loadProfile(session.user.id);
            if (finalProf && mounted) {
              setState((s) => ({ ...s, profile: finalProf, needsOnboarding: !finalProf.onboarded }));
            }
          }
        })();
      } else {
        setState({ session: null, user: null, profile: null, loading: false, needsOnboarding: false });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          const p = await loadProfile(session.user.id);
          if (!mounted) return;
          setState({
            session,
            user: session.user,
            profile: p,
            loading: false,
            needsOnboarding: !p?.onboarded,
          });
          if (p) {
            await checkYesterdayMissedLogs(session.user.id);
            const finalProf = await loadProfile(session.user.id);
            if (finalProf && mounted) {
              setState((s) => ({ ...s, profile: finalProf, needsOnboarding: !finalProf.onboarded }));
            }
          }
        } else {
          setState({ session: null, user: null, profile: null, loading: false, needsOnboarding: false });
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, checkYesterdayMissedLogs]);

  // Banyak user (terutama di HP) gak pernah bener-bener me-reload halaman —
  // mereka cuma minimize/pindah app lalu balik lagi, jadi tab-nya cuma
  // di-resume dari background, BUKAN di-mount ulang. useEffect mount di atas
  // cuma jalan sekali seumur hidup tab tersebut, sehingga checkYesterdayMissedLogs
  // gak pernah ke-trigger ulang di hari-hari berikutnya walau user aktif lagi.
  // Fix: re-jalankan pengecekan setiap kali tab kembali kelihatan/fokus,
  // dengan throttle biar gak spam request kalau user gonta-ganti tab cepat.
  useEffect(() => {
    let lastCheckAt = 0;
    const MIN_INTERVAL_MS = 60_000; // maksimal sekali per menit

    const recheck = () => {
      const uid = state.user?.id;
      if (!uid) return;
      const now = Date.now();
      if (now - lastCheckAt < MIN_INTERVAL_MS) return;
      lastCheckAt = now;
      (async () => {
        await checkYesterdayMissedLogs(uid);
        const p = await loadProfile(uid);
        if (p) {
          setState((s) => ({ ...s, profile: p, needsOnboarding: !p.onboarded }));
        }
      })();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', recheck);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', recheck);
    };
  }, [state.user?.id, checkYesterdayMissedLogs, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ session: null, user: null, profile: null, loading: false, needsOnboarding: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refreshProfile, signOut, setProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { todayISODate };