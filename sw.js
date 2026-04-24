// sw.js — Service Worker: caché + alertas de descanso

const CACHE_NAME = 'gymlogger-v2';
const ASSETS = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.json'];

// ─── INSTALACIÓN ─────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ─── ACTIVACIÓN ──────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── FETCH — cache first, fallback network ────────────────────────────────────
self.addEventListener('fetch', e => {
  // Solo cachear GET del mismo origen
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      // Actualizar caché con recursos nuevos (estrategia stale-while-revalidate ligera)
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return resp;
    }))
  );
});

// ─── ALERTAS DE DESCANSO ─────────────────────────────────────────────────────
let timerDescanso = null;

self.addEventListener('message', e => {
  if (e.data.tipo === 'INICIAR_DESCANSO') {
    if (timerDescanso) clearTimeout(timerDescanso);

    const { segundos, ejercicio, proximaSerie } = e.data;

    timerDescanso = setTimeout(() => {
      self.registration.showNotification('⏱ ¡Fin del descanso!', {
        body:               `${ejercicio} — Serie ${proximaSerie}`,
        icon:               '/icons/icon-192.png',
        badge:              '/icons/icon-192.png',
        tag:                'descanso-activo',
        renotify:           true,
        vibrate:            [300, 100, 300, 100, 300],
        requireInteraction: false,
        silent:             false
      });
    }, segundos * 1000);
  }

  if (e.data.tipo === 'CANCELAR_DESCANSO') {
    if (timerDescanso) {
      clearTimeout(timerDescanso);
      timerDescanso = null;
    }
  }
});

// ─── CLICK EN NOTIFICACIÓN ────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const app = cs.find(c => c.visibilityState === 'visible') || cs[0];
      if (app) return app.focus();
      return clients.openWindow('/');
    })
  );
});
