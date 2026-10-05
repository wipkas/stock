// Service Worker KSP Check - PWA & Homescreen Shortcut Support
const CACHE_NAME = 'kspcheck-pwa-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Memenuhi syarat PWA installability Chrome / Android
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
