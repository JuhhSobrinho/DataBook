// Nome FIXO de proposito: o conteudo se atualiza sozinho (rede primeiro, abaixo), entao nao e mais
// preciso trocar este nome a cada alteracao. So mude se quiser descartar todo o cache offline.
const CACHE_NAME = 'databook-cache';
const BASE = self.registration.scope;

// Assets principais — cacheados no install
const CORE_ASSETS = [
  BASE + 'index.html',
  BASE + 'View/index-form-databook.html',
  BASE + 'View/styles/style-global.css',
  BASE + 'Controller/main.js',
  BASE + 'Controller/draft.js',
  BASE + 'Controller/ppci.js',
  BASE + 'Controller/pendencias.js',
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
  BASE + 'Model/assets-cover.json',
  BASE + 'Model/assets-clientes.json',
];

// Install: baixa os assets principais direto da rede (ignora o cache HTTP) para o cache offline
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(CORE_ASSETS.map(url =>
        fetch(new Request(url, {cache:'reload'})).then(r => { if (r.ok) return cache.put(url, r); }).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove caches de versoes antigas (nomes antigos: databook-vN) e, em background,
// guarda os models que ainda nao estao no cache (os ja guardados se atualizam no fetch, abaixo)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        caches.open(CACHE_NAME).then(cache => {
          MODEL_ASSETS.forEach(url => {
            cache.match(url).then(hit => {
              if (hit) return;
              fetch(url).then(r => { if (r.ok) cache.put(url, r); }).catch(() => {});
            });
          });
        });
      })
  );
});

// Fetch: REDE PRIMEIRO, com cache como reserva (offline).
// Online, toda requisicao e revalidada no servidor (cache:'no-cache' = requisicao condicional:
// se nada mudou o servidor responde 304 e nao baixa de novo; se mudou, traz a versao nova) e a
// copia do cache offline e atualizada. Offline, serve a ultima copia guardada.
self.addEventListener('fetch', e => {
  // Ignora requisições não-GET e extensões de terceiros
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(BASE)) return;
  e.respondWith(redePrimeiro(e.request));
});

async function redePrimeiro(req){
  const cache = await caches.open(CACHE_NAME);
  try{
    const resp = await fetch(req, {cache:'no-cache'});
    if (resp && resp.ok){
      // so regrava no cache se mudou (evita reescrever ~12MB dos models a cada abertura)
      const cached = await cache.match(req);
      const etag = resp.headers.get('etag'), lastMod = resp.headers.get('last-modified');
      const igual = cached && (etag || lastMod) &&
        cached.headers.get('etag') === etag && cached.headers.get('last-modified') === lastMod;
      if (!igual) cache.put(req, resp.clone());
    }
    return resp;
  }catch(err){
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.destination === 'document'){
      const idx = await cache.match(BASE + 'index.html');
      if (idx) return idx;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
