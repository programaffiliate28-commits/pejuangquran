import { useState, useRef, useEffect, useCallback } from 'react';
import { Modal } from './ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { fetchKemenagTadabbur } from '@/lib/kemenag';
import { SURAH_LIST, PRAYER_TIMES } from '@/lib/constants';
import { todayISODate } from '@/lib/habit';
import type { PrayerTime, TilawahLog } from '@/lib/types';
import { Loader2, Sparkles, Check, ImagePlus, X, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';

interface LogModalProps {
  open: boolean;
  onClose: () => void;
  prayerTime: PrayerTime;
  existingLog?: TilawahLog | null;
  onSaved: (log: TilawahLog) => void;
}

export function LogModal({ open, onClose, prayerTime, existingLog, onSaved }: LogModalProps) {
  const { user } = useAuth();
  const [juz, setJuz] = useState(1);
  const [surahStart, setSurahStart] = useState('');
  const [surahEnd, setSurahEnd] = useState('');
  const [ayatStart, setAyatStart] = useState('');
  const [ayatEnd, setAyatEnd] = useState('');
  const [page, setPage] = useState('');
  const [duration, setDuration] = useState(10);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tadabburLoading, setTadabburLoading] = useState(false);
  const [tadabbur, setTadabbur] = useState<string | null>(null);
  const [tadabburError, setTadabburError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipAutoRefetch = useRef(false);

  const prayer = PRAYER_TIMES.find((p) => p.id === prayerTime);

  const startMax = SURAH_LIST.find((s) => s.name === surahStart)?.ayat ?? 286;
  const endMax = SURAH_LIST.find((s) => s.name === surahEnd)?.ayat ?? 286;

  const loadTadabbur = useCallback(async () => {
    if (!surahStart) return;
    setTadabburError(null);
    setTadabburLoading(true);
    const res = await fetchKemenagTadabbur(
      surahStart,
      parseInt(ayatStart) || 1,
      parseInt(ayatEnd) || parseInt(ayatStart) || 1,
      surahEnd,
    );
    setTadabburLoading(false);
    if (res.error) {
      setTadabburError(res.error);
      setTadabbur(null);
    } else if (res.tadabbur) {
      setTadabbur(res.tadabbur);
      setTadabburError(null);
    }
  }, [surahStart, surahEnd, ayatStart, ayatEnd]);

  useEffect(() => {
    if (!open || !surahStart) return;
    if (skipAutoRefetch.current) {
      skipAutoRefetch.current = false;
      return;
    }
    loadTadabbur();
  }, [open, surahStart, surahEnd, ayatStart, ayatEnd, loadTadabbur]);

  useEffect(() => {
    if (open) {
      if (existingLog) {
        skipAutoRefetch.current = true;
        setJuz(existingLog.juz);
        setSurahStart(existingLog.surah_name || '');
        setSurahEnd(existingLog.surah_name || '');
        setAyatStart(String(existingLog.ayat_start));
        setAyatEnd(String(existingLog.ayat_end));
        setPage(existingLog.page?.toString() ?? '');
        setDuration(existingLog.duration_minutes);
        setPhoto(existingLog.photo_url);
        setTadabbur(existingLog.tadabbur);
      } else {
        setJuz(1);
        setSurahStart('');
        setSurahEnd('');
        setAyatStart('');
        setAyatEnd('');
        setPage('');
        setDuration(prayer?.baseMinutes ?? 10);
        setPhoto(null);
        setTadabbur(null);
      }
      setPhotoFile(null);
      setError(null);
      setTadabburError(null);
      setTadabburLoading(false);
      setSubmitting(false);
    }
  }, [open, existingLog, prayer]);

  function handleSurahStartChange(name: string) {
    setSurahStart(name);
    if (!surahEnd || surahEnd === surahStart) {
      setSurahEnd(name);
    }
    setTadabbur(null);
    setTadabburError(null);
  }

  function handleSurahEndChange(name: string) {
    setSurahEnd(name);
    setTadabbur(null);
    setTadabburError(null);
  }

  function handleAyatChange(setter: (v: string) => void, value: string) {
    setter(value);
    setTadabbur(null);
    setTadabburError(null);
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran foto maksimal 5MB.');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile || !user) return photo;
    const ext = photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('pap').upload(path, photoFile, {
      contentType: photoFile.type,
      upsert: false,
    });
    if (upErr) {
      setError('Gagal mengunggah foto: ' + upErr.message);
      return null;
    }
    const { data } = supabase.storage.from('pap').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) return;
    if (!surahStart) { setError('Pilih surat awal.'); return; }
    if (!surahEnd) { setError('Pilih surat akhir.'); return; }
    const startVal = parseInt(ayatStart) || 1;
    const endVal = parseInt(ayatEnd) || startVal;
    if (endVal < startVal && surahStart === surahEnd) { setError('Ayat akhir harus >= ayat awal.'); return; }

    setSubmitting(true);

    let finalTadabbur = tadabbur;
    if (!finalTadabbur) {
      setTadabburLoading(true);
      const tadRes = await fetchKemenagTadabbur(surahStart, startVal, endVal, surahEnd);
      setTadabburLoading(false);
      if (tadRes.tadabbur) {
        finalTadabbur = tadRes.tadabbur;
        setTadabbur(finalTadabbur);
      }
    }

    const photoUrl = await uploadPhoto();
    if (photoUrl === null && photoFile) {
      setSubmitting(false);
      return;
    }

    // Disesuaikan persis dengan kolom yang ada di database Supabase
    const payload = {
      user_id: user.id,
      prayer_time: prayerTime,
      log_date: existingLog?.log_date ?? todayISODate(),
      juz,
      surah_name: surahStart,
      ayat_start: startVal,
      ayat_end: endVal,
      page: page ? parseInt(page, 10) : null,
      photo_url: photoUrl,
      duration_minutes: duration,
      tadabbur: finalTadabbur,
    };

    let saved: TilawahLog | null = null;
    if (existingLog) {
      const { data, error: err } = await supabase
        .from('tilawah_logs')
        .update(payload)
        .eq('id', existingLog.id)
        .select()
        .single();
      if (err) { setError(err.message); setSubmitting(false); return; }
      saved = data as TilawahLog;
    } else {
      const { data, error: err } = await supabase
        .from('tilawah_logs')
        .insert(payload)
        .select()
        .single();
      if (err) { setError(err.message); setSubmitting(false); return; }
      saved = data as TilawahLog;

      // Sanksi pending dibatalkan otomatis: cron apply_daily_sanksi hanya
      // menambah hutang_sanksi jika kemarin tidak ada log. Karena user
      // mengisi log hari ini, hari ini tidak akan menjadi sanksi.
    }

    setSubmitting(false);
    if (saved) onSaved(saved);
  }

  return (
    <Modal open={open} onClose={onClose} title={`${prayer?.label} — Log Tilawah`}>
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[70vh]">
        <div className="space-y-4 overflow-y-auto pr-1 pb-3 scrollbar-thin">
          {/* Juz */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Juz</label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setJuz(j)}
                  className={`h-9 w-9 rounded-lg text-xs font-bold transition-all active:scale-90 ${
                    juz === j
                      ? 'bg-emerald-600 text-white shadow-soft'
                      : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
                  }`}
                >
                  {j}
                </button>
              ))}
            </div>
          </div>

          {/* Surah Awal + Surah Akhir */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Surat Awal</label>
              <div className="relative">
                <BookOpen size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                <select
                  value={surahStart}
                  onChange={(e) => handleSurahStartChange(e.target.value)}
                  className="input-field pl-10 appearance-none"
                >
                  <option value="">Pilih surat...</option>
                  {SURAH_LIST.map((s, i) => (
                    <option key={s.name} value={s.name}>{i + 1}. {s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Surat Akhir</label>
              <div className="relative">
                <BookOpen size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                <select
                  value={surahEnd}
                  onChange={(e) => handleSurahEndChange(e.target.value)}
                  className="input-field pl-10 appearance-none"
                >
                  <option value="">Pilih surat...</option>
                  {SURAH_LIST.map((s, i) => (
                    <option key={s.name} value={s.name}>{i + 1}. {s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Ayat Awal + Ayat Akhir */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Ayat Awal</label>
              <input
                type="number"
                min={1}
                max={startMax}
                value={ayatStart}
                onChange={(e) => handleAyatChange(setAyatStart, e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="1"
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Ayat Akhir</label>
              <input
                type="number"
                min={1}
                max={endMax}
                value={ayatEnd}
                onChange={(e) => handleAyatChange(setAyatEnd, e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="1"
                className="input-field"
              />
            </div>
          </div>

          {/* Page + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Halaman <span className="font-normal text-emerald-400">(opsional)</span></label>
              <input
                type="number"
                min={1}
                max={604}
                value={page}
                onChange={(e) => setPage(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="—"
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Durasi (mnt)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, +e.target.value || 10))}
                onFocus={(e) => e.target.select()}
                className="input-field"
              />
            </div>
          </div>

          {/* Photo PAP */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Foto PAP <span className="font-normal text-emerald-400">(bukti tilawah)</span></label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" />
            {photo ? (
              <div className="relative overflow-hidden rounded-2xl">
                <img src={photo} alt="Bukti tilawah" className="h-44 w-full object-cover" />
                <button type="button" onClick={clearPhoto} className="absolute right-2 top-2 rounded-full bg-emerald-950/60 p-1.5 text-white backdrop-blur">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 py-6 text-emerald-500 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
              >
                <ImagePlus size={28} />
                <span className="text-xs font-medium">Unggah foto Al-Qur'an / sajadah</span>
              </button>
            )}
          </div>

          {/* Tadabbur Kemenag */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-gold-50/40 p-4 dark:from-emerald-900/30 dark:to-gold-900/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-gold-300">
                <Sparkles size={18} className="text-gold-500" />
                <span className="text-sm font-semibold">Tadabbur Kemenag</span>
              </div>
              {tadabbur && (
                <button type="button" onClick={loadTadabbur} className="text-xs font-semibold text-gold-600 underline">
                  Muat ulang
                </button>
              )}
            </div>
            {tadabbur ? (
              <p className="mt-2 whitespace-pre-line text-sm italic leading-relaxed text-emerald-700 dark:text-emerald-200/90">{tadabbur}</p>
            ) : tadabburLoading ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-emerald-500">
                <Loader2 size={16} className="animate-spin" /> Memuat Tafsir Kemenag...
              </div>
            ) : tadabburError ? (
              <div className="mt-2 flex flex-col items-start gap-2">
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle size={16} />
                  <span>{tadabburError}</span>
                </div>
                <button type="button" onClick={loadTadabbur} className="btn-ghost !py-2 text-xs">
                  <RefreshCw size={14} /> Coba lagi
                </button>
              </div>
            ) : surahStart ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
                <Sparkles size={14} /> Tafsir akan dimuat otomatis saat surat/ayat dipilih
              </div>
            ) : (
              <div className="mt-2 text-xs text-emerald-400">Pilih surat untuk memuat tafsir Kemenag</div>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Tombol Simpan */}
        <div className="pt-3 mt-2 border-t border-emerald-100 dark:border-emerald-800/50">
          <button type="submit" disabled={submitting} className="btn-gold w-full">
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {tadabburLoading ? 'Memuat tafsir Kemenag...' : 'Menyimpan...'}
              </>
            ) : (
              <>
                <Check size={18} />
                {existingLog ? 'Simpan Perubahan' : 'Simpan & Selesai'}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}