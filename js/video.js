/**
 * Griglia - Video YouTube: archivio del dispositivo, ricerca, selettore e schermo di riproduzione
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Comportamento del player (come nello strumento "Ascolto la musica"):
 * - la cella video apre uno schermo a un solo box con il video a tutta pagina;
 * - le celle video della stessa pagina sono la scaletta: Spazio (o un tocco sullo
 *   schermo) passa al successivo in ordine o a caso, secondo l'impostazione della pagina;
 * - timer facoltativo: allo scadere il video si ferma e aspetta Spazio, oppure si torna alle scelte;
 * - "Spazio bloccato": durante la riproduzione il pulsante viene ignorato (timer persistente).
 */
window.Griglia = window.Griglia || {};

Griglia.Video = (function () {
    const esc = (s) => Griglia.util.escapeHtml(s);

    // ---------- Utilità ----------
    function estraiId(testo) {
        if (!testo) return null;
        testo = String(testo).trim();
        if (/^[A-Za-z0-9_-]{11}$/.test(testo)) return testo;
        const m = testo.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        return m ? m[1] : null;
    }
    function miniatura(id, qualita = 'mqdefault') { return `https://i.ytimg.com/vi/${id}/${qualita}.jpg`; }
    function formattaTempo(sec) {
        sec = Math.max(0, parseInt(sec, 10) || 0);
        const m = Math.floor(sec / 60), s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    /** "1:30" → 90, "90" → 90, "" → 0 */
    function analizzaTempo(testo) {
        testo = String(testo || '').trim();
        if (!testo) return 0;
        if (/^\d+$/.test(testo)) return parseInt(testo, 10);
        const m = testo.match(/^(\d+)[:.'](\d{1,2})$/);
        if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        return 0;
    }
    /** Coppia di campi minuti + secondi: tastiera numerica sui tablet, nessun formato da ricordare */
    function htmlCampoTempo(id, secondi = 0) {
        const s = Math.max(0, parseInt(secondi, 10) || 0);
        const min = s ? String(Math.floor(s / 60)) : '';
        const sec = s ? String(s % 60).padStart(2, '0') : '';
        return `<span class="campo-tempo" data-tempo="${id}">` +
            `<input type="text" class="campo campo-compatto" id="${id}Min" value="${min}" placeholder="0" inputmode="numeric" pattern="[0-9]*" maxlength="3" aria-label="minuti"><span>min</span>` +
            `<input type="text" class="campo campo-compatto" id="${id}Sec" value="${sec}" placeholder="00" inputmode="numeric" pattern="[0-9]*" maxlength="2" aria-label="secondi"><span>s</span></span>`;
    }
    /** Secondi totali letti dalla coppia di campi (vuoto = 0) */
    function leggiCampoTempo(radice, id) {
        const num = (sel) => { const el = radice.querySelector(sel); const n = el ? parseInt(String(el.value).replace(/\D/g, ''), 10) : 0; return isNaN(n) ? 0 : Math.max(0, n); };
        return num(`#${id}Min`) * 60 + num(`#${id}Sec`);
    }
    /** Scrive i secondi nella coppia di campi (90 → 1 min 30 s) */
    function scriviCampoTempo(radice, id, secondi) {
        const s = Math.max(0, parseInt(secondi, 10) || 0);
        const m = radice.querySelector(`#${id}Min`), c = radice.querySelector(`#${id}Sec`);
        if (m) m.value = s ? String(Math.floor(s / 60)) : '';
        if (c) c.value = s ? String(s % 60).padStart(2, '0') : '';
    }

    // ---------- Ricerca su YouTube (Data API v3, nel browser) ----------
    const cacheRicerche = new Map();
    async function cercaYouTube(query, max = 12) {
        query = String(query || '').trim();
        if (query.length < 2) return [];
        const chiave = `${query}|${max}`;
        if (cacheRicerche.has(chiave)) return cacheRicerche.get(chiave);
        const url = 'https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
            part: 'snippet', q: query, key: Griglia.YOUTUBE_API_KEY, type: 'video', maxResults: String(Math.min(max, 25)),
            videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'strict', relevanceLanguage: 'it'
        });
        const r = await fetch(url);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            const msg = j.error?.message || `Errore ${r.status}`;
            throw new Error(/quota/i.test(msg) ? 'Ricerche YouTube esaurite per oggi: incolla il link del video' : msg);
        }
        const risultati = (j.items || []).filter(i => i.id?.videoId).map(i => ({
            id: i.id.videoId, titolo: i.snippet.title, canale: i.snippet.channelTitle,
            miniatura: i.snippet.thumbnails?.medium?.url || miniatura(i.id.videoId)
        }));
        cacheRicerche.set(chiave, risultati);
        return risultati;
    }

    // ---------- Archivio (sul dispositivo, IndexedDB) ----------
    const validoYt = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
    const riga = (v) => Object.assign({}, v, { miniatura: miniatura(v.id_youtube) });
    function campiVideo(v, base = {}) {
        const out = {
            titolo: String(v.titolo ?? base.titolo ?? '').trim().slice(0, 200) || base.titolo || '',
            categoria: String(v.categoria ?? base.categoria ?? '').trim().slice(0, 100) || base.categoria || 'Varie',
            inizio: Math.max(0, parseInt(v.inizio ?? base.inizio, 10) || 0),
            fine: Math.max(0, parseInt(v.fine ?? base.fine, 10) || 0)
        };
        if (out.fine > 0 && out.fine <= out.inizio) throw new Error('Il tempo di fine deve essere maggiore di quello di inizio');
        return out;
    }
    /** Titolo e autore via oEmbed pubblico di YouTube (nessuna chiave, nessuna quota; CORS consentito) */
    async function infoYouTube(id) {
        if (!validoYt(id)) throw new Error('ID video YouTube non valido');
        let j = null;
        try {
            const r = await fetch('https://www.youtube.com/oembed?' + new URLSearchParams({ url: `https://www.youtube.com/watch?v=${id}`, format: 'json' }));
            if (r.ok) j = await r.json();
        } catch (e) {
            throw new Error('Connessione a YouTube non riuscita');
        }
        if (!j || !j.title) throw new Error('Video non trovato o non disponibile');
        return { id_youtube: id, titolo: String(j.title).slice(0, 200), autore: String(j.author_name || '').slice(0, 100), miniatura: miniatura(id) };
    }
    // Un solo archivio: quello dell'utente di questo dispositivo
    const archivio = {
        async lista(filtri = {}) {
            const cat = String(filtri.categoria || '');
            const testo = String(filtri.testo || '').trim().toLowerCase();
            return (await Griglia.DB.tutti('video'))
                .filter(v => (!cat || v.categoria === cat) && (!testo || v.titolo.toLowerCase().includes(testo) || v.categoria.toLowerCase().includes(testo)))
                .sort((a, b) => a.categoria.localeCompare(b.categoria, 'it') || a.titolo.localeCompare(b.titolo, 'it'))
                .map(riga);
        },
        async categorie() {
            const conta = new Map();
            (await Griglia.DB.tutti('video')).forEach(v => conta.set(v.categoria, (conta.get(v.categoria) || 0) + 1));
            return [...conta.entries()].sort((a, b) => a[0].localeCompare(b[0], 'it')).map(([categoria, n]) => ({ categoria, n }));
        },
        async salva(v) {
            const idYt = String(v.id_youtube || '').trim();
            if (!validoYt(idYt)) throw new Error('ID video YouTube non valido');
            const campi = campiVideo(v);
            if (!campi.titolo) {
                try { campi.titolo = (await infoYouTube(idYt)).titolo; } catch (e) { campi.titolo = `Video ${idYt}`; }
            }
            // Stesso video con gli stessi tempi: riusa quello già in archivio
            const esistente = (await Griglia.DB.tutti('video')).find(x => x.id_youtube === idYt && x.inizio === campi.inizio && x.fine === campi.fine);
            if (esistente) return riga(esistente);
            const nuovo = Object.assign({ id_youtube: idYt, data_creazione: Griglia.util.dataOra() }, campi);
            nuovo.id_video = await Griglia.DB.tx('video', 'readwrite', s => s.add(nuovo));
            return riga(nuovo);
        },
        async aggiorna(v) {
            const attuale = await Griglia.DB.get('video', parseInt(v.id, 10));
            if (!attuale) throw new Error('Video non trovato');
            Object.assign(attuale, campiVideo(v, attuale));
            await Griglia.DB.metti('video', attuale);
            return riga(attuale);
        },
        async elimina(id) { await Griglia.DB.togli('video', parseInt(id, 10)); },
        info: infoYouTube
    };

    // ---------- Selettore / gestione archivio ----------
    /**
     * Finestra con tre schede: Archivio, Cerca su YouTube, Incolla link.
     * @param {{onScelta?: Function, titolo?: string}} opzioni
     *   onScelta({ id, titolo, inizio, fine }) viene chiamata quando si sceglie un video; se assente la finestra serve solo a gestire l'archivio.
     */
    function apriSelettore(opzioni = {}) {
        const { onScelta = null, titolo = 'Scegli un video' } = opzioni;
        const gestione = !onScelta;
        const box = Griglia.util.apriModale(`
            <h2 class="modale-titolo">${esc(titolo)}</h2>
            <div class="schede" role="tablist">
                <button type="button" class="scheda" role="tab" aria-selected="true" data-s="archivio">${Griglia.icona('cartella')}<span>Archivio</span></button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-s="cerca">${Griglia.icona('cerca')}<span>Cerca su YouTube</span></button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-s="link">${Griglia.icona('importa')}<span>Da un link</span></button>
            </div>
            <div class="dettagli-video" id="svDettagli" hidden>
                <div class="dettagli-video-intro">
                    <strong>${Griglia.icona('spunta')} Video scelto</strong>
                    <span class="nota nota-piccola">Controlla titolo, categoria e tempi, poi premi «${gestione ? 'Salva in archivio' : 'Salva e usa'}».</span>
                    <a id="svDetLink" class="link-esterno" href="#" target="_blank" rel="noopener">Apri su YouTube</a>
                </div>
                <div class="dettagli-video-testa">
                    <img id="svDetImg" alt="">
                    <div style="flex:1;min-width:0">
                        <label class="etichetta-campo" for="svDetTitolo">Titolo</label>
                        <input type="text" class="campo" id="svDetTitolo" maxlength="200">
                    </div>
                </div>
                <div class="campo-riga" style="flex-wrap:wrap">
                    <label>Categoria <input type="text" class="campo campo-compatto" id="svDetCategoria" list="svCategorieDl" maxlength="100" placeholder="Es. Cartoni" style="width:160px"><datalist id="svCategorieDl"></datalist></label>
                    <label>Inizio ${htmlCampoTempo('svDetInizio')}</label>
                    <label>Fine ${htmlCampoTempo('svDetFine')}</label>
                </div>
                <p class="nota nota-piccola">Minuti e secondi. Vuoto = dall'inizio / fino alla fine. Esempio: da 1 min 00 s a 2 min 30 s.</p>
                <p class="nota nota-piccola" id="svDetAvvisoCelle" hidden>${Griglia.icona('attenzione')} Le celle che usano già questo video tengono i loro tempi: per cambiarli apri il comunicatore in «Modifica», tocca la cella e imposta Inizio e Fine lì (oppure scegli di nuovo il video dall'archivio).</p>
                <div class="modale-azioni" style="margin-top:12px">
                    <button type="button" class="btn btn-secondario" id="svDetAnnulla">Annulla</button>
                    <button type="button" class="btn btn-primario" id="svDetOk">${gestione ? 'Salva in archivio' : 'Salva e usa'}</button>
                </div>
            </div>
            <section data-sez="archivio">
                <div class="filtri-video">
                    <select class="campo campo-compatto" id="svCategoria"><option value="">Tutte le categorie</option></select>
                    <div class="campo-con-icona" style="flex:1">${Griglia.icona('cerca')}<input type="search" class="campo" id="svFiltro" placeholder="Cerca nell'archivio…"></div>
                </div>
                <div class="lista-video" id="svLista"><p class="nota">Caricamento…</p></div>
            </section>
            <section data-sez="cerca" hidden>
                <div class="filtri-video">
                    <div class="campo-con-icona" style="flex:1">${Griglia.icona('cerca')}<input type="search" class="campo" id="svCerca" placeholder="Es. Peppa Pig italiano" autocomplete="off" enterkeyhint="search"></div>
                    <button type="button" class="btn btn-primario" id="svCercaBtn">Cerca</button>
                </div>
                <p class="nota nota-piccola">Scrivi e premi «Cerca» (o Invio). Ricerca sicura in italiano, senza link da copiare: tocca un video per sceglierlo, controlla il titolo nel riquadro «Video scelto» qui sopra e premi «${gestione ? 'Salva in archivio' : 'Salva e usa'}». Le ricerche su YouTube sono circa cento al giorno: se finiscono, usa «Da un link».</p>
                <div class="lista-video" id="svRisultati"></div>
            </section>
            <section data-sez="link" hidden>
                <label class="etichetta-campo" for="svLink">Link o ID del video YouTube</label>
                <input type="url" class="campo" id="svLink" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off">
                <p class="nota nota-piccola">Copia il link dal browser o dall'app YouTube (Condividi → Copia link) e incollalo qui: il titolo viene letto da solo.</p>
                <div id="svAnteprimaLink" class="anteprima-video" hidden></div>
            </section>
`, { larga: true });

        const q = (s) => box.querySelector(s);
        let categorie = [];
        let scelto = null;   // { id, titolo, categoria, inizio, fine }

        // Cambio scheda: il riquadro del video scelto resta visibile, così non si perde il lavoro
        function mostraScheda(nome) {
            box.querySelectorAll('[role="tab"]').forEach(x => x.setAttribute('aria-selected', x.dataset.s === nome ? 'true' : 'false'));
            box.querySelectorAll('[data-sez]').forEach(s => s.hidden = s.dataset.sez !== nome);
            if (nome === 'cerca') setTimeout(() => q('#svCerca').focus(), 50);
            if (nome === 'link') setTimeout(() => q('#svLink').focus(), 50);
        }
        box.querySelectorAll('[role="tab"]').forEach(t => t.addEventListener('click', () => mostraScheda(t.dataset.s)));

        async function caricaCategorie() {
            try {
                categorie = await archivio.categorie();
                q('#svCategoria').innerHTML = '<option value="">Tutte le categorie</option>' + categorie.map(c => `<option value="${esc(c.categoria)}">${esc(c.categoria)} (${c.n})</option>`).join('');
                q('#svCategorieDl').innerHTML = categorie.map(c => `<option value="${esc(c.categoria)}">`).join('');
            } catch (e) { /* archivio vuoto o non disponibile */ }
        }

        async function caricaArchivio(evidenziaId = null) {
            const cont = q('#svLista');
            cont.innerHTML = '<p class="nota">Caricamento…</p>';
            try {
                const lista = await archivio.lista({ categoria: q('#svCategoria').value, testo: q('#svFiltro').value.trim() });
                if (!lista.length) { cont.innerHTML = `<p class="nota">${Griglia.icona('info')} Archivio vuoto: cerca su YouTube o incolla un link per aggiungere il primo video.</p>`; return; }
                cont.innerHTML = lista.map(v => `
                    <div class="video-scheda" data-id="${v.id_video}">
                        <button type="button" class="video-scegli" data-id="${v.id_video}" title="${gestione ? 'Modifica' : 'Usa questo video'}">
                            <img src="${esc(v.miniatura)}" alt="" loading="lazy">
                            <span class="video-titolo">${esc(v.titolo)}</span>
                            <span class="video-meta">${esc(v.categoria)}${v.inizio || v.fine ? ` · ${formattaTempo(v.inizio)}${v.fine ? ` → ${formattaTempo(v.fine)}` : ''}` : ''}</span>
                        </button>
                        <button type="button" class="btn-icona btn-icona-s video-elimina" data-id="${v.id_video}" aria-label="Togli dall'archivio" title="Togli dall'archivio">${Griglia.icona('elimina')}</button>
                    </div>`).join('');
                cont.querySelectorAll('.video-scegli').forEach(b => b.addEventListener('click', () => {
                    const v = lista.find(x => x.id_video === parseInt(b.dataset.id, 10));
                    if (!v) return;
                    if (gestione) { mostraDettagli({ id: v.id_youtube, titolo: v.titolo, categoria: v.categoria, inizio: v.inizio, fine: v.fine, id_video: v.id_video }, b); return; }
                    onScelta({ id: v.id_youtube, titolo: v.titolo, inizio: v.inizio, fine: v.fine });
                    Griglia.util.chiudiModale();
                }));
                cont.querySelectorAll('.video-elimina').forEach(b => b.addEventListener('click', async () => {
                    const v = lista.find(x => x.id_video === parseInt(b.dataset.id, 10));
                    const ok = await Griglia.util.conferma('Togliere dall\'archivio?', `«${v.titolo}» non sarà più proposto. Le celle che già lo usano continuano a funzionare.`, { ok: 'Togli', pericolo: true });
                    if (!ok) { riapri(); return; }
                    try { await archivio.elimina(v.id_video); Griglia.util.toast('Video tolto dall\'archivio', 'ok'); } catch (e) { Griglia.util.toast(e.message, 'errore'); }
                    riapri();
                }));
                if (evidenziaId) {
                    const nuova = cont.querySelector(`.video-scheda[data-id="${evidenziaId}"]`);
                    if (nuova) { nuova.classList.add('video-scelta'); nuova.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                }
            } catch (e) {
                cont.innerHTML = `<p class="nota">${esc(e.message)}</p>`;
            }
        }
        // Le conferme chiudono la modale corrente: la riapriamo nello stesso stato
        function riapri() { apriSelettore(opzioni); }

        q('#svCategoria').addEventListener('change', caricaArchivio);
        q('#svFiltro').addEventListener('input', Griglia.util.debounce(caricaArchivio, 300));

        // Ricerca YouTube
        const cerca = Griglia.util.debounce(async () => {
            const cont = q('#svRisultati');
            const testo = q('#svCerca').value.trim();
            if (testo.length < 2) { cont.innerHTML = ''; return; }
            cont.innerHTML = '<p class="nota">Ricerca su YouTube…</p>';
            try {
                const ris = await cercaYouTube(testo, 12);
                if (q('#svCerca').value.trim() !== testo) return;
                if (!ris.length) { cont.innerHTML = '<p class="nota">Nessun video trovato</p>'; return; }
                cont.innerHTML = ris.map(v => `
                    <button type="button" class="video-scheda video-scegli" data-yt="${v.id}">
                        <img src="${esc(v.miniatura)}" alt="" loading="lazy">
                        <span class="video-titolo">${esc(v.titolo)}</span>
                        <span class="video-meta">${esc(v.canale)}</span>
                    </button>`).join('');
                cont.querySelectorAll('[data-yt]').forEach(b => b.addEventListener('click', () => {
                    const v = ris.find(x => x.id === b.dataset.yt);
                    mostraDettagli({ id: v.id, titolo: v.titolo, categoria: q('#svCategoria').value || '', inizio: 0, fine: 0 }, b);
                }));
            } catch (e) { cont.innerHTML = `<p class="nota">${esc(e.message)}</p>`; }
        }, 500);
        // Solo su richiesta (Cerca o Invio), non mentre si scrive: ogni ricerca consuma quota YouTube
        q('#svCercaBtn').addEventListener('click', () => cerca.subito());
        q('#svCerca').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cerca.subito(); } });

        // Incolla link
        q('#svLink').addEventListener('input', Griglia.util.debounce(async () => {
            const testo = q('#svLink').value.trim();
            const id = estraiId(testo);
            const ant = q('#svAnteprimaLink');
            if (!id) {
                // Testo che non è un link YouTube: lo diciamo, invece di restare muti
                ant.hidden = testo.length < 6;
                ant.innerHTML = testo.length < 6 ? '' : `<p class="nota">${Griglia.icona('attenzione')} Non sembra un link YouTube. Va bene un link come <code>https://www.youtube.com/watch?v=…</code> o <code>https://youtu.be/…</code>, oppure l'ID di 11 caratteri.</p>`;
                return;
            }
            ant.hidden = false;
            ant.innerHTML = '<p class="nota">Lettura informazioni…</p>';
            try {
                const info = await archivio.info(id);
                ant.innerHTML = '';
                mostraDettagli({ id, titolo: info.titolo, categoria: q('#svCategoria').value || '', inizio: 0, fine: 0 });
            } catch (e) {
                mostraDettagli({ id, titolo: '', categoria: '', inizio: 0, fine: 0 });
                ant.innerHTML = `<p class="nota">${esc(e.message)}: scrivi il titolo a mano.</p>`;
            }
        }, 400));

        function mostraDettagli(v, scheda = null) {
            scelto = v;
            box.querySelectorAll('.video-scelta').forEach(x => x.classList.remove('video-scelta'));
            if (scheda) scheda.closest('.video-scheda')?.classList.add('video-scelta');
            q('#svDettagli').hidden = false;
            q('#svDetLink').href = `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`;
            q('#svDetImg').src = miniatura(v.id);
            q('#svDetTitolo').value = v.titolo || '';
            q('#svDetCategoria').value = v.categoria || '';
            scriviCampoTempo(box, 'svDetInizio', v.inizio);
            scriviCampoTempo(box, 'svDetFine', v.fine);
            q('#svDetAvvisoCelle').hidden = !v.id_video;   // solo quando si modifica un video già in archivio
            q('#svDettagli').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => q('#svDetTitolo').focus(), 50);
        }
        q('#svDetAnnulla').addEventListener('click', () => { q('#svDettagli').hidden = true; scelto = null; box.querySelectorAll('.video-scelta').forEach(x => x.classList.remove('video-scelta')); });
        q('#svDetOk').addEventListener('click', async () => {
            if (!scelto) return;
            const dati = {
                id_youtube: scelto.id,
                titolo: q('#svDetTitolo').value.trim() || scelto.titolo || `Video ${scelto.id}`,
                categoria: q('#svDetCategoria').value.trim() || 'Varie',
                inizio: leggiCampoTempo(box, 'svDetInizio'),
                fine: leggiCampoTempo(box, 'svDetFine')
            };
            if (dati.fine > 0 && dati.fine <= dati.inizio) { Griglia.util.toast('Il tempo di fine deve essere maggiore di quello di inizio', 'errore'); return; }
            q('#svDetOk').disabled = true;
            try {
                const salvato = scelto.id_video ? await archivio.aggiorna(Object.assign({ id: scelto.id_video }, dati)) : await archivio.salva(dati);
                if (gestione) {
                    const nuovo = !scelto.id_video;
                    Griglia.util.toast(nuovo ? 'Video salvato in archivio' : 'Video aggiornato', 'ok');
                    q('#svDettagli').hidden = true; scelto = null;
                    box.querySelectorAll('.video-scelta').forEach(x => x.classList.remove('video-scelta'));
                    q('#svLink').value = ''; q('#svAnteprimaLink').hidden = true; q('#svAnteprimaLink').innerHTML = '';
                    // Si torna all'archivio, senza filtri, con il video appena salvato in evidenza
                    if (nuovo) { q('#svCategoria').value = ''; q('#svFiltro').value = ''; mostraScheda('archivio'); }
                    caricaCategorie();
                    caricaArchivio(salvato.id_video);
                }
                else { onScelta({ id: salvato.id_youtube, titolo: salvato.titolo, inizio: salvato.inizio, fine: salvato.fine }); Griglia.util.chiudiModale(); }
            } catch (e) { Griglia.util.toast(e.message, 'errore', 5000); }
            finally { q('#svDetOk').disabled = false; }
        });

        caricaCategorie();
        caricaArchivio();
        return box;
    }

    // ---------- Schermo di riproduzione ----------
    let apiPronta = null;
    function caricaApiYouTube() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (apiPronta) return apiPronta;
        apiPronta = new Promise((risolvi, rifiuta) => {
            const prec = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { if (typeof prec === 'function') prec(); risolvi(); };
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            s.onerror = () => { apiPronta = null; rifiuta(new Error('YouTube non raggiungibile')); };
            document.head.appendChild(s);
            setTimeout(() => { if (!(window.YT && window.YT.Player)) { apiPronta = null; rifiuta(new Error('YouTube non risponde')); } }, 12000);
        });
        return apiPronta;
    }

    const Schermo = {
        el: null, player: null, app: null,
        scaletta: [], indice: -1, rip: null, aperto: false,
        timer: null, timerTick: null, rimanenti: 0, monitorFine: null, stato: 'fermo', // fermo | riproduzione | pausaTimer | finito
        _suTasto: null, _bloccaPromemoria: null,

        precarica() { caricaApiYouTube().catch(() => {}); },

        costruisci() {
            if (this.el) return;
            const el = document.createElement('div');
            el.id = 'schermoVideo';
            el.className = 'schermo-video';
            el.hidden = true;
            el.innerHTML = `
                <div class="sv-player"><div id="svPlayer"></div></div>
                <div class="sv-tocco" id="svTocco" aria-hidden="true"></div>
                <div class="sv-testata">
                    <button type="button" class="sv-indietro" id="svIndietro">${Griglia.icona('indietro')}<span>Indietro</span></button>
                    <span class="sv-titolo" id="svTitolo"></span>
                    <span class="sv-timer" id="svTimer" hidden></span>
                </div>
                <div class="sv-messaggio" id="svPausa" hidden>
                    <div class="sv-messaggio-box">${Griglia.icona('pausa')}<strong>Pausa</strong><span>Premi Spazio o tocca lo schermo per continuare</span></div>
                </div>
                <div class="sv-messaggio" id="svFine" hidden>
                    <div class="sv-messaggio-box">${Griglia.icona('ok')}<strong>Video finito</strong><span id="svFineTesto">Tocca Indietro per tornare alle scelte</span></div>
                </div>
                <div class="sv-messaggio" id="svAvvia" hidden>
                    <div class="sv-messaggio-box sv-avvia-box">${Griglia.icona('gioca')}<strong>Tocca per avviare</strong></div>
                </div>
                <div class="sv-messaggio" id="svErrore" hidden>
                    <div class="sv-messaggio-box">${Griglia.icona('errore')}<strong>Video non disponibile</strong><span id="svErroreTesto"></span></div>
                </div>`;
            document.body.appendChild(el);
            this.el = el;
            el.querySelector('#svIndietro').addEventListener('click', () => this.chiudi());
            el.querySelector('#svTocco').addEventListener('click', () => this.interruttore('tocco'));
            el.querySelector('#svPausa').addEventListener('click', () => this.interruttore('tocco'));
            el.querySelector('#svFine').addEventListener('click', () => this.interruttore('tocco'));
            el.querySelector('#svAvvia').addEventListener('click', () => { this.el.querySelector('#svAvvia').hidden = true; if (this.player) this.player.playVideo(); });
            this._suTasto = (e) => {
                if (!this.aperto) return;
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) this.interruttore('tasto'); }
                else if (e.key === 'Escape') { e.preventDefault(); this.chiudi(); }
            };
        },

        /** Apre lo schermo sul video della cella; le altre celle video della pagina formano la scaletta */
        async apri({ app, pagina, cella }) {
            this.costruisci();
            this.app = app;
            this.scaletta = Griglia.Modello.celleVideo(pagina);
            if (!this.scaletta.some(c => c.id === cella.id)) this.scaletta.unshift(cella);
            this.indice = this.scaletta.findIndex(c => c.id === cella.id);
            this.rip = Object.assign({}, Griglia.Modello.RIPRODUZIONE_DEFAULT, pagina.riproduzione || {});
            this.aperto = true;
            this.el.hidden = false;
            document.body.classList.add('con-schermo-video');
            document.addEventListener('keydown', this._suTasto);
            if (app && app.input) app.input.sospendi(true);
            Griglia.Voce.stop();
            this.el.querySelector('#svTimer').hidden = !(this.rip.mostraTimer);
            try {
                await caricaApiYouTube();
                if (!this.aperto) return;
                this.riproduci(this.indice);
            } catch (e) {
                this.mostraErrore(e.message);
            }
        },

        chiudi() {
            if (!this.aperto) return;
            this.aperto = false;
            this.fermaTimer();
            this.fermaMonitor();
            try { if (this.player && this.player.stopVideo) this.player.stopVideo(); } catch (e) { /* ignora */ }
            this.el.hidden = true;
            ['#svPausa', '#svFine', '#svAvvia', '#svErrore'].forEach(s => this.el.querySelector(s).hidden = true);
            document.body.classList.remove('con-schermo-video');
            document.removeEventListener('keydown', this._suTasto);
            this.stato = 'fermo';
            if (this.app && this.app.input && this.app.stato.modalita === 'usa') { this.app.input.sospendi(false); this.app.input.aggiorna(); }
        },

        cellaCorrente() { return this.scaletta[this.indice] || null; },

        riproduci(indice) {
            const cella = this.scaletta[indice];
            if (!cella) return;
            this.indice = indice;
            const v = cella.video;
            ['#svPausa', '#svFine', '#svAvvia', '#svErrore'].forEach(s => this.el.querySelector(s).hidden = true);
            this.el.querySelector('#svTitolo').textContent = cella.etichetta || v.titolo || '';
            this.fermaTimer();
            this.fermaMonitor();
            this.stato = 'riproduzione';

            const vars = { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, fs: 0, disablekb: 1, iv_load_policy: 3, origin: location.origin };
            if (v.inizio > 0) vars.start = v.inizio;
            if (this.player && this.player.loadVideoById) {
                this.player.loadVideoById({ videoId: v.id, startSeconds: v.inizio || 0 });
            } else {
                const cont = this.el.querySelector('#svPlayer');
                cont.innerHTML = '';
                this.player = new YT.Player('svPlayer', {
                    videoId: v.id, width: '100%', height: '100%', playerVars: vars,
                    events: {
                        onReady: (e) => { try { e.target.playVideo(); } catch (err) { /* ignora */ } this.controllaAvvio(); },
                        onStateChange: (e) => this.suStato(e.data),
                        onError: (e) => this.mostraErrore(e.data === 101 || e.data === 150 ? 'Il proprietario non permette la riproduzione fuori da YouTube' : 'Video non trovato o non riproducibile')
                    }
                });
            }
            this.controllaAvvio();
            this.avviaMonitor();
            const durata = (v.durata !== null && v.durata !== undefined) ? v.durata : this.rip.durata;
            if (durata > 0) this.avviaTimer(durata);
            else this.el.querySelector('#svTimer').hidden = true;
        },

        /** Se dopo un po' il video non è partito (autoplay bloccato), mostra "Tocca per avviare" */
        controllaAvvio() {
            clearTimeout(this._controlloAvvio);
            this._controlloAvvio = setTimeout(() => {
                if (!this.aperto || this.stato !== 'riproduzione' || !this.player || typeof this.player.getPlayerState !== 'function') return;
                const s = this.player.getPlayerState();
                if (s !== YT.PlayerState.PLAYING && s !== YT.PlayerState.BUFFERING) this.el.querySelector('#svAvvia').hidden = false;
            }, 2500);
        },

        suStato(stato) {
            if (!this.aperto) return;
            if (stato === YT.PlayerState.PLAYING) { this.el.querySelector('#svAvvia').hidden = true; }
            if (stato === YT.PlayerState.ENDED) this.suFineVideo();
        },

        suFineVideo() {
            if (!this.aperto || this.stato === 'finito') return;
            this.fermaTimer();
            this.fermaMonitor();
            this.stato = 'finito';
            if (this.rip.fineVideo === 'torna') { this.chiudi(); return; }
            if (this.rip.fineVideo === 'successivo' && this.scaletta.length > 1) { this.riproduci((this.indice + 1) % this.scaletta.length); return; }
            const fine = this.el.querySelector('#svFine');
            this.el.querySelector('#svFineTesto').textContent = this.rip.spazio === 'disabilitato' || this.scaletta.length < 2 ? 'Tocca Indietro per tornare alle scelte' : 'Premi Spazio o tocca lo schermo per un altro video';
            fine.hidden = false;
        },

        // Fine spezzone (fine > 0): controllo ogni 250 ms come in "Ascolto la musica"
        avviaMonitor() {
            const cella = this.cellaCorrente();
            if (!cella || !cella.video.fine) return;
            const fine = cella.video.fine;
            // Si arma solo dopo aver visto il video prima del punto di fine: subito dopo loadVideoById
            // il player può riportare per un attimo il tempo del video precedente
            let armato = false;
            this.monitorFine = setInterval(() => {
                if (!this.player || typeof this.player.getCurrentTime !== 'function') return;
                const t = this.player.getCurrentTime();
                if (t < fine) { armato = true; return; }
                if (armato) { try { this.player.pauseVideo(); } catch (e) { /* ignora */ } this.suFineVideo(); }
            }, 250);
        },
        fermaMonitor() { if (this.monitorFine) clearInterval(this.monitorFine); this.monitorFine = null; },

        avviaTimer(secondi) {
            this.fermaTimer();
            this.rimanenti = secondi;
            const badge = this.el.querySelector('#svTimer');
            badge.hidden = !this.rip.mostraTimer;
            badge.textContent = formattaTempo(this.rimanenti);
            badge.classList.remove('sv-timer-attenzione');
            this.timerTick = setInterval(() => {
                this.rimanenti--;
                badge.textContent = formattaTempo(Math.max(0, this.rimanenti));
                badge.classList.toggle('sv-timer-attenzione', this.rimanenti <= 10);
                if (this.rimanenti <= 0) this.suFineTimer();
            }, 1000);
        },
        fermaTimer() { if (this.timerTick) clearInterval(this.timerTick); this.timerTick = null; },

        suFineTimer() {
            this.fermaTimer();
            if (this.rip.fineTimer === 'torna') { this.chiudi(); return; }
            try { this.player.pauseVideo(); } catch (e) { /* ignora */ }
            this.stato = 'pausaTimer';
            this.el.querySelector('#svPausa').hidden = false;
        },

        /** Spazio, Invio o tocco sullo schermo */
        interruttore(origine) {
            if (!this.aperto) return;
            if (this.stato === 'pausaTimer') {
                // Riprende con un nuovo timer
                this.el.querySelector('#svPausa').hidden = true;
                this.stato = 'riproduzione';
                try { this.player.playVideo(); } catch (e) { /* ignora */ }
                const cella = this.cellaCorrente();
                const durata = (cella.video.durata !== null && cella.video.durata !== undefined) ? cella.video.durata : this.rip.durata;
                if (durata > 0) this.avviaTimer(durata);
                return;
            }
            if (this.stato === 'riproduzione' && this.rip.spazioBloccato) {
                this.promemoriaBloccato();
                return;
            }
            if (this.rip.spazio === 'disabilitato' || this.scaletta.length < 2) {
                if (this.stato === 'finito' && this.scaletta.length === 1) this.riproduci(this.indice);   // rivedi lo stesso
                return;
            }
            let prossimo;
            if (this.rip.spazio === 'casuale') {
                do { prossimo = Math.floor(Math.random() * this.scaletta.length); } while (prossimo === this.indice && this.scaletta.length > 1);
            } else {
                prossimo = (this.indice + 1) % this.scaletta.length;
            }
            this.riproduci(prossimo);
        },

        promemoriaBloccato() {
            const badge = this.el.querySelector('#svTimer');
            if (badge.hidden) return;
            badge.classList.add('sv-timer-bloccato');
            clearTimeout(this._bloccaPromemoria);
            this._bloccaPromemoria = setTimeout(() => badge.classList.remove('sv-timer-bloccato'), 600);
        },

        mostraErrore(testo) {
            if (!this.aperto) return;
            this.fermaTimer();
            this.fermaMonitor();
            this.stato = 'finito';
            this.el.querySelector('#svErroreTesto').textContent = testo || '';
            this.el.querySelector('#svErrore').hidden = false;
        }
    };

    return { estraiId, miniatura, formattaTempo, analizzaTempo, htmlCampoTempo, leggiCampoTempo, scriviCampoTempo, cercaYouTube, archivio, apriSelettore, Schermo };
})();
