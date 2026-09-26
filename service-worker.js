// Service worker para instalar la web como app (PWA) y soporte offline.
// Nota: funciona cuando la web se sirve por http/https.
var CACHE_NAME = 'odissey-v26';
var PRECACHE_URLS = [
    './',
    './index.html',
    // Rutas limpias (las que pide el navegador) y tambien los .html, que
    // existen en cualquier servidor. Asi el precache sirve igual si el
    // hosting no traduce las URLs limpias.
    './tienda',
    './reglas',
    './staff',
    './noticias',
    './eventos',
    './galeria',
    './soporte',
    './admin',
    './tienda.html',
    './reglas.html',
    './staff.html',
    './noticias.html',
    './eventos.html',
    './galeria.html',
    './soporte.html',
    './admin.html',
    './theme.css',
    './site-config.js',
    './shop-config.js',
    './staff-config.js',
    './admin-config.js',
    './site-data.js',
    './manifest.json',
    './img/logo-web.webp',
    './img/favicon-48.png',
    './img/apple-touch-icon.png',
    './img/backgrounds/background1.jpg'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            // addAll() es todo-o-nada: si UNA URL falla (por ejemplo una ruta
            // limpia que el servidor no traduce), la instalacion entera se
            // cancela y el service worker no llega a activarse. Con
            // allSettled cada fallo se ignora y el resto se guarda.
            return Promise.allSettled(
                PRECACHE_URLS.map(function (url) {
                    return cache.add(new Request(url, { cache: 'reload' }));
                })
            ).then(function (results) {
                var fallidas = results.filter(function (r) { return r.status === 'rejected'; });
                if (fallidas.length) {
                    console.warn('[sw] no se pudieron precachear ' + fallidas.length +
                        ' de ' + PRECACHE_URLS.length + ' rutas (se ignoran):',
                        PRECACHE_URLS.filter(function (_, i) { return results[i].status === 'rejected'; }));
                }
            });
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (key) { return key !== CACHE_NAME; })
                    .map(function (key) { return caches.delete(key); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (event) {
    // Solo cacheamos peticiones http / https (excluyendo esquemas chrome-extension, etc.)
    if (!event.request.url.startsWith('http')) return;

    // Estrategia red-primero: siempre se intenta la red (así los cambios se ven al instante);
    // la caché se actualiza en el camino y solo se usa como respaldo sin conexión.
    event.respondWith(
        fetch(event.request).then(function (response) {
            if (response && response.status === 200 && response.type === 'basic') {
                var copy = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(event.request, copy);
                });
            }
            return response;
        }).catch(function () {
            return caches.match(event.request).then(function (cached) {
                if (cached) return cached;
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return new Response('', { status: 504, statusText: 'Sin conexión' });
            });
        })
    );
});
