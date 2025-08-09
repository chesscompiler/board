
let CACHE_NAME = 'chess-app-cache'; // Will be updated after fetching version
const VERSION_URL = './version.json';
const urlsToCache = [
    './index.html',
    './script.js',
    './style.css',
    './chess.js',
    './engine/stockfish-17-lite-single.js',
    './engine/stockfish-17-lite-single.wasm',
    './bot.png',
    './urlShortener.js',
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
        fetch(VERSION_URL)
            .then(response => response.json())
            .then(data => {
                CACHE_NAME = 'chess-app-cache-v' + (data.version || '1.0.0');
                return caches.open(CACHE_NAME)
                    .then(cache => cache.addAll(urlsToCache));
            })
            .catch(() => {
                // If version fetch fails, still cache essential files with default cache name
                return caches.open(CACHE_NAME)
                    .then(cache => cache.addAll(urlsToCache));
            })
    );
    self.skipWaiting();
});


self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(VERSION_URL)
            .then(response => response.json())
            .then(data => {
                const dynamicCacheName = 'chess-app-cache-v' + (data.version || '1.0.0');
                const request = event.request;

                // For navigation requests, always try cache first for offline support
                if (request.mode === 'navigate' || (request.destination === '' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
                    return caches.open(dynamicCacheName).then(cache => {
                        return cache.match('./index.html').then(response => {
                            return response || fetch(request).catch(() => cache.match('./index.html'));
                        });
                    });
                }

                // For other requests, try network first, fallback to cache
                return fetch(request)
                    .then(networkResponse => {
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
                            return networkResponse;
                        }
                        const url = request.url;
                        const shouldCache = urlsToCache.some(u => url.endsWith(u.replace('./', '/'))) ||
                            url.match(/\.(wasm|png|svg)$/i);
                        if (shouldCache) {
                            const responseToCache = networkResponse.clone();
                            caches.open(dynamicCacheName).then(cache => {
                                cache.put(request, responseToCache);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        return caches.open(dynamicCacheName).then(cache => cache.match(request));
                    });
            })
            .catch(() => {
                // If version fetch fails, fallback to default cache
                const request = event.request;
                if (request.mode === 'navigate' || (request.destination === '' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
                    return caches.open(CACHE_NAME).then(cache => {
                        return cache.match('./index.html');
                    });
                }
                return caches.open(CACHE_NAME).then(cache => cache.match(request));
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        fetch(VERSION_URL)
            .then(response => response.json())
            .then(data => {
                const dynamicCacheName = 'chess-app-cache-v' + (data.version || '1.0.0');
                return caches.keys().then(cacheNames => {
                    return Promise.all(
                        cacheNames.map(cacheName => {
                            if (cacheName !== dynamicCacheName) {
                                return caches.delete(cacheName);
                            }
                        })
                    );
                });
            })
    );
    self.clients.claim();
});