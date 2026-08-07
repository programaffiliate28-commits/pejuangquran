import { supabase } from './supabase';
import { levelFromXp } from './constants';
import type { Profile } from './types';

/**
 * Submit tugas recovery: SATU source of truth — profiles.hutang_sanksi.
 * 1. Insert recovery_tasks (untuk Feed Recovery).
 * 2. Update profiles: hutang_sanksi - 1 (min 0), xp + 20, level recompute.
 * Tidak ada tabel pending_sanctions, tidak ada trigger.
 */
export async function submitRecoveryTask(
  userId: string,
  taskType: string,
  content: string,
  imageUrl: string | null = null
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Insert ke recovery_tasks (Feed)
    const { error: feedErr } = await supabase.from('recovery_tasks').insert({
      user_id: userId,
      task_type: taskType,
      content,
      image_url: imageUrl,
      status: 'approved',
      completed: true,
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    if (feedErr) throw feedErr;

    // 2. Ambil profile saat ini
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('hutang_sanksi, xp')
      .eq('id', userId)
      .maybeSingle();
    if (profErr) throw profErr;
    if (!prof) throw new Error('Profile tidak ditemukan');

    // 3. Update langsung: hutang_sanksi - 1 (min 0), xp + 20, level recompute
    const newHutang = Math.max(0, (prof.hutang_sanksi ?? 0) - 1);
    const newXp = (prof.xp ?? 0) + 20;
    const newLevel = levelFromXp(newXp);

    const { error: updErr } = await supabase
      .from('profiles')
      .update({
        hutang_sanksi: newHutang,
        xp: newXp,
        level: newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (updErr) throw updErr;

    return { success: true };
  } catch (err: any) {
    console.error('Gagal memproses tugas recovery:', err);
    return { success: false, error: err.message || 'Terjadi kesalahan sistem.' };
  }
}

/** Type-only re-export for convenience */
export type { Profile };
