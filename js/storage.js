/**
 * Griglia - Archivio locale: comunicatori, archivio video, immagini e audio, modelli
 * AssistiveTech.it - Training Cognitivo / Strumenti (versione autonoma per Azure Static Web Apps)
 *
 * Modello: UN DISPOSITIVO = UN UTENTE. Nessun server, nessun login.
 * Tutto vive nel browser del dispositivo, in IndexedDB (database "griglia_db"):
 *   comunicatori  { id_comunicatore, nome, documento, versione, n_pagine, n_celle, attivo, data_creazione, data_modifica, ts_modifica }
 *   video         { id_video, id_youtube, titolo, categoria, inizio, fine, data_creazione }
 *   media         { id, blob, tipo, byte, data_creazione }   immagini e registrazioni delle celle
 * Nel documento le immagini e gli audio caricati sono riferimenti "idb:<id>"; Griglia.Media li
 * trasforma in object URL (precaricati prima del rendering, così la griglia resta sincrona).
 * In localStorage restano solo le preferenze del dispositivo.
 */
window.Griglia = window.Griglia || {};

// ---------- IndexedDB ----------
Griglia.DB = (function () {
    const NOME = 'griglia_db';
    const VERSIONE = 1;
    let promessa = null;

    function apri() {
        if (promessa) return promessa;
        promessa = new Promise((risolvi, rifiuta) => {
            if (!('indexedDB' in window)) { rifiuta(new Error('Questo browser non può salvare dati sul dispositivo')); return; }
            const req = indexedDB.open(NOME, VERSIONE);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('comunicatori')) db.createObjectStore('comunicatori', { keyPath: 'id_comunicatore', autoIncrement: true });
                if (!db.objectStoreNames.contains('video')) db.createObjectStore('video', { keyPath: 'id_video', autoIncrement: true });
                if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
            };
            req.onsuccess = () => risolvi(req.result);
            req.onerror = () => { promessa = null; rifiuta(new Error('Archivio del dispositivo non disponibile (navigazione privata?)')); };
            req.onblocked = () => console.warn('[Griglia] Apertura archivio bloccata da un\'altra scheda');
        });
        return promessa;
    }

    /** Esegue fn(store) in una transazione e risolve con il risultato dell'ultima richiesta (o di fn) al termine */
    async function tx(nomeStore, modo, fn) {
        const db = await apri();
        return new Promise((risolvi, rifiuta) => {
            const t = db.transaction(nomeStore, modo);
            const store = t.objectStore(nomeStore);
            let risultato;
            const r = fn(store);
            if (r && typeof r.onsuccess !== 'undefined') r.onsuccess = () => { risultato = r.result; };
            else risultato = r;
            t.oncomplete = () => risolvi(risultato);
            t.onerror = () => rifiuta(erroreSpazio(t.error));
            t.onabort = () => rifiuta(erroreSpazio(t.error));
        });
    }

    function erroreSpazio(e) {
        if (e && e.name === 'QuotaExceededError') return new Error('Spazio del dispositivo esaurito: elimina comunicatori o registrazioni non usati');
        return e || new Error('Operazione sull\'archivio non riuscita');
    }

    const get = (store, chiave) => tx(store, 'readonly', s => s.get(chiave));
    const tutti = (store) => tx(store, 'readonly', s => s.getAll());
    const metti = (store, valore) => tx(store, 'readwrite', s => s.put(valore));
    const togli = (store, chiave) => tx(store, 'readwrite', s => s.delete(chiave));

    /** Chiede al browser di non cancellare i dati da solo (quando lo spazio scarseggia) */
    function persistente() {
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignora */ }
    }

    return { apri, tx, get, tutti, metti, togli, persistente };
})();

// ---------- Immagini e audio delle celle ----------
Griglia.Media = (function () {
    const PREFISSO = 'idb:';
    const urls = new Map();   // id → object URL

    const eRif = (u) => typeof u === 'string' && u.startsWith(PREFISSO);
    const idDa = (u) => u.slice(PREFISSO.length);

    /** Salva un blob e restituisce il riferimento "idb:<id>" (già risolvibile) */
    async function salva(blob, prefisso = 'm') {
        const id = Griglia.util.uid(prefisso);
        await Griglia.DB.metti('media', { id, blob, tipo: blob.type || '', byte: blob.size || 0, data_creazione: Griglia.util.dataOra() });
        urls.set(id, URL.createObjectURL(blob));
        return PREFISSO + id;
    }

    /** URL utilizzabile in <img>/<audio>: per i riferimenti locali l'object URL (null se non precaricato) */
    function risolvi(url) {
        if (!eRif(url)) return url || null;
        return urls.get(idDa(url)) || null;
    }

    async function blob(url) {
        if (!eRif(url)) return null;
        const r = await Griglia.DB.get('media', idDa(url));
        return r ? r.blob : null;
    }

    /** Riferimenti "idb:" usati da un documento */
    function riferimenti(doc) {
        const out = new Set();
        (doc && doc.pagine || []).forEach(p => (p.celle || []).forEach(c => {
            if (c.immagine && eRif(c.immagine.url)) out.add(idDa(c.immagine.url));
            if (c.audio && eRif(c.audio.url)) out.add(idDa(c.audio.url));
        }));
        return out;
    }

    /** Carica in memoria gli object URL di tutti i media del documento (da chiamare prima del rendering) */
    async function precarica(doc) {
        const mancanti = [...riferimenti(doc)].filter(id => !urls.has(id));
        if (!mancanti.length) return;
        await Griglia.DB.tx('media', 'readonly', s => {
            mancanti.forEach(id => {
                const r = s.get(id);
                r.onsuccess = () => { if (r.result && r.result.blob) urls.set(id, URL.createObjectURL(r.result.blob)); };
            });
        });
    }

    function blobInDataUrl(b) {
        return new Promise((ris, rif) => { const fr = new FileReader(); fr.onload = () => ris(fr.result); fr.onerror = () => rif(fr.error); fr.readAsDataURL(b); });
    }

    /** Copia del documento con i media locali incorporati come data URL (per esportare o fare copie di sicurezza) */
    async function incorpora(doc) {
        const copia = Griglia.Modello.clona(doc);
        for (const p of copia.pagine || []) {
            for (const c of p.celle || []) {
                if (c.immagine && eRif(c.immagine.url)) {
                    const b = await blob(c.immagine.url);
                    c.immagine = b ? { tipo: 'dati', url: await blobInDataUrl(b) } : { tipo: 'nessuna' };
                }
                if (c.audio && eRif(c.audio.url)) {
                    const b = await blob(c.audio.url);
                    if (b) c.audio = Object.assign({}, c.audio, { tipo: 'dati', url: await blobInDataUrl(b) });
                    else c.audio = null;
                }
            }
        }
        return copia;
    }

    /** Elimina i media che nessun comunicatore usa più */
    async function pulisci() {
        const usati = new Set();
        (await Griglia.DB.tutti('comunicatori')).forEach(r => riferimenti(r.documento).forEach(id => usati.add(id)));
        const ids = await Griglia.DB.tx('media', 'readonly', s => s.getAllKeys());
        const orfani = (ids || []).filter(id => !usati.has(id));
        if (!orfani.length) return 0;
        await Griglia.DB.tx('media', 'readwrite', s => { orfani.forEach(id => s.delete(id)); });
        orfani.forEach(id => { if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); } });
        return orfani.length;
    }

    return { PREFISSO, eRif, salva, risolvi, blob, precarica, incorpora, pulisci, blobInDataUrl };
})();

// ---------- Archivio ----------
Griglia.Archivio = (function () {
    const U = () => Griglia.util;
    const M = () => Griglia.Modello;

    function meta(r, conDocumento = false) {
        const out = {
            id_comunicatore: r.id_comunicatore, nome: r.nome, versione: r.versione,
            n_pagine: r.n_pagine, n_celle: r.n_celle, attivo: !!r.attivo,
            data_creazione: r.data_creazione, data_modifica: r.data_modifica
        };
        if (conDocumento) out.documento = r.documento;
        return out;
    }

    async function riga(id) {
        const r = await Griglia.DB.get('comunicatori', parseInt(id, 10));
        if (!r) throw new Error('Comunicatore non trovato su questo dispositivo');
        return r;
    }

    function prepara(documento, nome) {
        const doc = M().normalizza(documento);
        if (nome) doc.nome = String(nome).slice(0, 200);
        const n = M().conta(doc);
        return { doc, n };
    }

    async function nuovaRiga(documento, nome, attivo) {
        const { doc, n } = prepara(documento, nome);
        const adesso = U().dataOra();
        const r = {
            nome: doc.nome, documento: doc, versione: 1, n_pagine: n.pagine, n_celle: n.celle,
            attivo: attivo ? 1 : 0, data_creazione: adesso, data_modifica: adesso, ts_modifica: Date.now()
        };
        r.id_comunicatore = await Griglia.DB.tx('comunicatori', 'readwrite', s => s.add(r));
        return r;
    }

    const locale = {
        /** Elenco senza documenti: prima quello in uso, poi i più recenti */
        async lista() {
            const righe = await Griglia.DB.tutti('comunicatori');
            return righe.sort((a, b) => (b.attivo - a.attivo) || (b.ts_modifica - a.ts_modifica)).map(r => meta(r));
        },
        async carica(id) { return meta(await riga(id), true); },
        async crea(nome, documento) {
            const esistenti = await Griglia.DB.tutti('comunicatori');
            const r = await nuovaRiga(documento, nome, esistenti.length === 0);   // il primo creato è subito quello in uso
            return meta(r, true);
        },
        async salva(id, documento) {
            const r = await riga(id);
            const { doc, n } = prepara(documento);
            Object.assign(r, { documento: doc, nome: doc.nome || r.nome, versione: r.versione + 1, n_pagine: n.pagine, n_celle: n.celle, data_modifica: U().dataOra(), ts_modifica: Date.now() });
            await Griglia.DB.metti('comunicatori', r);
            return meta(r);
        },
        async rinomina(id, nome) {
            const r = await riga(id);
            nome = String(nome || '').trim().slice(0, 200);
            if (!nome) throw new Error('Nome mancante');
            r.nome = nome;
            r.documento.nome = nome;
            r.versione++;
            r.data_modifica = U().dataOra();
            r.ts_modifica = Date.now();
            await Griglia.DB.metti('comunicatori', r);
            return meta(r);
        },
        async duplica(id) {
            const r = await riga(id);
            return meta(await nuovaRiga(M().clona(r.documento), `Copia di ${r.nome}`, false));
        },
        async elimina(id) {
            const r = await riga(id);
            await Griglia.DB.togli('comunicatori', r.id_comunicatore);
            if (r.attivo) {
                // Passa il testimone al più recente rimasto
                const resto = (await Griglia.DB.tutti('comunicatori')).sort((a, b) => b.ts_modifica - a.ts_modifica);
                if (resto[0]) { resto[0].attivo = 1; await Griglia.DB.metti('comunicatori', resto[0]); }
            }
            Griglia.Media.pulisci().catch(e => console.warn('[Griglia] Pulizia media:', e));
        },
        /** Comunicatore che l'Area Utente apre (quello in uso, altrimenti il più recente) */
        async attivo() {
            const l = await this.lista();
            return l[0] || null;
        },
        async impostaAttivo(id) {
            id = parseInt(id, 10);
            await Griglia.DB.tx('comunicatori', 'readwrite', s => {
                const req = s.openCursor();
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) return;
                    const v = cur.value;
                    const nuovo = v.id_comunicatore === id ? 1 : 0;
                    if (v.attivo !== nuovo) { v.attivo = nuovo; cur.update(v); }
                    cur.continue();
                };
            });
        }
    };

    // ---------- Copia di sicurezza (tutto il dispositivo in un file) ----------
    const FORMATO_BACKUP = 'griglia-backup';

    async function creaBackup() {
        const righe = (await Griglia.DB.tutti('comunicatori')).sort((a, b) => a.ts_modifica - b.ts_modifica);
        const comunicatori = [];
        for (const r of righe) comunicatori.push({ nome: r.nome, attivo: !!r.attivo, data_creazione: r.data_creazione, documento: await Griglia.Media.incorpora(r.documento) });
        const video = (await Griglia.DB.tutti('video')).map(v => ({ id_youtube: v.id_youtube, titolo: v.titolo, categoria: v.categoria, inizio: v.inizio, fine: v.fine }));
        return { formato: FORMATO_BACKUP, versione: 1, app: 'Griglia', data: U().dataOra(), comunicatori, video };
    }

    function eBackup(json) { return !!(json && json.formato === FORMATO_BACKUP && Array.isArray(json.comunicatori)); }

    /** Aggiunge al dispositivo i comunicatori e i video di una copia di sicurezza (non cancella nulla) */
    async function ripristinaBackup(json, avanzamento) {
        if (!eBackup(json)) throw new Error('Il file non è una copia di sicurezza di Griglia');
        const esistenti = await Griglia.DB.tutti('comunicatori');
        const nessunoInUso = !esistenti.some(r => r.attivo);
        let nComunicatori = 0, nVideo = 0, fatti = 0;
        for (const c of json.comunicatori) {
            const doc = M().normalizza(c.documento);
            await Griglia.Importa.caricaMediaIncorporati(doc);
            await nuovaRiga(doc, c.nome || doc.nome, nessunoInUso && c.attivo);
            nComunicatori++;
            if (avanzamento) avanzamento(++fatti, json.comunicatori.length);
        }
        if (!(await Griglia.DB.tutti('comunicatori')).some(r => r.attivo)) {
            const primo = (await locale.lista())[0];
            if (primo) await locale.impostaAttivo(primo.id_comunicatore);
        }
        for (const v of (json.video || [])) {
            try { await Griglia.Video.archivio.salva(v); nVideo++; } catch (e) { /* video non valido: si salta */ }
        }
        return { comunicatori: nComunicatori, video: nVideo };
    }

    // ---------- Modelli ----------
    const modelli = {
        async indice() {
            const r = await fetch('modelli/indice.json', { cache: 'no-cache' });
            if (!r.ok) throw new Error('Elenco modelli non disponibile');
            return r.json();
        },
        async carica(file) {
            if (!/^[a-z0-9_-]+\.json$/i.test(file)) throw new Error('Modello non valido');
            const r = await fetch(`modelli/${file}`, { cache: 'no-cache' });
            if (!r.ok) throw new Error('Modello non trovato');
            return M().normalizza(await r.json());
        }
    };

    /** Ridimensiona un'immagine lato client (max lato) e la restituisce come Blob */
    function ridimensionaImmagine(file, maxLato = 600, qualita = 0.88) {
        return new Promise((risolvi, rifiuta) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const scala = Math.min(1, maxLato / Math.max(img.width, img.height));
                if (scala === 1 && file.size < 400 * 1024) { risolvi(file); return; }
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * scala);
                c.height = Math.round(img.height * scala);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                const tipo = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg';
                c.toBlob(b => b ? risolvi(b) : rifiuta(new Error('Conversione immagine non riuscita')), tipo, qualita);
            };
            img.onerror = () => { URL.revokeObjectURL(url); rifiuta(new Error('File immagine non leggibile')); };
            img.src = url;
        });
    }

    /** Salva un'immagine sul dispositivo; restituisce il riferimento "idb:<id>" */
    async function uploadImmagine(fileOBlob, prefisso = 'img') {
        const blob = fileOBlob instanceof Blob ? fileOBlob : new Blob([fileOBlob]);
        return Griglia.Media.salva(blob, prefisso);
    }

    /** Salva un audio (mp3, m4a…) sul dispositivo; restituisce il riferimento "idb:<id>" */
    async function uploadAudio(blob, estensione = 'mp3', prefisso = 'reg') {
        return Griglia.Media.salva(blob, prefisso);
    }

    /** Converte un data URL in Blob (per le immagini base64 importate da .grd/.obz) */
    function dataUrlABlob(dataUrl) {
        const [testa, dati] = dataUrl.split(',');
        const tipo = (testa.match(/data:([^;]+)/) || [])[1] || 'image/png';
        const bin = atob(dati);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: tipo });
    }

    /** Spazio occupato e disponibile (se il browser lo dice) */
    async function spazio() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const s = await navigator.storage.estimate();
                return { usato: s.usage || 0, totale: s.quota || 0 };
            }
        } catch (e) { /* ignora */ }
        return null;
    }

    return { locale, modelli, creaBackup, eBackup, ripristinaBackup, ridimensionaImmagine, uploadImmagine, uploadAudio, dataUrlABlob, spazio };
})();
