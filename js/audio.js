/**
 * Griglia - Voce registrata: microfono, file mp3, conversione e riproduzione
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Una cella può parlare con una registrazione (la voce di mamma, una canzone, un suono)
 * invece che con la voce sintetica. Si registra dal microfono (MediaRecorder) oppure si
 * carica un file; in entrambi i casi il risultato diventa un MP3 mono a 44,1 kHz
 * (encoder lamejs, LGPL, caricato solo quando serve) così che si senta su qualunque
 * dispositivo, tablet compreso, e pesi poco (circa 8 KB al secondo).
 * I file mp3 e m4a caricati restano come sono.
 */
window.Griglia = window.Griglia || {};

Griglia.Audio = (function () {
    const URL_ENCODER = 'js/vendor/lame.min.js?v=1.2.1';
    const MAX_SECONDI = 120;                 // durata massima di una registrazione
    const MAX_BYTES = 8 * 1024 * 1024;       // limite per i file caricati (post_max_size tipico: 8 MB)
    const KBPS = 64;                         // registrazioni (voce): mono 64 kbps
    const KBPS_FILE = 96;                    // file convertiti (musica): mono 96 kbps
    const FREQUENZA = 44100;

    let encoderPromessa = null;
    let player = null;
    let risolviPendente = null;
    let sbloccato = false;

    function supportaRegistrazione() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }
    function supportaCodifica() { return !!(window.AudioContext || window.webkitAudioContext); }

    /** L'encoder MP3 (156 KB) si carica alla prima registrazione o conversione, non all'avvio */
    function caricaEncoder() {
        if (window.lamejs && window.lamejs.Mp3Encoder) return Promise.resolve(window.lamejs);
        if (encoderPromessa) return encoderPromessa;
        encoderPromessa = new Promise((risolvi, rifiuta) => {
            const s = document.createElement('script');
            s.src = URL_ENCODER;
            s.onload = () => (window.lamejs && window.lamejs.Mp3Encoder) ? risolvi(window.lamejs) : rifiuta(new Error('Encoder MP3 non caricato'));
            s.onerror = () => { encoderPromessa = null; rifiuta(new Error('Impossibile caricare l\'encoder MP3 (js/vendor/lame.min.js)')); };
            document.head.appendChild(s);
        });
        return encoderPromessa;
    }

    // ---------- Registrazione dal microfono ----------
    /**
     * Avvia la registrazione. Restituisce un registratore con stop() e annulla();
     * onFine(risultato) viene chiamato quando la registrazione termina per qualunque motivo
     * (risultato = { blob, durata, mime } oppure null se annullata).
     */
    async function registra({ onTempo = null, onLivello = null, onFine = null, maxSecondi = MAX_SECONDI } = {}) {
        if (!supportaRegistrazione()) throw new Error('Questo browser non permette di registrare: usa Chrome, Edge, Firefox o Safari aggiornati');
        if (!window.isSecureContext) throw new Error('La registrazione dal microfono funziona solo con il collegamento sicuro (https) o su localhost');
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        } catch (e) {
            const n = e && e.name;
            if (n === 'NotAllowedError' || n === 'SecurityError') throw new Error('Microfono non consentito: permetti l\'uso del microfono dall\'icona accanto all\'indirizzo del sito');
            if (n === 'NotFoundError' || n === 'OverconstrainedError') throw new Error('Nessun microfono trovato su questo dispositivo');
            if (n === 'NotReadableError') throw new Error('Il microfono è occupato da un\'altra applicazione');
            throw new Error('Microfono non disponibile: ' + (e && (e.message || n) || 'errore sconosciuto'));
        }
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', '']
            .find(t => !t || (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)));
        let rec;
        try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
        catch (e) { stream.getTracks().forEach(t => t.stop()); throw new Error('Registratore non disponibile: ' + e.message); }

        const parti = [];
        rec.addEventListener('dataavailable', e => { if (e.data && e.data.size) parti.push(e.data); });

        // Misuratore di livello: mostra che il microfono sente
        let ctx = null, raf = 0;
        if (onLivello) {
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                ctx = new Ctx();
                const sorgente = ctx.createMediaStreamSource(stream);
                const analizzatore = ctx.createAnalyser();
                analizzatore.fftSize = 1024;
                sorgente.connect(analizzatore);
                const dati = new Uint8Array(analizzatore.fftSize);
                const misura = () => {
                    analizzatore.getByteTimeDomainData(dati);
                    let somma = 0;
                    for (let i = 0; i < dati.length; i++) { const v = (dati[i] - 128) / 128; somma += v * v; }
                    onLivello(Math.min(1, Math.sqrt(somma / dati.length) * 3));
                    raf = requestAnimationFrame(misura);
                };
                raf = requestAnimationFrame(misura);
            } catch (e) { ctx = null; }
        }

        const inizio = Date.now();
        let timer = null, fermata = false, annullata = false, concluso = false;
        const pulisci = () => {
            if (timer) { clearInterval(timer); timer = null; }
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            if (ctx) { try { ctx.close(); } catch (e) { /* ignora */ } ctx = null; }
            stream.getTracks().forEach(t => t.stop());
        };
        const concludi = (risultato) => {
            if (concluso) return;
            concluso = true;
            pulisci();
            if (onFine) onFine(risultato);
        };
        rec.addEventListener('stop', () => {
            const tipo = rec.mimeType || mime || 'audio/webm';
            concludi(annullata || !parti.length ? null : { blob: new Blob(parti, { type: tipo }), durata: (Date.now() - inizio) / 1000, mime: tipo });
        });
        rec.addEventListener('error', () => concludi(null));
        const ferma = () => {
            if (fermata) return;
            fermata = true;
            if (onTempo) onTempo((Date.now() - inizio) / 1000);
            try { if (rec.state !== 'inactive') rec.stop(); else concludi(null); }
            catch (e) { concludi(null); }
        };
        timer = setInterval(() => {
            const s = (Date.now() - inizio) / 1000;
            if (onTempo) onTempo(s);
            if (s >= maxSecondi) ferma();
        }, 200);
        rec.start(250);
        return {
            stop() { ferma(); },
            annulla() { annullata = true; ferma(); },
            get durata() { return (Date.now() - inizio) / 1000; },
            get attivo() { return !concluso; }
        };
    }

    // ---------- Decodifica e conversione in MP3 ----------
    function decodificaBuffer(ctx, arrayBuffer) {
        return new Promise((risolvi, rifiuta) => {
            // Safari meno recenti conoscono solo la forma con callback
            const p = ctx.decodeAudioData(arrayBuffer, risolvi, rifiuta);
            if (p && p.then) p.then(risolvi, rifiuta);
        });
    }
    function renderizza(off) {
        return new Promise((risolvi, rifiuta) => {
            off.oncomplete = e => risolvi(e.renderedBuffer);
            const p = off.startRendering();
            if (p && p.then) p.then(risolvi, rifiuta);
        });
    }

    /** Decodifica una registrazione o un file in campioni PCM mono (Float32Array) */
    async function decodifica(blob) {
        if (!supportaCodifica()) throw new Error('Questo browser non sa convertire l\'audio');
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        let buffer;
        try { buffer = await decodificaBuffer(ctx, await blob.arrayBuffer()); }
        catch (e) { throw new Error('File audio non leggibile: usa mp3, m4a, wav oppure ogg'); }
        finally { try { ctx.close(); } catch (e) { /* ignora */ } }
        if (!buffer || !buffer.length || buffer.duration < 0.05) throw new Error('Registrazione vuota');

        // Un solo canale a 44,1 kHz: l'OfflineAudioContext fa mixdown e ricampionamento insieme
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (Off && (buffer.sampleRate !== FREQUENZA || buffer.numberOfChannels !== 1)) {
            try {
                const off = new Off(1, Math.max(1, Math.ceil(buffer.duration * FREQUENZA)), FREQUENZA);
                const src = off.createBufferSource();
                src.buffer = buffer;
                src.connect(off.destination);
                src.start(0);
                const reso = await renderizza(off);
                return { campioni: reso.getChannelData(0), frequenza: FREQUENZA, durata: reso.duration };
            } catch (e) { /* si prosegue con il primo canale così com'è */ }
        }
        return { campioni: buffer.getChannelData(0), frequenza: buffer.sampleRate, durata: buffer.duration };
    }

    /** Toglie il silenzio all'inizio e alla fine (lasciando 0,1 s) e alza il volume se la registrazione è bassa */
    function rifinisci(campioni, frequenza) {
        const soglia = 0.012, finestra = Math.max(1, Math.round(frequenza * 0.01)), margine = Math.round(frequenza * 0.1);
        const rms = (da) => {
            let s = 0; const a = Math.min(campioni.length, da + finestra);
            for (let i = da; i < a; i++) s += campioni[i] * campioni[i];
            return Math.sqrt(s / Math.max(1, a - da));
        };
        let inizio = 0;
        while (inizio < campioni.length && rms(inizio) < soglia) inizio += finestra;
        let fine = campioni.length;
        while (fine > inizio && rms(Math.max(0, fine - finestra)) < soglia) fine -= finestra;
        let out = campioni;
        if (fine - inizio >= frequenza * 0.2) {
            out = campioni.subarray(Math.max(0, inizio - margine), Math.min(campioni.length, fine + margine));
        }
        let picco = 0;
        for (let i = 0; i < out.length; i++) picco = Math.max(picco, Math.abs(out[i]));
        if (picco > 0.01 && picco < 0.6) {
            const g = 0.85 / picco;
            const n = new Float32Array(out.length);
            for (let i = 0; i < out.length; i++) n[i] = out[i] * g;
            out = n;
        }
        return out;
    }

    /** Campioni PCM mono → Blob MP3 */
    async function codificaMp3(campioni, frequenza, kbps = KBPS) {
        const lame = await caricaEncoder();
        const enc = new lame.Mp3Encoder(1, frequenza, kbps);
        const blocco = 1152;
        const int16 = new Int16Array(blocco);
        const parti = [];
        for (let i = 0; i < campioni.length; i += blocco) {
            const n = Math.min(blocco, campioni.length - i);
            for (let j = 0; j < n; j++) {
                const v = Math.max(-1, Math.min(1, campioni[i + j]));
                int16[j] = v < 0 ? v * 32768 : v * 32767;
            }
            const b = enc.encodeBuffer(n === blocco ? int16 : int16.subarray(0, n));
            if (b.length) parti.push(b);
        }
        const coda = enc.flush();
        if (coda.length) parti.push(coda);
        return new Blob(parti, { type: 'audio/mpeg' });
    }

    /** Registrazione del microfono → { blob mp3, durata, estensione } */
    async function registrazioneInMp3(blob) {
        const { campioni, frequenza } = await decodifica(blob);
        const rifinite = rifinisci(campioni, frequenza);
        const mp3 = await codificaMp3(rifinite, frequenza, KBPS);
        return { blob: mp3, durata: rifinite.length / frequenza, estensione: 'mp3' };
    }

    /** File scelto dall'utente → file da salvare: mp3 e m4a restano così, gli altri diventano mp3 */
    async function fileInAudio(file) {
        const nome = (file.name || '').toLowerCase();
        const est = nome.includes('.') ? nome.split('.').pop() : '';
        const tipo = (file.type || '').toLowerCase();
        if (file.size > MAX_BYTES) throw new Error(`File troppo grande (${(file.size / 1048576).toFixed(1)} MB): massimo ${MAX_BYTES / 1048576} MB`);
        const eMp3 = tipo === 'audio/mpeg' || tipo === 'audio/mp3' || est === 'mp3';
        const eM4a = tipo === 'audio/mp4' || tipo === 'audio/x-m4a' || tipo === 'audio/aac' || ['m4a', 'aac', 'mp4'].includes(est);
        if (eMp3 || eM4a) {
            const durata = await durataDi(file).catch(() => 0);
            return { blob: file, durata, estensione: eMp3 ? 'mp3' : 'm4a' };
        }
        const { campioni, frequenza, durata } = await decodifica(file);
        const mp3 = await codificaMp3(campioni, frequenza, KBPS_FILE);
        return { blob: mp3, durata, estensione: 'mp3' };
    }

    /** Durata in secondi di un Blob o di un URL audio */
    function durataDi(blobOUrl) {
        return new Promise((risolvi, rifiuta) => {
            const a = document.createElement('audio');
            a.preload = 'metadata';
            const url = typeof blobOUrl === 'string' ? blobOUrl : URL.createObjectURL(blobOUrl);
            const pulisci = () => { if (typeof blobOUrl !== 'string') URL.revokeObjectURL(url); };
            a.onloadedmetadata = () => { const d = a.duration; pulisci(); if (isFinite(d) && d > 0) risolvi(d); else rifiuta(new Error('Durata non disponibile')); };
            a.onerror = () => { pulisci(); rifiuta(new Error('Audio non leggibile')); };
            a.src = url;
        });
    }

    function blobInDataUrl(blob) {
        return new Promise((risolvi, rifiuta) => {
            const fr = new FileReader();
            fr.onload = () => risolvi(fr.result);
            fr.onerror = () => rifiuta(new Error('Lettura del file non riuscita'));
            fr.readAsDataURL(blob);
        });
    }

    /** "3 s", "1:24"; con compatto=true sempre "m:ss" (per il contatore) */
    function formattaDurata(secondi, compatto = false) {
        const s = Math.max(0, Math.round(secondi || 0));
        if (!compatto && s < 60) return `${s} s`;
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    // ---------- Riproduzione ----------
    function creaPlayer() {
        if (player) return player;
        player = document.createElement('audio');
        player.preload = 'auto';
        player.setAttribute('playsinline', '');
        player.hidden = true;
        (document.body || document.documentElement).appendChild(player);
        return player;
    }

    /** WAV muto di 0,1 s: serve a "sbloccare" l'elemento audio sui tablet al primo tocco */
    function wavMuto() {
        const n = 800, sr = 8000;
        const b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
        const scrivi = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        scrivi(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); scrivi(8, 'WAVE'); scrivi(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
        v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); scrivi(36, 'data'); v.setUint32(40, n * 2, true);
        return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    }

    /**
     * Da chiamare dentro un gesto dell'utente (tocco, tasto): da quel momento le registrazioni
     * possono partire anche senza gesto (permanenza, scansione), come richiedono iPad e Android.
     */
    function sblocca() {
        if (sbloccato) return;
        sbloccato = true;
        try {
            const p = creaPlayer();
            if (!p.paused) return;
            p.src = wavMuto();
            const pr = p.play();
            if (pr && pr.catch) pr.catch(() => { sbloccato = false; });
        } catch (e) { sbloccato = false; }
    }

    /** Riproduce un URL (o data URL). Promise<boolean> risolta a fine ascolto (false se interrotta o non riproducibile) */
    function riproduci(url) {
        stop();
        const p = creaPlayer();
        return new Promise(risolvi => {
            risolviPendente = risolvi;
            const fine = (ok) => {
                if (risolviPendente !== risolvi) return;
                risolviPendente = null;
                p.onended = p.onerror = null;
                risolvi(ok);
            };
            p.onended = () => fine(true);
            p.onerror = () => { console.warn('[Griglia] Audio non riproducibile:', String(url).slice(0, 80)); fine(false); };
            p.src = url;
            let pr;
            try { pr = p.play(); } catch (e) { fine(false); return; }
            if (pr && pr.then) pr.then(() => { sbloccato = true; }, e => {
                if (e && e.name !== 'AbortError') console.warn('[Griglia] Audio non avviato:', e.message);
                fine(false);
            });
        });
    }

    function stop() {
        if (risolviPendente) { const r = risolviPendente; risolviPendente = null; r(false); }
        if (player) {
            try { player.onended = player.onerror = null; player.pause(); player.currentTime = 0; } catch (e) { /* ignora */ }
        }
    }

    function staSuonando() { return !!(player && !player.paused && !player.ended); }

    return {
        MAX_SECONDI, MAX_BYTES,
        supportaRegistrazione, supportaCodifica, caricaEncoder,
        registra, decodifica, codificaMp3, registrazioneInMp3, fileInAudio, durataDi, blobInDataUrl, formattaDurata,
        sblocca, riproduci, stop, staSuonando
    };
})();
