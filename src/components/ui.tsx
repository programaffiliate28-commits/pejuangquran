import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle2, Sparkles, Star } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  showClose?: boolean;
  maxWidth?: string;
}

export function Modal({ open, onClose, children, title, showClose = true, maxWidth = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-emerald-950/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className={`relative w-full ${maxWidth} max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl bg-cream-50 dark:bg-emerald-950 shadow-card animate-slide-up sm:animate-scale-in`}>
        {showClose && (
          <div className="sticky top-0 z-10 flex items-center justify-between bg-cream-50/95 dark:bg-emerald-950/95 backdrop-blur px-5 py-3.5 border-b border-emerald-100 dark:border-emerald-900/60">
            <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-100">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-emerald-500 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900"
              aria-label="Tutup"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ name, url, size = 40, className = '' }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ring-2 ring-emerald-200 dark:ring-emerald-800 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 font-bold text-white ring-2 ring-emerald-200 dark:ring-emerald-800 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || '?'}
    </div>
  );
}

interface ProgressBarProps {
  percent: number;
  className?: string;
  colorClass?: string;
}

export function ProgressBar({ percent, className = '', colorClass = 'from-gold-400 to-gold-500' }: ProgressBarProps) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/60 ${className}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-700 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

interface ToastState {
  message: string;
  visible: boolean;
}

let toastSetter: ((t: ToastState) => void) | null = null;

export function showToast(message: string) {
  if (toastSetter) toastSetter({ message, visible: true });
}

export function ToastContainer() {
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });

  const dismiss = useCallback(() => setToast((t) => ({ ...t, visible: false })), []);

  useEffect(() => {
    toastSetter = setToast;
    return () => { toastSetter = null; };
  }, []);

  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(dismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.visible, dismiss]);

  if (!toast.visible) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4 animate-slide-up">
      <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-700 px-4 py-3 text-white shadow-card dark:bg-emerald-600">
        <CheckCircle2 size={20} className="shrink-0 text-gold-300" />
        <span className="text-sm font-semibold">{toast.message}</span>
      </div>
    </div>
  );
}

interface LevelUpState {
  level: number;
  visible: boolean;
}

let levelUpSetter: ((t: LevelUpState) => void) | null = null;

export function showLevelUp(level: number) {
  if (levelUpSetter) levelUpSetter({ level, visible: true });
}

export function LevelUpModal() {
  const [state, setState] = useState<LevelUpState>({ level: 0, visible: false });

  useEffect(() => {
    levelUpSetter = setState;
    return () => { levelUpSetter = null; };
  }, []);

  useEffect(() => {
    if (state.visible) {
      const timer = setTimeout(() => setState((s) => ({ ...s, visible: false })), 4000);
      return () => clearTimeout(timer);
    }
  }, [state.visible]);

  if (!state.visible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-emerald-950/50 backdrop-blur-sm animate-fade-in">
      <div className="relative flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950 p-8 text-center shadow-card animate-scale-in">
        <div className="pointer-events-none absolute -top-10 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-gold-400/30 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-gold-300 to-gold-500 shadow-glow animate-float">
          <Star size={40} className="fill-emerald-950 text-emerald-950" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gold-300">Selamat!</p>
          <h2 className="mt-1 text-2xl font-extrabold text-white">Naik ke Level {state.level}!</h2>
          <p className="mt-2 text-sm text-emerald-200/80">Konsistensimu luar biasa. Terus tilawah, semoga Allah mudahkan.</p>
        </div>
        <div className="flex items-center gap-1.5 text-gold-300">
          <Sparkles size={16} />
          <span className="text-xs font-semibold">{getRankTitleSafe(state.level)}</span>
          <Sparkles size={16} />
        </div>
      </div>
    </div>
  );
}

function getRankTitleSafe(level: number): string {
  if (level >= 20) return 'Hafidz Qur\'an';
  if (level >= 15) return 'Musyrif Tilawah';
  if (level >= 10) return 'Pengajar Setia';
  if (level >= 5) return 'Pejuang Istiqamah';
  if (level >= 3) return 'Pencari Hidayah';
  return 'Pemula';
}
