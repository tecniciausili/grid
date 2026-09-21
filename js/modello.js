/**
 * Griglia - Modello dati del comunicatore
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Tre concetti soltanto: comunicatore → pagina → cella.
 * Ogni cella fa una cosa: "dice" un testo, oppure "apre" una pagina, oppure "riproduce" un video.
 * Una cella che dice o apre può parlare con la voce sintetica oppure con una registrazione (audio).
 *
 * Comunicatore {
 *   schema, nome, lingua, paginaHomeId,
 *   barra: { frase, parla, cancellaParola, cancellaTutto, home, indietro, dimensione (1 = normale, fino a 5) },
 *   aspetto: { preset: sfondo|bordo|entrambi|neutro, testo: S|M|L (vecchio), posizioneTesto: sotto|sopra, mostraEtichette,
 *              testoScala (0.6–3, cursore del testo nelle celle), immagineScala (0.5–1.5, cursore dell'immagine),
 *              calendarioScala (0.5–3, cursore del testo dei box del calendario, indipendente da testoScala) },
 *   voce: { velocita, tono, parlaAlTocco },
 *   input: { metodo: tocco|dwell|scansione, tempoDwell, tempoScansione, tastoSelezione },
 *   tornaHomeDopoSelezione,
 *   pagine: [ { id, nome, righe, colonne, riproduzione, celle: [ Cella ] } ]
 * }
 * Pagina.riproduzione { durata (0 = tutto il video), fineTimer: pausa|torna, fineVideo: torna|successivo|fermo,
 *                       spazio: sequenziale|casuale|disabilitato, spazioBloccato, mostraTimer }
 * Cella { id, x, y, w, h, etichetta, immagine: { tipo: arasaac|upload|url|dati|nessuna, id?, url?, autore? },
 *         categoria, dice, vaiA, video: { id, titolo, inizio, fine, durata } | null,
 *         audio: { tipo: upload|dati|url, url, durata?, nome? } | null, nascosta, colore?,
 *         inFrase (solo per le celle che aprono una pagina: la parola va anche nella frase, default true) }
 */
window.Griglia = window.Griglia || {};

Griglia.Modello = (function () {
    const uid = (p) => Griglia.util.uid(p);

    // Codice colore "Fitzgerald modificato", con la tavolozza della landing "Griglia"
    const CATEGORIE = [
        { id: 'pronome',      nome: 'Persone e pronomi',      colore: '#FFE45C' },
        { id: 'verbo',        nome: 'Azioni (verbi)',         colore: '#8BE38B' },
        { id: 'nome',         nome: 'Cose (nomi)',            colore: '#FFB65C' },
        { id: 'descrittore',  nome: 'Come è (descrittori)',   colore: '#7DB3FF' },
        { id: 'sociale',      nome: 'Parole sociali',         colore: '#FFA6C9' },
        { id: 'domanda',      nome: 'Domande',                colore: '#C6A4FF' },
        { id: 'negazione',    nome: 'No e parole importanti', colore: '#FF8A80' },
        { id: 'preposizione', nome: 'Piccole parole',         colore: '#FFFFFF' },
        { id: 'varie',        nome: 'Varie',                  colore: '#E3E5F3' },
        { id: 'nessuna',      nome: 'Nessun colore',          colore: '#FFFFFF' }
    ];
    const mappaCategorie = Object.fromEntries(CATEGORIE.map(c => [c.id, c]));

    const RIPRODUZIONE_DEFAULT = { durata: 0, fineTimer: 'pausa', fineVideo: 'torna', spazio: 'sequenziale', spazioBloccato: false, mostraTimer: true };

    function coloreCategoria(id) { return (mappaCategorie[id] || mappaCategorie.nessuna).colore; }

    /** Colore della cella: override esplicito, altrimenti categoria */
    function coloreCella(cella) {
        if (cella.colore && /^#[0-9A-Fa-f]{6}$/.test(cella.colore)) return cella.colore;
        return coloreCategoria(cella.categoria);
    }

    /** Schiarisce un colore esadecimale mescolandolo con il bianco (0..1) */
    function schiarisci(hex, quota) {
        const n = parseInt(hex.slice(1), 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const m = (c) => Math.round(c + (255 - c) * quota);
        return `#${[m(r), m(g), m(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
    }

    function nuovaCella(x, y, extra = {}) {
        return Object.assign({
            id: uid('c'), x, y, w: 1, h: 1,
            etichetta: '', immagine: { tipo: 'nessuna' }, categoria: 'nessuna',
            dice: null, vaiA: null, video: null, audio: null, nascosta: false, inFrase: true
        }, extra);
    }

    function nuovaPagina(nome = 'Pagina', righe = 3, colonne = 4) {
        return { id: uid('p'), nome, righe, colonne, riproduzione: Object.assign({}, RIPRODUZIONE_DEFAULT), celle: [] };
    }

    function nuovoDocumento({ nome = 'Nuovo comunicatore', righe = 3, colonne = 4 } = {}) {
        const home = nuovaPagina('Home', righe, colonne);
        return {
            schema: 1,
            nome,
            lingua: 'it',
            paginaHomeId: home.id,
            barra: { frase: true, parla: true, cancellaParola: true, cancellaTutto: true, home: true, indietro: true, dimensione: 1 },
            aspetto: { preset: 'sfondo', testo: 'M', posizioneTesto: 'sotto', mostraEtichette: true, testoScala: 1, immagineScala: 1, calendarioScala: 1 },
            voce: { velocita: 1, tono: 1, parlaAlTocco: true },
            input: { metodo: 'tocco', tempoDwell: 1200, tempoScansione: 1500, tastoSelezione: 'qualsiasi' },
            tornaHomeDopoSelezione: false,
            pagine: [home]
        };
    }

    function normalizzaVideo(v) {
        if (!v || typeof v !== 'object' || !/^[A-Za-z0-9_-]{11}$/.test(String(v.id || ''))) return null;
        const out = {
            id: String(v.id),
            titolo: String(v.titolo || '').slice(0, 200),
            inizio: Math.max(0, parseInt(v.inizio, 10) || 0),
            fine: Math.max(0, parseInt(v.fine, 10) || 0),
            durata: (v.durata === null || v.durata === undefined || v.durata === '') ? null : Math.max(0, parseInt(v.durata, 10) || 0)
        };
        if (out.fine > 0 && out.fine <= out.inizio) out.fine = 0;
        return out;
    }

    /** Voce registrata di una cella: sul dispositivo (upload, "idb:<id>"), data URL (dati, file importati) o URL esterno */
    function normalizzaAudio(a) {
        if (!a || typeof a !== 'object' || typeof a.url !== 'string' || !a.url) return null;
        const tipo = a.tipo === 'dati' ? 'dati' : a.tipo === 'url' ? 'url' : 'upload';
        if (tipo === 'dati' && !/^data:audio\//i.test(a.url)) return null;
        const out = { tipo, url: tipo === 'dati' ? a.url : String(a.url).slice(0, 500) };
        const durata = parseFloat(a.durata);
        if (durata > 0) out.durata = Math.round(durata * 10) / 10;
        if (a.nome) out.nome = String(a.nome).slice(0, 100);
        return out;
    }

    /** Completa un documento con i valori predefiniti e ripara incoerenze (versione client, permissiva) */
    function normalizza(doc) {
        const base = nuovoDocumento();
        if (!doc || typeof doc !== 'object') return base;
        const out = Object.assign({}, base, doc);
        out.schema = 1;
        out.nome = String(out.nome || 'Comunicatore').slice(0, 200);
        out.barra = Object.assign({}, base.barra, doc.barra || {});
        out.barra.dimensione = Griglia.util.clamp(Math.round((parseFloat(out.barra.dimensione) || 1) * 10) / 10, 1, 5);
        out.aspetto = Object.assign({}, base.aspetto, doc.aspetto || {});
        // Documenti salvati prima dei cursori: la vecchia scelta S/M/L diventa la scala del testo
        if (!doc.aspetto || doc.aspetto.testoScala === undefined || doc.aspetto.testoScala === null) out.aspetto.testoScala = { S: 0.7, L: 1.35 }[out.aspetto.testo] || 1;
        out.aspetto.testoScala = Griglia.util.clamp(Math.round((parseFloat(out.aspetto.testoScala) || 1) * 10) / 10, 0.5, 4);
        out.aspetto.immagineScala = Griglia.util.clamp(Math.round((parseFloat(out.aspetto.immagineScala) || 1) * 20) / 20, 0.3, 2);
        out.aspetto.calendarioScala = Griglia.util.clamp(Math.round((parseFloat(out.aspetto.calendarioScala) || 1) * 10) / 10, 0.5, 3);
        out.voce = Object.assign({}, base.voce, doc.voce || {});
        out.input = Object.assign({}, base.input, doc.input || {});
        out.pagine = Array.isArray(doc.pagine) && doc.pagine.length ? doc.pagine : base.pagine;

        const ids = new Set();
        out.pagine = out.pagine.map(p => {
            const pag = Object.assign({ id: uid('p'), nome: 'Pagina', righe: 3, colonne: 4, celle: [] }, p);
            if (ids.has(pag.id)) pag.id = uid('p');
            ids.add(pag.id);
            pag.righe = Griglia.util.clamp(parseInt(pag.righe, 10) || 3, 1, 12);
            pag.colonne = Griglia.util.clamp(parseInt(pag.colonne, 10) || 4, 1, 12);
            pag.riproduzione = Object.assign({}, RIPRODUZIONE_DEFAULT, (p && typeof p.riproduzione === 'object') ? p.riproduzione : {});
            pag.celle = (Array.isArray(pag.celle) ? pag.celle : []).map(c => Object.assign(nuovaCella(0, 0), c)).filter(c =>
                c.x >= 0 && c.y >= 0 && c.x < pag.colonne && c.y < pag.righe);
            pag.celle.forEach(c => {
                c.w = Griglia.util.clamp(parseInt(c.w, 10) || 1, 1, pag.colonne - c.x);
                c.h = Griglia.util.clamp(parseInt(c.h, 10) || 1, 1, pag.righe - c.y);
                if (!c.immagine || typeof c.immagine !== 'object') c.immagine = { tipo: 'nessuna' };
                if (!mappaCategorie[c.categoria]) c.categoria = 'nessuna';
                c.video = normalizzaVideo(c.video);
                c.audio = normalizzaAudio(c.audio);
                c.inFrase = c.inFrase !== false;
            });
            return pag;
        });
        if (!out.pagine.some(p => p.id === out.paginaHomeId)) out.paginaHomeId = out.pagine[0].id;
        const idsPagine = new Set(out.pagine.map(p => p.id));
        out.pagine.forEach(p => p.celle.forEach(c => { if (c.vaiA && !idsPagine.has(c.vaiA)) c.vaiA = null; }));
        return out;
    }

    function pagina(doc, id) { return doc.pagine.find(p => p.id === id) || null; }
    function paginaHome(doc) { return pagina(doc, doc.paginaHomeId) || doc.pagine[0]; }

    /** Cella che copre lo slot (x, y), se esiste */
    function cellaIn(pag, x, y) {
        return pag.celle.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) || null;
    }

    /** Lo spazio (x, y, w, h) è libero (ignorando la cella escludiId)? */
    function postoLibero(pag, x, y, w, h, escludiId = null) {
        if (x < 0 || y < 0 || x + w > pag.colonne || y + h > pag.righe) return false;
        return !pag.celle.some(c => c.id !== escludiId &&
            x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y);
    }

    function primoPostoLibero(pag) {
        for (let y = 0; y < pag.righe; y++) for (let x = 0; x < pag.colonne; x++) if (!cellaIn(pag, x, y)) return { x, y };
        return null;
    }

    /** Ridimensiona la griglia: le celle fuori misura vengono tolte o accorciate. Restituisce quante celle sono state tolte. */
    function ridimensionaPagina(pag, righe, colonne) {
        righe = Griglia.util.clamp(righe, 1, 12);
        colonne = Griglia.util.clamp(colonne, 1, 12);
        const prima = pag.celle.length;
        pag.celle = pag.celle.filter(c => c.x < colonne && c.y < righe);
        pag.celle.forEach(c => { c.w = Math.min(c.w, colonne - c.x); c.h = Math.min(c.h, righe - c.y); });
        pag.righe = righe;
        pag.colonne = colonne;
        return prima - pag.celle.length;
    }

    /** Immagini e audio salvati sul dispositivo ("idb:<id>") diventano object URL; gli altri URL restano come sono */
    function risolviMedia(url) {
        if (!url) return null;
        return Griglia.Media ? Griglia.Media.risolvi(url) : url;
    }

    /** URL dell'immagine (null se non c'è) */
    function urlImmagine(immagine, dimensione = 300) {
        if (!immagine || !immagine.tipo || immagine.tipo === 'nessuna') return null;
        if (immagine.tipo === 'arasaac') return Griglia.Arasaac.url(immagine.id, dimensione);
        return risolviMedia(immagine.url);
    }

    /** URL dell'immagine di una cella: se non ne ha ma ha un video, usa la miniatura di YouTube */
    function urlImmagineCella(cella, dimensione = 300) {
        const url = urlImmagine(cella.immagine, dimensione);
        if (url) return url;
        if (cella.video && cella.video.id) return `https://i.ytimg.com/vi/${cella.video.id}/mqdefault.jpg`;
        return null;
    }

    /** Testo pronunciato dalla cella */
    function testoDetto(cella) {
        return (cella.dice && cella.dice.trim()) ? cella.dice.trim() : (cella.etichetta || '').trim();
    }

    /** URL della voce registrata con cui parla la cella (null se usa la voce sintetica o se è una cella video) */
    function audioCella(cella) {
        if (!cella.audio || !cella.audio.url) return null;
        if (cella.video && cella.video.id) return null;
        return risolviMedia(cella.audio.url);
    }

    /** Azione della cella: 'pagina' | 'video' | 'dice' */
    function azioneCella(cella) {
        if (cella.vaiA) return 'pagina';
        if (cella.video && cella.video.id) return 'video';
        return 'dice';
    }

    /** Celle video visibili di una pagina, in ordine di lettura (riga per riga) */
    function celleVideo(pag) {
        return pag.celle.filter(c => c.video && c.video.id && !c.nascosta).sort((a, b) => a.y - b.y || a.x - b.x);
    }

    function conta(doc) {
        return { pagine: doc.pagine.length, celle: doc.pagine.reduce((n, p) => n + p.celle.length, 0) };
    }

    function clona(oggetto) {
        return typeof structuredClone === 'function' ? structuredClone(oggetto) : JSON.parse(JSON.stringify(oggetto));
    }

    /** Pagine non raggiungibili dalla home (informativo, per l'editor) */
    function pagineIsolate(doc) {
        const viste = new Set([doc.paginaHomeId]);
        const coda = [doc.paginaHomeId];
        while (coda.length) {
            const p = pagina(doc, coda.shift());
            if (!p) continue;
            p.celle.forEach(c => { if (c.vaiA && !viste.has(c.vaiA)) { viste.add(c.vaiA); coda.push(c.vaiA); } });
        }
        return doc.pagine.filter(p => !viste.has(p.id));
    }

    return {
        CATEGORIE, RIPRODUZIONE_DEFAULT, coloreCategoria, coloreCella, schiarisci,
        nuovaCella, nuovaPagina, nuovoDocumento, normalizza, normalizzaVideo, normalizzaAudio,
        pagina, paginaHome, cellaIn, postoLibero, primoPostoLibero, ridimensionaPagina,
        urlImmagine, urlImmagineCella, testoDetto, audioCella, azioneCella, celleVideo, conta, clona, pagineIsolate
    };
})();
