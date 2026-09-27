/**
 * Griglia - Service worker (versione autonoma per Azure Static Web Apps)
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * - File dell'app (stessa origine): precaricati all'installazione, poi "stale-while-revalidate":
 *   si risponde subito dalla cache (funziona senza rete) e in sottofondo si scarica la versione nuova.
 * - Pittogrammi ARASAAC, miniature YouTube e font: cache prima, poi rete (immutabili).
 * - I dati dell'utente NON passano di qui: stanno in IndexedDB (griglia_db).
 * Cambiando VERSIONE si svuota la cache dei file dell'app.
 */
const VERSIONE = '2.1.0';
const CACHE_APP = `griglia-app-${VERSIONE}`;
const CACHE_IMMAGINI = 'griglia-immagini-v1';
const CACHE_FONT = 'griglia-font-v1';
const LIMITE_IMMAGINI = 1500;

const FILE_APP = [
    './',
    './index.html',
    './gestione.html',
    './utente.html',
    './app.html',
    './manifest.json',
    './css/styles.css?v=2.1.0',
    './css/app.css?v=2.1.0',
    './js/config.js?v=2.1.0',
    './js/icone.js?v=2.1.0',
    './js/modello.js?v=2.1.0',
    './js/voce.js?v=2.1.0',
    './js/audio.js?v=2.1.0',
    './js/arasaac.js?v=2.1.0',
    './js/veloce.js?v=2.1.0',
    './js/storage.js?v=2.1.0',
    './js/video.js?v=2.1.0',
    './js/input.js?v=2.1.0',
    './js/griglia.js?v=2.1.0',
    './js/importa.js?v=2.1.0',
    './js/editor.js?v=2.1.0',
    './js/app.js?v=2.1.0',
    './js/gestione.js?v=2.1.0',
    './js/utente.js?v=2.1.0',
    './js/vendor/lame.min.js?v=1.2.1',
    './js/vendor/jszip.min.js?v=3.10.1',
    './modelli/indice.json',
    './modelli/le_mie_parole.json',
    './modelli/si_no_aiuto.json',
    './modelli/a_scuola.json',
    './modelli/io_e_gli_altri.json',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/icon-maskable-512.png',
    './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_APP)
            .then(cache => cache.addAll(FILE_APP))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(nomi => Promise.all(nomi.filter(n => n.startsWith('griglia-app-') && n !== CACHE_APP).map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Pittogrammi ARASAAC e miniature YouTube: cache prima, poi rete
    if (url.hostname === 'static.arasaac.org' || url.hostname === 'i.ytimg.com') {
        event.respondWith(cachePrima(req, CACHE_IMMAGINI, LIMITE_IMMAGINI));
        return;
    }

    // Font di Google: cache prima
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cachePrima(req, CACHE_FONT));
        return;
    }

    // File dell'app: dalla cache subito, aggiornati in sottofondo
    if (url.origin === self.location.origin) {
        event.respondWith(dallaCacheEAggiorna(event, req));
        return;
    }

    // Tutto il resto (API ARASAAC e YouTube, player): rete
});

async function dallaCacheEAggiorna(event, req) {
    const cache = await caches.open(CACHE_APP);
    // Le pagine si cercano senza query string (app.html?id=3 → app.html)
    const eNavigazione = req.mode === 'navigate';
    const inCache = await cache.match(req, { ignoreSearch: eNavigazione });
    const daRete = fetch(req).then(risposta => {
        if (risposta && risposta.ok && risposta.type === 'basic' && !risposta.redirected) {
            const chiave = eNavigazione ? new URL(req.url).pathname : req;
            cache.put(chiave, risposta.clone());
        }
        return risposta;
    });
    if (inCache) {
        event.waitUntil(daRete.catch(() => {}));
        return inCache;
    }
    try {
        return await daRete;
    } catch (e) {
        if (eNavigazione) {
            const indice = await cache.match('./index.html');
            if (indice) return indice;
        }
        throw e;
    }
}

async function cachePrima(req, nomeCache, limite) {
    const cache = await caches.open(nomeCache);
    const inCache = await cache.match(req, { ignoreVary: true });
    if (inCache) return inCache;
    const risposta = await fetch(req);
    if (risposta && (risposta.ok || risposta.type === 'opaque')) {
        cache.put(req, risposta.clone());
        if (limite) potaCache(cache, limite);
    }
    return risposta;
}

async function potaCache(cache, limite) {
    const chiavi = await cache.keys();
    if (chiavi.length <= limite) return;
    for (const k of chiavi.slice(0, chiavi.length - limite)) await cache.delete(k);
}
