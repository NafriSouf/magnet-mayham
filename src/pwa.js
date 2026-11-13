// App-Funktionen fürs Handy: Installation (PWA), Offline-Cache, Bildschirm wach halten, Vollbild.

let deferredPrompt = null;

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  navigator.standalone === true;

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function initPwa({ installButton, iosScreen, onInstalled }) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Cache ist optional */ });
    });
  }
  if (isStandalone()) return;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installButton.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installButton.classList.add('hidden');
    onInstalled && onInstalled();
  });
  // iOS kennt kein beforeinstallprompt – dort zeigen wir eine Anleitung
  if (isIOS()) installButton.classList.remove('hidden');

  installButton.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch { /* egal */ }
      deferredPrompt = null;
      installButton.classList.add('hidden');
    } else if (isIOS()) {
      iosScreen.classList.remove('hidden');
    }
  });
}

// ---------------------------------------------------------------- Bildschirm wach halten
let wakeLock = null;
let wantWake = false;

export async function keepAwake(on) {
  wantWake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* z. B. Akku-Sparmodus – egal */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) keepAwake(true);
});

// ---------------------------------------------------------------- Vollbild
export function enterFullscreen() {
  if (isStandalone() || document.fullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const r = req.call(el, { navigationUI: 'hide' });
    if (r && r.catch) r.catch(() => { /* egal */ });
  } catch { /* egal */ }
}

export function exitFullscreen() {
  if (!document.fullscreenElement) return;
  try { document.exitFullscreen().catch(() => { /* egal */ }); } catch { /* egal */ }
}
