import { useState } from 'react';
import { Modal } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { fetchCoachAnalysis } from '@/lib/ai';
import { PRAYER_TIMES } from '@/lib/constants';
import { getNow } from '@/lib/habit';
import type { TilawahLog, CoachAnalysis } from '@/lib/types';
import { Sparkles, Loader2, Lightbulb, AlertCircle, Sunrise, Sun, CloudSun, Sunset, Moon, CheckCircle2, XCircle, TrendingDown } from 'lucide-react';

const TIME_ICONS: Record<string, typeof Sunrise> = {
  pagi: Sunrise, siang: Sun, sore: Moon, extra: Sparkles,
};

interface CoachModalProps {
  open: boolean;
  onClose: () => void;
}

export function CoachModal({ open, onClose }: CoachModalProps) {
  const { profile } = useAuth();
  const [analysis, setAnalysis] = useState<CoachAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    if (!profile) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);

    const weekAgo = getNow();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: logs } = await supabase
      .from('tilawah_logs')
      .select('*')
      .eq('user_id', profile.id)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: true });

    const weekLogs = (logs ?? []) as TilawahLog[];
    const result = await fetchCoachAnalysis(weekLogs, profile.full_name, profile.target_minutes, profile.hutang_sanksi ?? 0);
    setLoading(false);
    if (result.error && !result.solutions?.length) {
      setError(result.error);
    } else {
      setAnalysis(result);
    }
  }

  const weakestLabel = analysis?.weakest_time
    ? PRAYER_TIMES.find((p) => p.id === analysis.weakest_time)?.label ?? analysis.weakest_time
    : '';

  const dailyMissedLabels = analysis?.daily_missed ?? [];
  const allPrayers = PRAYER_TIMES.map((p) => p.label);
  const dailyDoneLabels = allPrayers.filter((l) => !dailyMissedLabels.includes(l));

  return (
    <Modal open={open} onClose={onClose} title="AI Personal Coach">
      {!analysis && !loading && !error && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-300 to-gold-500 shadow-glow">
            <Sparkles size={32} className="text-emerald-950" />
          </div>
          <p className="mb-1 text-sm font-bold text-emerald-900 dark:text-emerald-100">Analisis Konsistensi Tilawah</p>
          <p className="mb-5 text-xs text-emerald-500 dark:text-emerald-400">
            AI akan membaca log 7 hari terakhirmu, mendeteksi waktu shalat yang sering terlewat hari ini dan sepekan, lalu memberikan 3 solusi taktis konkrit.
          </p>
          <button onClick={runAnalysis} className="btn-gold w-full">
            <Sparkles size={18} /> Mulai Analisis
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 size={32} className="animate-spin text-gold-500" />
          <p className="text-sm text-emerald-600 dark:text-emerald-300">AI sedang menganalisis konsistensimu...</p>
        </div>
      )}

      {error && !analysis && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={runAnalysis} className="btn-ghost">Coba lagi</button>
        </div>
      )}

      {analysis && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary */}
          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-900/30">
            <p className="text-sm leading-relaxed text-emerald-800 dark:text-emerald-200">{analysis.summary}</p>
          </div>

          {/* Daily evaluation */}
          <div className="rounded-2xl border border-emerald-200 p-4 dark:border-emerald-800">
            <div className="mb-3 flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">a</span>
              <span className="text-sm font-bold">Evaluasi Hari Ini</span>
            </div>

            {/* Prayer status row */}
            <div className="mb-3 flex flex-wrap gap-2">
              {allPrayers.map((label) => {
                const missed = dailyMissedLabels.includes(label);
                return (
                  <span
                    key={label}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      missed
                        ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                    }`}
                  >
                    {missed ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                    {label}
                  </span>
                );
              })}
            </div>

            {dailyMissedLabels.length > 0 ? (
              <p className="mb-2 text-sm leading-relaxed text-emerald-700 dark:text-emerald-300">
                Hari ini kamu terlewat di waktu <b>{dailyMissedLabels.join(", ")}</b>.
              </p>
            ) : (
              <p className="mb-2 text-sm leading-relaxed text-emerald-700 dark:text-emerald-300">
                Hari ini semua waktu tilawah selesai. MasyaAllah, istiqamah terjaga!
              </p>
            )}

            <div className="flex items-start gap-2 rounded-xl bg-gold-50/60 p-3 dark:bg-gold-900/15">
              <Lightbulb size={16} className="mt-0.5 shrink-0 text-gold-600 dark:text-gold-400" />
              <p className="text-sm leading-relaxed text-emerald-700 dark:text-emerald-200/90">{analysis.daily_tip}</p>
            </div>
          </div>

          {/* Weekly cumulative analysis */}
          {analysis.weakest_time && analysis.weakest_time !== 'merata' && (
            <div className="rounded-2xl border border-gold-200 p-4 dark:border-gold-800/50">
              <div className="mb-3 flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold-100 text-xs font-bold text-gold-600 dark:bg-gold-900/50 dark:text-gold-300">b</span>
                <span className="text-sm font-bold">Pola 7 Hari Terakhir</span>
              </div>

              {/* Weakest time highlight */}
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-gold-50/50 p-3 dark:bg-gold-900/10">
                {(() => {
                  const Icon = TIME_ICONS[analysis.weakest_time] ?? Sunrise;
                  return <Icon size={24} className="shrink-0 text-gold-600 dark:text-gold-400" />;
                })()}
                <div>
                  <p className="text-xs font-medium text-gold-600 dark:text-gold-400">Waktu paling sering terlewat</p>
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                    Tilawah {weakestLabel} ({analysis.weekly_missed_count}x dalam 7 hari)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <TrendingDown size={16} className="mt-0.5 shrink-0 text-gold-500" />
                <p className="text-sm leading-relaxed text-emerald-700 dark:text-emerald-300">{analysis.weekly_analysis}</p>
              </div>
            </div>
          )}

          {/* Solutions */}
          {analysis.solutions.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 p-4 dark:border-emerald-800">
              <div className="mb-3 flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">c</span>
                <span className="text-sm font-bold">3 Solusi Taktis & Konkrit</span>
              </div>
              <div className="space-y-2">
                {analysis.solutions.map((sol, i) => (
                  <div key={i} className="flex gap-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-gold-50/40 p-3 dark:from-emerald-900/30 dark:to-gold-900/10">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-emerald-950">{i + 1}</span>
                    <p className="text-sm leading-relaxed text-emerald-700 dark:text-emerald-200/90">{sol}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={runAnalysis} className="btn-ghost w-full text-xs">
            <Sparkles size={14} /> Analisis ulang
          </button>
        </div>
      )}
    </Modal>
  );
}
