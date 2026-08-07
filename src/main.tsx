// Script pembersih watermark Bolt
if (typeof window !== 'undefined') {
  const removeBoltBadge = () => {
    // 1. Cari elemen berdasarkan atribut, class, href, atau ID
    const selectors = [
      'a[href*="bolt.new"]',
      'a[href*="stackblitz"]',
      '[class*="bolt-watermark"]',
      '[id*="bolt-watermark"]',
      '#bolt-watermark'
    ];
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        // Hapus elemen atau sembunyikan induknya
        const target = el.closest('div') || el;
        target.remove();
      });
    });

    // 2. Trik khusus Shadow DOM / Overlays dengan Z-Index sangat tinggi
    document.querySelectorAll('body > div, body > a').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' && parseInt(style.zIndex || '0') > 9000) {
        if (el.innerHTML.toLowerCase().includes('bolt') || el.innerHTML.toLowerCase().includes('made')) {
          el.remove();
        }
      }
    });
  };

  // Jalankan langsung & pantau jika Bolt mencoba memunculkannya lagi
  removeBoltBadge();
  window.addEventListener('DOMContentLoaded', removeBoltBadge);
  
  const observer = new MutationObserver(removeBoltBadge);
  observer.observe(document.body, { childList: true, subtree: true });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { scheduleTilawahReminders } from './lib/notifications';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

scheduleTilawahReminders();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
