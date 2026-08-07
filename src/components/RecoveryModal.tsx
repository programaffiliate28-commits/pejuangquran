import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { submitRecoveryTask } from '@/lib/sanction-utils'; // PENTING: Manggil fungsi recovery terpadu
import { X, Upload, CheckCircle2, Loader2, FileImage, Sparkles } from 'lucide-react';

interface RecoveryModalProps {
  open: boolean;
  onClose: () => void;
  totalHutang: number;
  onRecovered: () => void;
}

const RECOVERY_TASKS = [
  {
    id: 'ringkasan_ceramah' as const,
    title: 'Ringkasan Ceramah',
    desc: 'Tuliskan ringkasan singkat (3-5 kalimat) dari ceramah/kajian islami yang kamu ikuti atau tonton.',
    placeholder: 'Ringkasan Kajian tentang Sabar: 1. Sabar ada 3 jenis...',
    requireImage: false,
  },
  {
    id: 'tafsir_hadits' as const,
    title: 'Tafsir Hadits',
    desc: 'Bagikan 1 hadits shahih beserta tafsir/pesan utamanya secara ringkas.',
    placeholder: 'Hadits "Senyummu di hadapan saudaramu adalah sedekah" (HR. Tirmidzi)...',
    requireImage: false,
  },
  {
    id: 'asbabun_nuzul' as const,
    title: 'Asbabun Nuzul Ayat',
    desc: 'Bagikan asbabun nuzul (kisah turunnya) 1 ayat Al-Qur\'an pilihanmu.',
    placeholder: 'Surah Al-Insyirah ayat 5-6: "Bersama kesulitan ada kemudahan"...',
    requireImage: false,
  },
];

export function RecoveryModal({ open, onClose, totalHutang, onRecovered }: RecoveryModalProps) {
  const { user, refreshProfile, setProfile } = useAuth();
  const [selectedTaskId, setSelectedTaskId] = useState<string>('ringkasan_ceramah');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const currentTask = RECOVERY_TASKS.find((t) => t.id === selectedTaskId) || RECOVERY_TASKS[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (uploading) return; // Cegah double-click / submission ganda

    if (!content.trim()) {
      showToast('Isi materi / ringkasan tugas sanksi tidak boleh kosong!');
      return;
    }

    if (!user) {
      showToast('Sesi login berakhir. Silakan re-login.');
      return;
    }

    setUploading(true);
    try {
      const userId = user.id;
      let imageUrl: string | null = null;

      // 1. Upload foto bukti ke storage jika user melampirkan file
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const filePath = `recovery_proofs/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('pap')
          .upload(filePath, file);

        if (uploadError) {
          throw new Error(`Gagal mengunggah gambar: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('pap')
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      // 2. Panggil fungsi submitRecoveryTask dari sanction-utils
      // Fungsi ini: Insert Feed Recovery + Update profiles (hutang_sanksi - 1, xp + 20)
      // Optimistic local state update agar UI merespons dalam milidetik
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              hutang_sanksi: Math.max(0, prev.hutang_sanksi - 1),
              xp: prev.xp + 20,
              level: Math.max(1, Math.floor((prev.xp + 20) / 100) + 1),
            }
          : null
      );

      const res = await submitRecoveryTask(userId, currentTask.id, content, imageUrl);

      if (!res.success) {
        // Rollback optimistic update jika gagal
        await refreshProfile();
        throw new Error(res.error || 'Gagal memproses tugas recovery');
      }

      showToast('Tugas recovery berhasil! Sanksi dilunasi (+20 XP).');
      setContent('');
      setFile(null);

      // 3. Sync penuh dengan database (source of truth)
      await refreshProfile();

      if (onRecovered) {
        onRecovered();
      }

      onClose();

    } catch (err: any) {
      console.error('Recovery submission error:', err);
      showToast(`Gagal: ${err?.message || 'Terjadi kesalahan'}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-5 bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-500" size={20} />
            <h3 className="text-base font-bold text-emerald-950 dark:text-emerald-100">
              Tugas Recovery & Edukasi
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Sisa sanksi: <span className="font-bold text-red-500">{totalHutang}</span>. Bagikan ilmu atau ringkasan bermanfaat untuk melunasi 1 sanksi.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              Pilih Jenis Tugas Berfaedah
            </label>
            <div className="space-y-2">
              {RECOVERY_TASKS.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`cursor-pointer rounded-xl border p-2.5 text-xs transition-all ${
                    selectedTaskId === task.id
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-900 dark:text-emerald-100">
                      {task.title}
                    </span>
                    {selectedTaskId === task.id && (
                      <CheckCircle2 size={14} className="text-emerald-600" />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-normal leading-relaxed">
                    {task.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-emerald-900 dark:text-emerald-200 mb-1">
              Materi / Teks Ringkasan Informatif <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={currentTask.placeholder}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent p-3 text-xs focus:border-emerald-600 focus:outline-none dark:text-slate-100 leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-emerald-900 dark:text-emerald-200 mb-1">
              Upload Lampiran Foto {currentTask.requireImage ? <span className="text-red-500">*</span> : '(Opsional)'}
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-emerald-300 dark:border-slate-700 rounded-xl p-2.5 bg-emerald-50/30 dark:bg-slate-800/40 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors text-center"
            >
              {file ? (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <FileImage size={18} />
                  <span className="text-xs font-semibold truncate max-w-[200px]">
                    {file.name}
                  </span>
                </div>
              ) : (
                <>
                  <Upload size={18} className="text-emerald-600 mb-0.5" />
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Klik untuk melampirkan foto / bukti
                  </p>
                  <p className="text-[10px] text-slate-400">JPG, PNG (Maks 5MB)</p>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {uploading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                'Kirim & Melunasi Sanksi'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}