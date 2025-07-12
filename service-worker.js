const CACHE_NAME = 'chess-app-cache-v2';
const urlsToCache = [
    '/index.html',
    '/script.js',
    '/style.css',
    '/chess.js',
    '/engine/stockfish-17-lite-single.js',
    '/engine/stockfish-17-lite-single.wasm',
    '/bot.png',
    'https://chesscompiler.github.io/assests/bP.svg',
    'https://chesscompiler.github.io/assests/wP.svg',
    'https://chesscompiler.github.io/assests/bR.svg',
    'https://chesscompiler.github.io/assests/wR.svg',
    'https://chesscompiler.github.io/assests/bN.svg',
    'https://chesscompiler.github.io/assests/wN.svg',
    'https://chesscompiler.github.io/assests/bB.svg',
    'https://chesscompiler.github.io/assests/wB.svg',
    'https://chesscompiler.github.io/assests/bQ.svg',
    'https://chesscompiler.github.io/assests/wQ.svg',
    'https://chesscompiler.github.io/assests/bK.svg',
    'https://chesscompiler.github.io/assests/wK.svg'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.origin === location.origin) {
        const isCoreFile = requestUrl.pathname === '/' ||
                           requestUrl.pathname === '/index.html' ||
                           requestUrl.pathname === '/script.js' ||
                           requestUrl.pathname === '/style.css';

        if (isCoreFile) {
            event.respondWith(
                fetch(event.request)
                .then(networkResponse => {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
            );
            return;
        }
    }

    event.respondWith(
        caches.match(event.request)
        .then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(networkResponse => {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
}); 