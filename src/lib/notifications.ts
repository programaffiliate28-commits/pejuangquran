const REMINDER_TIMES = [
  { hour: 6,  minute: 0,  label: 'Pagi' },
  { hour: 12, minute: 30, label: 'Siang' },
  { hour: 18, minute: 0,  label: 'Sore/Malam' },
];

const STORAGE_KEY = 'pq-notif-scheduled';

export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function getNotificationStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Schedules local notification reminders for the 3 tilawah times.
 * Uses setTimeout to fire notifications at the scheduled time today.
 * Re-schedules on app load. Persists schedule state in localStorage.
 */
export function scheduleTilawahReminders(): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  let scheduled = false;

  for (const t of REMINDER_TIMES) {
    const target = new Date();
    target.setHours(t.hour, t.minute, 0, 0);
    if (target.getTime() <= now.getTime()) continue;

    const delay = target.getTime() - now.getTime();
    setTimeout(() => {
      if (Notification.permission === 'granted') {
        navigator.serviceWorker?.ready?.then((reg) => {
          reg.showNotification("Pejuang Qur'an — Tilawah", {
            body: `Saatnya tilawah waktu ${t.label}. Jangan sampai terlewat!`,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            vibrate: [100, 50, 100],
            tag: `tilawah-${t.label}`,
          });
        }).catch(() => {
          new Notification("Pejuang Qur'an — Tilawah", {
            body: `Saatnya tilawah waktu ${t.label}. Jangan sampai terlewat!`,
          });
        });
      }
    }, delay);
    scheduled = true;
  }

  if (scheduled) {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  }
}
