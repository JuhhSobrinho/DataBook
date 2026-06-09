const CACHE_NAME = 'databook-v2';
const BASE = self.registration.scope;

// Assets principais — cacheados no install
const CORE_ASSETS = [
  BASE + 'index.html',
  BASE + 'View/index-form-databook.html',
  BASE + 'View/styles/style-global.css',
  BASE + 'Controller/main.js',
  BASE + 'Controller/draft.js',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'manifest.json',
];

// Assets de modelo (grandes — cacheados em background após install)
const MODEL_ASSETS = [
  BASE + 'Model/assets-logo.json',
  BASE + 'Model/assets-procedimentos.json',
  BASE + 'Model/assets-fichas.json',
  BASE + 'Model/assets-pda.json',
  BASE + 'Model/assets-tecnicos.json',
  BASE + 'Model/assets-idcards.json',
];

// Install: cacheia assets principais imediatamente
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove caches antigos e cacheia models em background
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Cacheia assets de modelo sem bloquear ativação
        caches.open(CACHE_NAME).then(cache => {
          MODEL_ASSETS.forEach(url => {
            fetch(url).then(r => { if (r.ok) cache.put(url, r); }).catch(() => {});
          });
        });
      })
  );
});

// Fetch: Cache First com fallback para rede
self.addEventListener('fetch', e => {
  // Ignora requisições não-GET e extensões de terceiros
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(BASE)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        if (!response || !response.ok) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => {
        // Offline e não cacheado — retorna página principal como fallback
        if (e.request.destination === 'document') {
          return caches.match(BASE + 'index.html');
        }
      });
    })
  );
});
