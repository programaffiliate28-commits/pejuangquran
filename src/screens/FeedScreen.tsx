import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { REACTIONS, timeAgo, PRAYER_TIMES } from '@/lib/constants';
import type { FeedItem, ReactionKind } from '@/lib/types';
import { Avatar, Modal, showToast } from '@/components/ui';
import { Sparkles, BookOpen, Heart, Flame, Loader2, MoreVertical, Trash2, AlertTriangle, ShieldCheck, Newspaper, ScrollText, Image as ImageIcon } from 'lucide-react';

const REACTION_ICONS: Record<ReactionKind, typeof Heart> = {
  masyaallah: Heart,
  semangat: Flame,
  barakallah: Sparkles,
};

type FeedTab = 'tilawah' | 'recovery';

export function FeedScreen() {
  const { user, refreshProfile } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reacting, setReacting] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeedItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<FeedTab>('tilawah');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    if (menuOpenId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpenId]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch tilawah logs
      const { data: logs } = await supabase
        .from('tilawah_logs')
        .select(`
          *,
          profile:profiles ( full_name, avatar_url, role, level )
        `)
        .order('created_at', { ascending: false })
        .limit(40);

      // 2. Fetch recovery tasks
      const { data: recoveryTasks } = await supabase
        .from('recovery_tasks')
        .select(`
          *,
          profile:profiles ( full_name, avatar_url, role, level )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      // Format recovery tasks agar sesuai dengan struktur FeedItem
      const formattedRecovery: FeedItem[] = (recoveryTasks || []).map((task) => ({
        id: task.id,
        user_id: task.user_id,
        prayer_time: 'extra' as const,
        surah_name: task.task_type || 'Tugas Recovery',
        juz: 1,
        ayat_start: 1,
        ayat_end: 1,
        duration_minutes: 0,
        xp_earned: 20,
        photo_url: task.image_url,
        is_recovery: true,
        recovery_description: task.content,
        created_at: task.created_at,
        profile: task.profile,
      }));

      const formattedTilawah: FeedItem[] = (logs || []).map((log) => ({
        ...log,
        is_recovery: log.type === 'recovery' || log.is_recovery,
      }));

      // Gabungkan dan urutkan berdasarkan created_at
      const combinedLogs = [...formattedTilawah, ...formattedRecovery].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (combinedLogs.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const logIds = combinedLogs.map((l) => l.id);

      // Fetch reactions
      const { data: reactions } = await supabase
        .from('reactions')
        .select('*')
        .in('log_id', logIds);

      const enriched = combinedLogs.map((log) => {
        const logReactions = (reactions ?? []).filter((r) => r.log_id === log.id);
        const myReaction = logReactions.find((r) => r.user_id === user?.id)?.kind ?? null;
        return { ...log, reactions: logReactions, my_reaction: myReaction };
      });

      setItems(enriched);
    } catch (err) {
      console.error('Error loading feed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  async function toggleReaction(logId: string, kind: ReactionKind) {
    if (!user) return;
    const item = items.find((i) => i.id === logId);
    if (!item) return;
    setReacting(logId);

    if (item.my_reaction === kind) {
      await supabase.from('reactions').delete().eq('log_id', logId).eq('user_id', user.id);
    } else {
      await supabase.from('reactions').delete().eq('log_id', logId).eq('user_id', user.id);
      await supabase.from('reactions').insert({ log_id: logId, user_id: user.id, kind });
    }
    setReacting(null);
    loadFeed();
  }

  function reactionCount(item: FeedItem, kind: ReactionKind): number {
    return (item.reactions ?? []).filter((r) => r.kind === kind).length;
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const targetTable = deleteTarget.is_recovery ? 'recovery_tasks' : 'tilawah_logs';

    const { error } = await supabase
      .from(targetTable)
      .delete()
      .eq('id', deleteTarget.id)
      .eq('user_id', user?.id);

    setDeleting(false);

    if (error) {
      showToast('Gagal menghapus postingan');
      return;
    }

    showToast('Postingan dihapus. XP/sanksi diperbarui otomatis.');
    setDeleteTarget(null);
    setMenuOpenId(null);
    loadFeed();
    refreshProfile();
  }

  const tilawahItems = items.filter((i) => !i.is_recovery);
  const recoveryItems = items.filter((i) => i.is_recovery);
  const visibleItems = tab === 'tilawah' ? tilawahItems : recoveryItems;

  return (
    <div className="app-max-width px-4 pb-28 pt-6">
      <h1 className="mb-1 text-lg font-bold text-emerald-900 dark:text-emerald-100">Feed Komunitas</h1>
      <p className="mb-4 text-xs text-emerald-500 dark:text-emerald-400">Apresiasi tilawah dan tugas recovery teman dengan reaksi cepat</p>

      {/* Tab Switcher */}
      <div className="mb-4 flex gap-2 rounded-2xl bg-emerald-50 p-1 dark:bg-emerald-900/30">
        <button
          onClick={() => setTab('tilawah')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all ${
            tab === 'tilawah'
              ? 'bg-white text-emerald-700 shadow-soft dark:bg-emerald-800 dark:text-amber-300'
              : 'text-emerald-500 dark:text-emerald-400'
          }`}
        >
          <Newspaper size={14} /> Feed Tilawah
        </button>
        <button
          onClick={() => setTab('recovery')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all ${
            tab === 'recovery'
              ? 'bg-white text-emerald-700 shadow-soft dark:bg-emerald-800 dark:text-amber-300'
              : 'text-emerald-500 dark:text-emerald-400'
          }`}
        >
          <ScrollText size={14} /> Tugas Recovery
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => <div key={i} className="h-72 rounded-3xl shimmer" />)}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40">
            {tab === 'tilawah' ? <BookOpen size={28} className="text-emerald-500" /> : <ScrollText size={28} className="text-emerald-500" />}
          </div>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {tab === 'tilawah' ? 'Belum ada aktivitas tilawah' : 'Belum ada tugas recovery'}
          </p>
          <p className="text-xs text-emerald-500">
            {tab === 'tilawah' ? 'Mulai tilawah pertamamu dan muncul di sini!' : 'Tugas recovery anggota akan muncul di sini.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleItems.map((item) => {
            const profile = item.profile;
            const prayer = PRAYER_TIMES.find((p) => p.id === item.prayer_time);
            const isRecovery = item.is_recovery;

            return (
              <div key={item.id} className="card overflow-hidden">
                {/* Recovery Banner */}
                {isRecovery && (
                  <div className="flex items-center gap-2 bg-amber-100/70 px-4 py-2 dark:bg-amber-900/30">
                    <ShieldCheck size={16} className="text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Tugas Recovery / Sanksi</span>
                  </div>
                )}

                {/* Header */}
                <div className="flex items-center gap-3 p-4">
                  <Avatar name={profile?.full_name ?? 'Anon'} url={profile?.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-emerald-900 dark:text-emerald-100">
                      {profile?.full_name ?? 'Anggota'}
                    </p>
                    <p className="text-xs text-emerald-500 dark:text-emerald-400">
                      {isRecovery ? (item.surah_name || 'Tugas Recovery') : (prayer?.label || 'Tilawah')} • {timeAgo(item.created_at)}
                    </p>
                  </div>
                  {profile?.level && (
                    <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      Lv {profile.level}
                    </span>
                  )}
                  {item.user_id === user?.id && (
                    <div className="relative" ref={menuOpenId === item.id ? menuRef : undefined}>
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
                        className="rounded-full p-1.5 text-emerald-400 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900"
                        aria-label="Menu"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menuOpenId === item.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-card animate-scale-in dark:border-emerald-900 dark:bg-emerald-950">
                          <button
                            onClick={() => { setDeleteTarget(item); setMenuOpenId(null); }}
                            className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            <Trash2 size={16} />
                            Hapus Postingan
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Photo (Tilawah atau Recovery) */}
                {item.photo_url && (
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-900">
                    <img src={item.photo_url} alt="Lampiran bukti" className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/40 via-transparent to-transparent" />
                    {!isRecovery && (
                      <div className="absolute bottom-3 left-3 rounded-xl bg-emerald-950/60 px-3 py-1.5 text-white backdrop-blur">
                        <span className="text-xs font-semibold">{item.surah_name} {item.ayat_start}{item.ayat_end !== item.ayat_start ? `-${item.ayat_end}` : ''}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Details */}
                <div className="p-4">
                  {isRecovery ? (
                    <div className="space-y-2">
                      {item.recovery_description && (
                        <div className="rounded-2xl bg-amber-50/60 p-3.5 border border-amber-100 dark:border-amber-900/30 dark:bg-amber-950/20">
                          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">
                            {item.recovery_description}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {!item.photo_url && (
                        <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-900/30">
                          <BookOpen size={16} className="text-emerald-500" />
                          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                            {item.surah_name} {item.ayat_start}{item.ayat_end !== item.ayat_start ? `-${item.ayat_end}` : ''}
                          </span>
                          <span className="ml-auto text-xs text-emerald-400">Juz {item.juz}</span>
                        </div>
                      )}

                      {item.photo_url && (
                        <p className="mb-2 text-xs text-emerald-400">Juz {item.juz} • {item.duration_minutes} menit • +{item.xp_earned} XP</p>
                      )}

                      {item.tadabbur && (
                        <div className="mb-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-amber-50/40 p-3 dark:from-emerald-900/30 dark:to-amber-900/10">
                          <div className="mb-1 flex items-center gap-1.5 text-amber-600 dark:text-amber-300">
                            <Sparkles size={14} />
                            <span className="text-[11px] font-bold uppercase tracking-wide">Tadabbur AI</span>
                          </div>
                          <p className="text-sm italic leading-relaxed text-emerald-700 dark:text-emerald-200/90">"{item.tadabbur}"</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Reactions */}
                  <div className="mt-3 flex items-center gap-2">
                    {REACTIONS.map((r) => {
                      const count = reactionCount(item, r.id);
                      const isMine = item.my_reaction === r.id;
                      const Icon = REACTION_ICONS[r.id];
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleReaction(item.id, r.id)}
                          disabled={reacting === item.id}
                          className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-all active:scale-95 ${
                            isMine
                              ? r.id === 'masyaallah'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-800/50 dark:text-emerald-200'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400'
                          }`}
                        >
                          <span className="text-sm">{r.emoji}</span>
                          <span className="truncate">{r.label}</span>
                          {count > 0 && <span className="font-bold">{count}</span>}
                          {isMine && <Icon size={12} className="ml-0.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Hapus */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); setDeleting(false); }}
        title="Hapus Postingan?"
        showClose={!deleting}
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {deleteTarget?.is_recovery
                ? 'Tugas recovery ini akan dihapus permanen dari feed.'
                : <>Postingan tilawah <b>{deleteTarget?.surah_name} {deleteTarget?.ayat_start}{deleteTarget?.ayat_end !== deleteTarget?.ayat_start ? `-${deleteTarget?.ayat_end}` : ''}</b> beserta foto dan reaksi akan dihapus permanen.</>}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="btn-ghost flex-1"
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-red-600 active:scale-[0.98] disabled:opacity-50"
            >
              {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Hapus
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}