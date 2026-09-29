// OJO AL SUBIR ESTE NÚMERO: dentro de una caché no se borra nada nunca; en
// `activate` solo se borran las caché que se LLAMEN distinto. Como cada
// despliegue entra con su etiqueta ?v= nueva, las versiones viejas se quedaban
// ahí para siempre. Súbelo cada vez que cambie la etiqueta de reparto.js.
const CACHE_NAME = 'novapack-repartidor-v17';
// App-shell propio (mismo origen): debe cachearse entero o falla el install.
// ocr.js (lee los albaranes con la cámara) y sentry-config.js los carga
// reparto.html pero no estaban en esta lista: sin cobertura, faltaban.
const urlsToCache = [
    '/reparto.html',
    '/reparto.css',
    '/reparto.js',
    '/copiloto.js',
    '/ocr.js',
    '/sentry-config.js',
    '/manifest-repartidor.json',
    '/firebase-config.js',
    '/libs/html5-qrcode.min.js',
    '/icon_new.png',
    '/phantom-engine.js'
];
// Dependencias externas críticas para ARRANCAR EN FRÍO sin red. Se cachean
// una a una best-effort (si una falla no aborta el install). Sin el SDK de
// Firebase en caché, waitForFirebase() se quedaba en bucle offline.
const cdnToCache = [
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-storage-compat.js'
];

self.addEventListener('install', event => {
    // Do NOT call skipWaiting() here — let the page control activation
    // via postMessage('skipWaiting') to avoid reload loops on iOS
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(urlsToCache).then(function() {
                // CDN best-effort: cada una por separado, los fallos no rompen
                return Promise.all(cdnToCache.map(function(u) {
                    return cache.add(u).catch(function(e) {
                        console.warn('[SW] no pude precachear', u, e && e.message);
                    });
                }));
            });
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) { return name !== CACHE_NAME; })
                           .map(function(name) { return caches.delete(name); })
            );
        }).then(function() { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Solo dejar pasar SIN tocar las llamadas de DATOS en vivo (API): éstas
    // NUNCA deben servirse de caché. El SDK estático (gstatic/firebasejs),
    // fuentes y Sentry SÍ se cachean para el arranque en frío offline.
    if (
        url.hostname.indexOf('firestore.googleapis.com') > -1 ||
        url.hostname.indexOf('firebaseinstallations.googleapis.com') > -1 ||
        url.hostname.indexOf('identitytoolkit.googleapis.com') > -1 ||
        url.hostname.indexOf('securetoken.googleapis.com') > -1 ||
        url.hostname.indexOf('firebasestorage.googleapis.com') > -1 ||
        url.hostname.indexOf('firebasedatabase') > -1
    ) {
        return; // datos en vivo → red directa
    }

    // Resto (app-shell + SDK/fuentes/sentry CDN): network-first con caída a
    // caché → offline en frío funciona si se cargó online alguna vez.
    event.respondWith(
        fetch(event.request).then(response => {
            if (response && (response.status === 200 || response.type === 'opaque')) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
            }
            return response;
        }).catch(() => {
            // ignoreSearch: la página pide "reparto.js?v=20260929_scan" y en la
            // memoria del móvil está guardado "/reparto.js" a secas. Sin esta
            // opción el buscador los trata como dos cosas distintas, no encontraba
            // NADA y se acababa devolviendo la página HTML donde se esperaba
            // programa: el navegador soltaba «Unexpected token '<'» y, sin
            // cobertura y arrancando de cero, la app se quedaba en pantalla muerta.
            return caches.match(event.request, { ignoreSearch: true }).then(function(hit) {
                if (hit) return hit;
                // La página de la app solo vale como respuesta cuando lo que se
                // pedía ERA una página. Para un .js, una fuente o una imagen,
                // devolver HTML es peor que fallar: mejor un error limpio.
                if (event.request.mode === 'navigate') return caches.match('/reparto.html');
                return new Response('', { status: 504, statusText: 'Sin conexion y sin copia guardada' });
            });
        })
    );
});

// Handle push notifications in background
self.addEventListener('push', event => {
    var data = { title: 'Novapack Reparto', body: 'Nuevo aviso' };
    try {
        if (event.data) data = event.data.json();
    } catch(e) {}

    event.waitUntil(
        self.registration.showNotification(data.title || 'Novapack Reparto', {
            body: data.body || '',
            icon: '/icon_new.png',
            badge: '/icon_new.png',
            tag: 'novapack-' + Date.now(),
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 300]
        })
    );
});

// When user taps notification, focus or open the app
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // If app is already open, focus it
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url.includes('reparto') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open it
            if (clients.openWindow) {
                return clients.openWindow('/reparto.html');
            }
        })
    );
});

// Allow app to trigger skipWaiting for immediate activation
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

// Periodic background sync (keeps SW alive)
self.addEventListener('periodicsync', event => {
    if (event.tag === 'keep-alive') {
        event.waitUntil(Promise.resolve());
    }
});
