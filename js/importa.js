/**
 * Griglia - Importazione ed esportazione
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Formati letti:   .json (nativo Griglia), .grd (Asterics AAC / AsTeRICS Grid),
 *                  .obf (Open Board Format, una board), .obz (OBF compresso, più board)
 * Formati scritti: .json (nativo), .obz
 *
 * Nella conversione sopravvivono griglia, etichette, immagini, le due azioni
 * "parla" e "vai a pagina" e gli audio registrati inclusi nel file: nei comunicatori
 * reali sono più del 95% delle celle.
 * Tutto il resto (barra della frase, media, domotica) è compito della barra fissa
 * oppure viene ignorato e conteggiato negli avvisi.
 */
window.Griglia = window.Griglia || {};

Griglia.Importa = (function () {
    const M = () => Griglia.Modello;
    const URL_JSZIP = 'js/vendor/jszip.min.js?v=3.10.1';
    // File esportati dalla versione del portale: foto e audio stanno ancora sul server di AssistiveTech
    const ORIGINE_PORTALE = 'https://www.assistivetech.it/training_cognitivo/strumenti/grid/';

    function caricaJSZip() {
        if (window.JSZip) return Promise.resolve(window.JSZip);
        return new Promise((risolvi, rifiuta) => {
            const s = document.createElement('script');
            s.src = URL_JSZIP;
            s.onload = () => window.JSZip ? risolvi(window.JSZip) : rifiuta(new Error('JSZip non caricato'));
            s.onerror = () => rifiuta(new Error('Impossibile caricare la libreria per i file compressi'));
            document.head.appendChild(s);
        });
    }

    const rxArasaac = /static\.arasaac\.org\/pictograms\/(\d+)\//i;

    /** Da URL/data a oggetto immagine del modello */
    function immagineDaUrl(url, autore) {
        if (!url) return { tipo: 'nessuna' };
        const m = String(url).match(rxArasaac);
        if (m) return { tipo: 'arasaac', id: parseInt(m[1], 10) };
        if (/^data:image\//i.test(url)) return { tipo: 'dati', url };
        const out = { tipo: 'url', url: String(url) };
        if (autore) out.autore = String(autore).slice(0, 100);
        return out;
    }

    function mimeAudio(path) {
        const est = (String(path).split('.').pop() || '').toLowerCase();
        return { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' }[est] || 'audio/mpeg';
    }

    /** Da URL/data a oggetto audio del modello */
    function audioDaUrl(url, nome) {
        if (!url) return null;
        const u = String(url);
        const out = /^data:audio\//i.test(u) ? { tipo: 'dati', url: u } : /^data:/i.test(u) ? null : { tipo: 'url', url: u.slice(0, 500) };
        if (out && nome) out.nome = String(nome).slice(0, 100);
        return out;
    }

    function testoLingua(v, lingue = ['it', 'en', 'de', 'es']) {
        if (v == null) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'object') {
            for (const l of lingue) if (v[l]) return String(v[l]);
            const k = Object.keys(v).find(k => v[k]);
            return k ? String(v[k]) : '';
        }
        return String(v);
    }

    function categoriaDaAsterics(cc) {
        const s = String(cc || '').toUpperCase();
        if (!s) return 'nessuna';
        if (/PRONOUN|PERSON/.test(s)) return 'pronome';
        if (/VERB/.test(s)) return 'verbo';
        if (/ADJECTIVE|ADVERB|DESCRIP/.test(s)) return 'descrittore';
        if (/NOUN/.test(s)) return 'nome';
        if (/SOCIAL/.test(s)) return 'sociale';
        if (/QUESTION/.test(s)) return 'domanda';
        if (/NEGATION|IMPORTANT/.test(s)) return 'negazione';
        if (/PREPOSITION|DETERMINER|ARTICLE|CONJUNCTION/.test(s)) return 'preposizione';
        return 'varie';
    }

    function coloreCss(c) {
        if (!c) return null;
        c = String(c).trim();
        if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
        if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toUpperCase();
        const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
        if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('').toUpperCase();
        return null;
    }

    // ---------- Asterics .grd ----------
    function daGrd(grd, nomeFile = '') {
        const avvisi = [];
        const grids = Array.isArray(grd.grids) ? grd.grids : (Array.isArray(grd) ? grd : []);
        if (!grids.length) throw new Error('Il file non contiene griglie');
        const meta = grd.metadata || {};
        const idGlobale = meta.globalGridId || null;
        const mappaId = new Map();
        const pagineGrd = grids.filter(g => g && g.id !== idGlobale);
        pagineGrd.forEach(g => mappaId.set(g.id, Griglia.util.uid('p')));

        let scartate = 0, audioPersi = 0;
        const doc = M().nuovoDocumento({ nome: nomeFile.replace(/\.grd$/i, '') || 'Comunicatore importato' });
        doc.pagine = pagineGrd.map(g => {
            const righe = Griglia.util.clamp(parseInt(g.rowCount, 10) || 3, 1, 12);
            const colonne = Griglia.util.clamp(parseInt(g.minColumnCount, 10) || 4, 1, 12);
            const pag = { id: mappaId.get(g.id), nome: (testoLingua(g.label) || 'Pagina').slice(0, 100), righe, colonne, celle: [] };
            (g.gridElements || []).forEach(el => {
                const tipo = el.type || 'ELEMENT_TYPE_NORMAL';
                if (tipo !== 'ELEMENT_TYPE_NORMAL') { scartate++; return; }
                const azioni = Array.isArray(el.actions) ? el.actions : [];
                let dice = null, vaiA = null, video = null, audio = null, soloBarra = azioni.length > 0;
                for (const a of azioni) {
                    const n = a.modelName || '';
                    if (n === 'GridActionSpeak') { soloBarra = false; }
                    else if (n === 'GridActionYoutube') {
                        soloBarra = false;
                        const idYt = Griglia.Video.estraiId(a.videoLink || a.data || a.playlistLink || '');
                        if (idYt) video = { id: idYt, titolo: '', inizio: 0, fine: 0, durata: null };
                    }
                    else if (n === 'GridActionSpeakCustom') { dice = testoLingua(a.speakText) || dice; soloBarra = false; }
                    else if (n === 'GridActionNavigate') {
                        soloBarra = false;
                        if (a.navType === 'NAV_TYPE_HOME' || a.toGridId === meta.homeGridId) vaiA = 'HOME';
                        else if (a.navType === 'NAV_TYPE_BACK') { /* la barra ha già indietro */ }
                        else if (a.toGridId && mappaId.has(a.toGridId)) vaiA = mappaId.get(a.toGridId);
                    }
                    else if (n === 'GridActionAudio') {
                        soloBarra = false;
                        const d = a.dataBase64 || a.data || '';
                        if (typeof d === 'string' && d.length > 100) audio = { tipo: 'dati', url: d.startsWith('data:') ? d : `data:${a.mimeType || 'audio/webm'};base64,${d}`, nome: 'Registrazione' };
                        else audioPersi++;
                    }
                    else if (n === 'GridActionCollectElement') { /* funzione della barra */ }
                    else { soloBarra = false; }
                }
                if (soloBarra) { scartate++; return; }   // solo azioni della barra (parla frase, cancella…)
                const x = parseInt(el.x, 10) || 0, y = parseInt(el.y, 10) || 0;
                if (x >= colonne || y >= righe) { scartate++; return; }
                const img = el.image || {};
                const cella = M().nuovaCella(x, y, {
                    w: Griglia.util.clamp(parseInt(el.width, 10) || 1, 1, colonne - x),
                    h: Griglia.util.clamp(parseInt(el.height, 10) || 1, 1, righe - y),
                    etichetta: (testoLingua(el.label) || '').slice(0, 120),
                    immagine: immagineDaUrl(img.url || img.data, img.author),
                    categoria: categoriaDaAsterics(el.colorCategory),
                    dice: dice ? String(dice).slice(0, 300) : null,
                    vaiA, video, audio, nascosta: !!el.hidden
                });
                const col = coloreCss(el.backgroundColor);
                if (col && cella.categoria === 'nessuna') cella.colore = col;
                if (cella.immagine.tipo === 'nessuna' && !cella.etichetta) { scartate++; return; }
                pag.celle.push(cella);
            });
            return pag;
        });
        if (!doc.pagine.length) throw new Error('Nessuna pagina utilizzabile nel file');
        doc.paginaHomeId = mappaId.get(meta.homeGridId) || doc.pagine[0].id;
        doc.pagine.forEach(p => p.celle.forEach(c => { if (c.vaiA === 'HOME') c.vaiA = doc.paginaHomeId; }));
        if (scartate) avvisi.push(`${scartate} elementi non convertibili (barra della frase, predizione, media) sono stati tolti`);
        if (audioPersi) avvisi.push(`${audioPersi} celle avevano un audio registrato non incluso nel file: verranno lette con la voce sintetica`);
        if (idGlobale) avvisi.push('La griglia globale di Asterics è sostituita dalla barra fissa in alto');
        return { documento: M().normalizza(doc), avvisi };
    }

    // ---------- Open Board Format ----------
    /**
     * @param {Array<{id:string, board:object}>} boards  tutte le board (una per .obf)
     * @param {string} rootId
     * @param {Map<string,string>} percorsi  path → board id (per load_board.path)
     * @param {Function} risolviPath  (path di immagine o suono nel pacchetto) → data URL | null
     */
    function daBoards(boards, rootId, percorsi, risolviPath, nome) {
        const avvisi = [];
        const mappaId = new Map();
        boards.forEach(b => mappaId.set(b.id, Griglia.util.uid('p')));
        let scartate = 0;
        const doc = M().nuovoDocumento({ nome: nome || 'Comunicatore importato' });
        doc.pagine = boards.map(({ id, board }) => {
            const grid = board.grid || {};
            const righe = Griglia.util.clamp(parseInt(grid.rows, 10) || 3, 1, 12);
            const colonne = Griglia.util.clamp(parseInt(grid.columns, 10) || 4, 1, 12);
            const pag = { id: mappaId.get(id), nome: (board.name || 'Pagina').slice(0, 100), righe, colonne, celle: [] };
            const immagini = new Map((board.images || []).map(i => [String(i.id), i]));
            const suoni = new Map((board.sounds || []).map(s => [String(s.id), s]));
            const bottoni = new Map((board.buttons || []).map(b => [String(b.id), b]));
            const ordine = Array.isArray(grid.order) ? grid.order : [];
            const piazzati = new Set();
            ordine.forEach((riga, y) => (riga || []).forEach((idB, x) => {
                if (idB == null || y >= righe || x >= colonne) return;
                const b = bottoni.get(String(idB));
                if (!b || piazzati.has(String(idB))) return;
                piazzati.add(String(idB));
                const azione = b.action || '';
                if (/^:(clear|backspace|speak|home|space)/.test(azione)) { scartate++; return; }
                let vaiA = null;
                if (b.load_board) {
                    const lb = b.load_board;
                    if (lb.id && mappaId.has(String(lb.id))) vaiA = mappaId.get(String(lb.id));
                    else if (lb.path && percorsi.has(lb.path)) vaiA = mappaId.get(percorsi.get(lb.path));
                    else if (lb.url) avvisi.push(`Collegamento esterno non importato: ${lb.url}`);
                }
                let immagine = { tipo: 'nessuna' };
                if (b.image_id != null && immagini.has(String(b.image_id))) {
                    const im = immagini.get(String(b.image_id));
                    if (im.url) immagine = immagineDaUrl(im.url, im.license?.author_name);
                    else if (im.data) immagine = immagineDaUrl(im.data);
                    else if (im.path && risolviPath) { const d = risolviPath(im.path); if (d) immagine = { tipo: 'dati', url: d }; }
                }
                // Suono: prima quello incluso nel pacchetto (vale ovunque), poi il campo esteso di Griglia (URL del server)
                let audio = null;
                const audioEsteso = M().normalizzaAudio(b.ext_griglia_audio);
                if (b.sound_id != null && suoni.has(String(b.sound_id))) {
                    const sn = suoni.get(String(b.sound_id));
                    if (sn.data) audio = audioDaUrl(sn.data);
                    else if (sn.path && risolviPath) { const d = risolviPath(sn.path); if (d) audio = { tipo: 'dati', url: d }; }
                    else if (sn.url) audio = audioDaUrl(sn.url);
                    if (audio && sn.duration > 0) audio.durata = Math.round(sn.duration * 10) / 10;
                }
                if (!audio) audio = audioEsteso;
                else if (audioEsteso) { if (audioEsteso.nome) audio.nome = audioEsteso.nome; if (!audio.durata && audioEsteso.durata) audio.durata = audioEsteso.durata; }
                const w = Griglia.util.clamp(parseInt(b.ext_griglia_w, 10) || 1, 1, colonne - x);
                const h = Griglia.util.clamp(parseInt(b.ext_griglia_h, 10) || 1, 1, righe - y);
                const cella = M().nuovaCella(x, y, {
                    w, h,
                    etichetta: String(b.label || '').slice(0, 120),
                    immagine,
                    categoria: b.ext_griglia_categoria || 'nessuna',
                    dice: b.vocalization && b.vocalization !== b.label ? String(b.vocalization).slice(0, 300) : null,
                    vaiA, video: M().normalizzaVideo(b.ext_griglia_video), audio, nascosta: !!b.hidden
                });
                const col = coloreCss(b.background_color);
                if (col && cella.categoria === 'nessuna' && !/^#FFFFFF$/i.test(col)) cella.colore = col;
                if (cella.immagine.tipo === 'nessuna' && !cella.etichetta) return;
                pag.celle.push(cella);
            }));
            return pag;
        });
        if (!doc.pagine.length) throw new Error('Nessuna board utilizzabile nel file');
        doc.paginaHomeId = mappaId.get(rootId) || doc.pagine[0].id;
        if (scartate) avvisi.push(`${scartate} bottoni di comando (cancella, parla) sono stati tolti: li fa la barra fissa`);
        return { documento: M().normalizza(doc), avvisi };
    }

    function daObf(obf, nomeFile = '') {
        const id = String(obf.id || 'board');
        return daBoards([{ id, board: obf }], id, new Map(), null, obf.name || nomeFile.replace(/\.obf$/i, ''));
    }

    async function daObz(arrayBuffer, nomeFile = '') {
        const JSZip = await caricaJSZip();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const fileManifest = zip.file('manifest.json') || zip.file(/manifest\.json$/i)[0];
        if (!fileManifest) throw new Error('manifest.json mancante nel file .obz');
        const manifest = JSON.parse(await fileManifest.async('string'));
        const paths = manifest.paths || {};
        const percorsi = new Map();
        const boards = [];
        const elencoBoards = paths.boards ? Object.entries(paths.boards) : [];
        if (!elencoBoards.length) {
            // manifest senza indice: prende tutti i .obf presenti
            for (const f of zip.file(/\.obf$/i)) { const b = JSON.parse(await f.async('string')); elencoBoards.push([String(b.id || f.name), f.name]); }
        }
        for (const [id, path] of elencoBoards) {
            const f = zip.file(path) || zip.file(path.replace(/^\//, ''));
            if (!f) continue;
            const board = JSON.parse(await f.async('string'));
            const idB = String(board.id || id);
            boards.push({ id: idB, board });
            percorsi.set(path, idB);
        }
        if (!boards.length) throw new Error('Nessuna board nel file .obz');

        // Immagini e suoni inclusi nel pacchetto → data URL
        const immaginiDati = new Map();
        for (const [, path] of Object.entries(paths.images || {})) {
            const f = zip.file(path) || zip.file(path.replace(/^\//, ''));
            if (!f) continue;
            const est = (path.split('.').pop() || 'png').toLowerCase();
            const mime = est === 'jpg' || est === 'jpeg' ? 'image/jpeg' : est === 'svg' ? 'image/svg+xml' : est === 'gif' ? 'image/gif' : est === 'webp' ? 'image/webp' : 'image/png';
            immaginiDati.set(path, `data:${mime};base64,${await f.async('base64')}`);
        }
        for (const [, path] of Object.entries(paths.sounds || {})) {
            const f = zip.file(path) || zip.file(path.replace(/^\//, ''));
            if (!f) continue;
            immaginiDati.set(path, `data:${mimeAudio(path)};base64,${await f.async('base64')}`);
        }
        const rootPath = manifest.root || '';
        const rootId = percorsi.get(rootPath) || boards[0].id;
        const risolvi = (p) => immaginiDati.get(p) || immaginiDati.get(p.replace(/^\//, '')) || null;
        return daBoards(boards, rootId, percorsi, risolvi, nomeFile.replace(/\.obz$/i, ''));
    }

    // ---------- Punto d'ingresso ----------
    async function daFile(file) {
        const nome = file.name || 'file';
        const est = (nome.split('.').pop() || '').toLowerCase();
        if (est === 'obz' || est === 'zip') return daObz(await file.arrayBuffer(), nome);
        let testo = await file.text();
        if (testo.charCodeAt(0) === 0xFEFF) testo = testo.slice(1);   // BOM dei file del catalogo Asterics
        let json;
        try { json = JSON.parse(testo); } catch (e) { throw new Error('Il file non è un JSON valido'); }
        if (json && json.formato === 'griglia-backup') throw new Error('Questo file è una copia di sicurezza completa: ripristinala dall\'Area Educatore con «Ripristina»');
        if (json && Array.isArray(json.pagine) && json.schema) return { documento: M().normalizza(json), avvisi: [] };
        if (json && (Array.isArray(json.grids) || (Array.isArray(json) && json[0]?.gridElements))) return daGrd(json, nome);
        if (json && (String(json.format || '').startsWith('open-board') || Array.isArray(json.buttons))) return daObf(json, nome);
        throw new Error('Formato non riconosciuto: usa .json (Griglia), .grd (Asterics) oppure .obf/.obz');
    }

    /**
     * Salva sul dispositivo (IndexedDB) le immagini e gli audio incorporati (tipo "dati") così il documento resta leggero.
     * Gli audio che non sono mp3/m4a vengono convertiti in mp3 (se Griglia.Audio è caricato).
     */
    async function caricaMediaIncorporati(doc, avanzamento) {
        const lavori = [];
        const daPortale = (u) => typeof u === 'string' && /^assets\/uploads\//.test(u);
        doc.pagine.forEach(p => p.celle.forEach(c => {
            if (daPortale(c.immagine?.url)) c.immagine = Object.assign({}, c.immagine, { tipo: 'url', url: ORIGINE_PORTALE + c.immagine.url });
            if (daPortale(c.audio?.url)) c.audio = Object.assign({}, c.audio, { tipo: 'url', url: ORIGINE_PORTALE + c.audio.url });
            if (c.immagine?.tipo === 'dati' && c.immagine.url) lavori.push({ c, tipo: 'immagine' });
            if (c.audio?.tipo === 'dati' && c.audio.url) lavori.push({ c, tipo: 'audio' });
        }));
        let fatte = 0, errori = 0;
        for (const { c, tipo } of lavori) {
            try {
                if (tipo === 'immagine') {
                    const blob = Griglia.Archivio.dataUrlABlob(c.immagine.url);
                    const ridotto = blob.type === 'image/svg+xml' ? blob : await Griglia.Archivio.ridimensionaImmagine(blob, 600).catch(() => blob);
                    const url = await Griglia.Archivio.uploadImmagine(ridotto, 'imp');
                    c.immagine = { tipo: 'upload', url };
                } else {
                    const blob = Griglia.Archivio.dataUrlABlob(c.audio.url);
                    const est = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac' }[blob.type] || 'webm';
                    let pronto = { blob, durata: c.audio.durata || 0, estensione: est };
                    if (Griglia.Audio) {
                        try { pronto = await Griglia.Audio.fileInAudio(new File([blob], `audio.${est}`, { type: blob.type })); }
                        catch (e) { /* si carica com'è */ }
                    }
                    const url = await Griglia.Archivio.uploadAudio(pronto.blob, pronto.estensione, 'imp');
                    const audio = { tipo: 'upload', url };
                    if (pronto.durata > 0) audio.durata = Math.round(pronto.durata * 10) / 10;
                    if (c.audio.nome) audio.nome = c.audio.nome;
                    c.audio = audio;
                }
            } catch (e) { errori++; }
            if (avanzamento) avanzamento(++fatte, lavori.length);
        }
        return { totale: lavori.length, errori };
    }
    const caricaImmaginiIncorporate = caricaMediaIncorporati;

    // ---------- Esportazione ----------
    function scaricaBlob(blob, nomeFile) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nomeFile;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    function nomeFileSicuro(nome, est) {
        return (String(nome || 'comunicatore').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'comunicatore') + est;
    }

    /** Le foto e le registrazioni salvate sul dispositivo entrano nel file come data URL, così il file è completo */
    async function esportaJson(doc) {
        doc = await Griglia.Media.incorpora(doc);
        const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
        scaricaBlob(blob, nomeFileSicuro(doc.nome, '.griglia.json'));
    }

    function urlAssoluto(u) {
        try { return new URL(u, window.location.href).href; } catch (e) { return u; }
    }

    async function esportaObz(doc) {
        const JSZip = await caricaJSZip();
        doc = await Griglia.Media.incorpora(doc);
        const zip = new JSZip();
        const manifest = { format: 'open-board-0.1', root: '', paths: { boards: {}, images: {}, sounds: {} } };
        // Gli audio delle celle vengono messi nel pacchetto (così il file è completo anche altrove)
        const suoniPronti = new Map();
        const celleAudio = [];
        doc.pagine.forEach(p => p.celle.forEach(c => { if (c.audio && c.audio.url) celleAudio.push(c); }));
        for (const c of celleAudio) {
            const a = c.audio;
            const id = `snd_${c.id}`;
            const suono = { id, content_type: 'audio/mpeg' };
            if (a.durata) suono.duration = a.durata;
            try {
                let blob;
                if (a.tipo === 'dati') blob = Griglia.Archivio.dataUrlABlob(a.url);
                else { const r = await fetch(urlAssoluto(a.url)); if (!r.ok) throw new Error('non scaricabile'); blob = await r.blob(); }
                const est = a.tipo === 'dati' ? ({ 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm' }[blob.type] || 'mp3') : (a.url.split('.').pop() || 'mp3').toLowerCase().slice(0, 5);
                const pathSuono = `sounds/${id}.${est}`;
                zip.file(pathSuono, blob);
                manifest.paths.sounds[id] = pathSuono;
                suono.path = pathSuono;
                suono.content_type = mimeAudio(pathSuono);
            } catch (e) {
                if (a.tipo !== 'dati') suono.url = urlAssoluto(a.url); else continue;
            }
            suoniPronti.set(c.id, suono);
        }
        doc.pagine.forEach(p => {
            const path = `boards/${p.id}.obf`;
            manifest.paths.boards[p.id] = path;
            if (p.id === doc.paginaHomeId) manifest.root = path;
            const images = [], buttons = [], sounds = [];
            const order = Array.from({ length: p.righe }, () => Array(p.colonne).fill(null));
            p.celle.forEach(c => {
                const url = M().urlImmagineCella(c, 500);
                let image_id = null;
                if (url) {
                    image_id = `img_${c.id}`;
                    const im = { id: image_id, content_type: 'image/png' };
                    if (c.immagine.tipo === 'dati') im.data = url; else im.url = urlAssoluto(url);
                    if (c.immagine.tipo === 'arasaac') im.license = { type: 'CC BY-NC-SA', copyright_notice_url: 'https://arasaac.org', author_name: 'Sergio Palao', source_url: 'https://arasaac.org' };
                    images.push(im);
                }
                const b = {
                    id: c.id, label: c.etichetta || '', background_color: M().coloreCella(c), border_color: '#14162B',
                    ext_griglia_categoria: c.categoria, ext_griglia_w: c.w, ext_griglia_h: c.h
                };
                if (c.dice) b.vocalization = c.dice;
                if (image_id) b.image_id = image_id;
                if (c.vaiA) b.load_board = { id: c.vaiA, path: `boards/${c.vaiA}.obf` };
                if (c.video) { b.ext_griglia_video = c.video; b.url = `https://www.youtube.com/watch?v=${c.video.id}`; }
                if (suoniPronti.has(c.id)) { const sn = suoniPronti.get(c.id); sounds.push(sn); b.sound_id = sn.id; b.ext_griglia_audio = c.audio; }
                if (c.nascosta) b.hidden = true;
                buttons.push(b);
                if (order[c.y] && c.x < p.colonne) order[c.y][c.x] = c.id;
            });
            zip.file(path, JSON.stringify({
                format: 'open-board-0.1', id: p.id, locale: 'it', name: p.nome,
                description_html: `Esportato da Griglia (AssistiveTech.it) - ${doc.nome}`,
                buttons, images, sounds, grid: { rows: p.righe, columns: p.colonne, order }
            }, null, 1));
        });
        zip.file('manifest.json', JSON.stringify(manifest, null, 1));
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        scaricaBlob(blob, nomeFileSicuro(doc.nome, '.obz'));
    }

    return { daFile, daGrd, daObf, daObz, caricaMediaIncorporati, caricaImmaginiIncorporate, esportaJson, esportaObz, caricaJSZip };
})();
