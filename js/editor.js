/**
 * Griglia - Editor in pagina
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Nessuna finestra a schede: si tocca una cella e si modifica nel pannello a lato,
 * si trascina per spostare, si tocca uno spazio vuoto per aggiungere.
 * Tutte le modifiche passano da snapshot() (annulla) e app.segnaModificato() (salvataggio).
 */
window.Griglia = window.Griglia || {};

Griglia.Editor = (function () {
    const M = () => Griglia.Modello;
    const U = () => Griglia.util;
    const esc = (s) => Griglia.util.escapeHtml(s);
    const MAX_ANNULLA = 40;

    let app = null;
    let el = {};
    let storia = [];
    let cellaApertaId = null;
    let schedaImmagine = 'arasaac';
    let schedaVoce = 'sintesi';                              // sintesi | registrazione
    let statoAudio = { fase: 'pronto', registratore: null }; // pronto | registrazione | lavoro
    let drag = null;
    let unione = null;                                       // { baseId, celle: Set<id>, vuoti: Set<"x,y"> } mentre si uniscono box
    let cercaDebounce = null;
    let inputFile = null;

    // ---------- Ciclo di vita ----------
    function init(appRef) {
        app = appRef;
        el.barra = document.getElementById('editorBarra');
        el.pannello = document.getElementById('pannello');
        el.palco = document.getElementById('palco');
        el.palco.addEventListener('click', onClickPalco);
        el.palco.addEventListener('pointerdown', onPointerDown);
        inputFile = document.createElement('input');
        inputFile.type = 'file';
        inputFile.accept = '.json,.grd,.obf,.obz,application/json,application/zip';
        inputFile.hidden = true;
        document.body.appendChild(inputFile);
        inputFile.addEventListener('change', () => { if (inputFile.files[0]) importaFile(inputFile.files[0]); inputFile.value = ''; });
    }

    function attiva() {
        storia = [];
        app.abilitaAnnulla(false);
        renderBarra();
    }

    function disattiva() {
        esciUnione();
        chiudiPannello();
        storia = [];
        app.abilitaAnnulla(false);
    }

    /** Chiamato dall'app dopo ogni rendering in modalità modifica */
    function dopoRender() {
        sincronizzaBarra();
        if (cellaApertaId && !cellaCorrente()) chiudiPannello();
        if (unione) {
            if (pag().celle.some(c => c.id === unione.baseId)) evidenziaUnione();
            else esciUnione();
        }
    }

    function doc() { return app.doc; }
    function pag() { return app.paginaCorrente(); }
    function cellaCorrente() { return cellaApertaId ? pag().celle.find(c => c.id === cellaApertaId) || null : null; }

    // ---------- Annulla ----------
    function snapshot() {
        storia.push(M().clona(doc()));
        if (storia.length > MAX_ANNULLA) storia.shift();
        app.abilitaAnnulla(true);
    }
    function annulla() {
        if (!storia.length) return;
        const prec = storia.pop();
        app.sostituisciDoc(prec);
        app.abilitaAnnulla(storia.length > 0);
        app.segnaModificato();
        app.render();
        if (cellaApertaId) { const c = cellaCorrente(); if (c) riempiPannello(c); else chiudiPannello(); }
        U().toast('Modifica annullata', 'info', 1500);
    }
    function applica({ rendering = true } = {}) {
        app.segnaModificato();
        if (rendering) app.render();
    }

    // ---------- Barra dell'editor ----------
    function renderBarra() {
        el.barra.innerHTML = `
            <div class="editor-gruppo">
                <label class="editor-etichetta" for="edPagina">${Griglia.icona('pagina')}<span>Pagina</span></label>
                <select class="campo campo-compatto" id="edPagina" aria-label="Pagina da modificare"></select>
                <button type="button" class="btn-icona btn-icona-s" id="edNuovaPagina" title="Nuova pagina" aria-label="Nuova pagina">${Griglia.icona('piu')}</button>
                <button type="button" class="btn-icona btn-icona-s" id="edRinomina" title="Rinomina pagina" aria-label="Rinomina pagina">${Griglia.icona('modifica')}</button>
                <button type="button" class="btn-icona btn-icona-s" id="edHome" title="Imposta come pagina iniziale" aria-label="Imposta come pagina iniziale">${Griglia.icona('stella')}</button>
                <button type="button" class="btn-icona btn-icona-s" id="edEliminaPagina" title="Elimina pagina" aria-label="Elimina pagina">${Griglia.icona('elimina')}</button>
            </div>
            <div class="editor-gruppo contatore" aria-label="Righe">
                <span class="editor-etichetta">Righe</span>
                <button type="button" class="btn-icona btn-icona-s" data-dim="righe" data-delta="-1" aria-label="Meno righe">${Griglia.icona('meno')}</button>
                <output id="edRighe">3</output>
                <button type="button" class="btn-icona btn-icona-s" data-dim="righe" data-delta="1" aria-label="Più righe">${Griglia.icona('piu')}</button>
            </div>
            <div class="editor-gruppo contatore" aria-label="Colonne">
                <span class="editor-etichetta">Colonne</span>
                <button type="button" class="btn-icona btn-icona-s" data-dim="colonne" data-delta="-1" aria-label="Meno colonne">${Griglia.icona('meno')}</button>
                <output id="edColonne">4</output>
                <button type="button" class="btn-icona btn-icona-s" data-dim="colonne" data-delta="1" aria-label="Più colonne">${Griglia.icona('piu')}</button>
            </div>
            <div class="editor-gruppo">
                <button type="button" class="btn-testo btn-testo-s" id="edRiproduzione" title="Come si guardano i video di questa pagina: tempo, Spazio, fine video">${Griglia.icona('gioca')}<span>Video</span></button>
                <button type="button" class="btn-testo btn-testo-s" id="edParole" title="Scrivi le parole, una per riga: le celle si creano da sole con pittogramma e colore">${Griglia.icona('modifica')}<span>Parole</span></button>
                <button type="button" class="btn-testo btn-testo-s" id="edImporta" title="Aggiungi pagine da un file .obz, .obf, .grd o .json">${Griglia.icona('importa')}<span>Importa</span></button>
                <button type="button" class="btn-testo btn-testo-s" id="edEsporta" title="Scarica il comunicatore">${Griglia.icona('scarica')}<span>Esporta</span></button>
            </div>
            <span class="editor-suggerimento">Tocca una cella per modificarla, trascinala per spostarla, tocca uno spazio vuoto per aggiungerne una.</span>`;

        el.barra.querySelector('#edPagina').addEventListener('change', e => { chiudiPannello(); app.setPagina(e.target.value); app.render(); });
        el.barra.querySelector('#edNuovaPagina').addEventListener('click', () => nuovaPagina());
        el.barra.querySelector('#edRinomina').addEventListener('click', rinominaPagina);
        el.barra.querySelector('#edHome').addEventListener('click', impostaHome);
        el.barra.querySelector('#edEliminaPagina').addEventListener('click', eliminaPagina);
        el.barra.querySelectorAll('[data-dim]').forEach(b => b.addEventListener('click', () => ridimensiona(b.dataset.dim, parseInt(b.dataset.delta, 10))));
        el.barra.querySelector('#edRiproduzione').addEventListener('click', apriRiproduzione);
        el.barra.querySelector('#edParole').addEventListener('click', apriParole);
        el.barra.querySelector('#edImporta').addEventListener('click', () => inputFile.click());
        el.barra.querySelector('#edEsporta').addEventListener('click', apriEsporta);
        sincronizzaBarra();
    }

    function sincronizzaBarra() {
        const sel = el.barra.querySelector('#edPagina');
        if (!sel) return;
        const d = doc(), p = pag();
        sel.innerHTML = d.pagine.map(x => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${x.id === d.paginaHomeId ? '★ ' : ''}${esc(x.nome)} (${x.celle.length})</option>`).join('');
        el.barra.querySelector('#edRighe').value = p.righe;
        el.barra.querySelector('#edColonne').value = p.colonne;
        const home = el.barra.querySelector('#edHome');
        home.classList.toggle('attivo', p.id === d.paginaHomeId);
        home.title = p.id === d.paginaHomeId ? 'Questa è la pagina iniziale' : 'Imposta come pagina iniziale';
        el.barra.querySelector('#edEliminaPagina').disabled = d.pagine.length <= 1;
    }

    // ---------- Pagine ----------
    async function nuovaPagina(daPannello = false) {
        const nome = await U().chiediTesto('Nome della nuova pagina', '', { ok: 'Crea', segnaposto: 'Es. Cibo, Giochi, Scuola' });
        if (!nome) return null;
        snapshot();
        const p = pag();
        const nuova = M().nuovaPagina(nome, p.righe, p.colonne);
        doc().pagine.push(nuova);
        if (!daPannello) { chiudiPannello(); app.setPagina(nuova.id); }
        applica();
        U().toast(`Pagina «${nome}» creata`, 'ok');
        return nuova;
    }

    async function rinominaPagina() {
        const p = pag();
        const nome = await U().chiediTesto('Rinomina pagina', p.nome, { ok: 'Rinomina' });
        if (!nome || nome === p.nome) return;
        snapshot();
        p.nome = nome;
        applica();
    }

    function impostaHome() {
        const p = pag();
        if (doc().paginaHomeId === p.id) return;
        snapshot();
        doc().paginaHomeId = p.id;
        applica();
        U().toast(`«${p.nome}» è la pagina iniziale`, 'ok');
    }

    async function eliminaPagina() {
        const d = doc(), p = pag();
        if (d.pagine.length <= 1) return;
        const collegate = d.pagine.reduce((n, x) => n + x.celle.filter(c => c.vaiA === p.id).length, 0);
        const ok = await U().conferma('Eliminare la pagina?', `«${p.nome}» con ${p.celle.length} celle verrà eliminata.${collegate ? ` ${collegate} celle che la aprivano diventeranno celle che parlano.` : ''}`, { ok: 'Elimina', pericolo: true });
        if (!ok) return;
        snapshot();
        d.pagine = d.pagine.filter(x => x.id !== p.id);
        d.pagine.forEach(x => x.celle.forEach(c => { if (c.vaiA === p.id) c.vaiA = null; }));
        if (d.paginaHomeId === p.id) d.paginaHomeId = d.pagine[0].id;
        chiudiPannello();
        app.setPagina(d.paginaHomeId);
        applica();
    }

    async function ridimensiona(dim, delta) {
        const p = pag();
        const righe = dim === 'righe' ? p.righe + delta : p.righe;
        const colonne = dim === 'colonne' ? p.colonne + delta : p.colonne;
        if (righe < 1 || colonne < 1 || righe > 12 || colonne > 12) return;
        const perse = p.celle.filter(c => c.x >= colonne || c.y >= righe).length;
        if (perse) {
            const ok = await U().conferma('Ridurre la griglia?', `${perse} celle sono fuori dalla nuova misura e verranno eliminate.`, { ok: 'Riduci', pericolo: true });
            if (!ok) return;
        }
        snapshot();
        M().ridimensionaPagina(p, righe, colonne);
        if (cellaApertaId && !cellaCorrente()) chiudiPannello();
        applica();
    }

    // ---------- Celle: click, creazione, pannello ----------
    function onClickPalco(e) {
        if (app.stato.modalita !== 'modifica') return;
        if (unione) { sceltaUnione(e); return; }
        if (drag && drag.mosso) { drag = null; return; }
        const slot = e.target.closest('.slot-vuoto');
        if (slot) { creaCella(parseInt(slot.dataset.x, 10), parseInt(slot.dataset.y, 10)); return; }
        const cella = e.target.closest('.cella');
        if (cella) apriCella(cella.dataset.id);
    }

    function creaCella(x, y) {
        const p = pag();
        if (M().cellaIn(p, x, y)) return;
        snapshot();
        const c = M().nuovaCella(x, y);
        p.celle.push(c);
        cellaApertaId = c.id;
        app.setCellaSelezionata(c.id);
        applica();
        apriCella(c.id, true);
    }

    function apriCella(id, nuova = false) {
        const c = pag().celle.find(x => x.id === id);
        if (!c) return;
        cellaApertaId = id;
        app.setCellaSelezionata(id);
        el.palco.querySelectorAll('.cella-selezionata').forEach(x => x.classList.remove('cella-selezionata'));
        el.palco.querySelector(`.cella[data-id="${id}"]`)?.classList.add('cella-selezionata');
        schedaImmagine = c.immagine.tipo === 'upload' || c.immagine.tipo === 'dati' || c.immagine.tipo === 'url' ? 'carica' : 'arasaac';
        schedaVoce = c.audio ? 'registrazione' : 'sintesi';
        riempiPannello(c);
        el.pannello.hidden = false;
        document.body.classList.add('con-pannello');
        if (nuova) setTimeout(() => el.pannello.querySelector('#pcEtichetta')?.focus(), 60);
    }

    function chiudiPannello() {
        esciUnione();
        annullaRegistrazione();
        cellaApertaId = null;
        app.setCellaSelezionata(null);
        el.pannello.hidden = true;
        el.pannello.innerHTML = '';
        document.body.classList.remove('con-pannello');
        el.palco.querySelectorAll('.cella-selezionata').forEach(x => x.classList.remove('cella-selezionata'));
    }

    function riempiPannello(c) {
        annullaRegistrazione();
        const d = doc(), p = pag();
        const az = M().azioneCella(c);
        const azione = az === 'pagina' ? 'vaiA' : az === 'video' ? 'video' : (c.dice ? 'diceTesto' : 'dice');
        const maxW = p.colonne - c.x, maxH = p.righe - c.y;
        const opzioni = (n, val) => Array.from({ length: n }, (_, i) => i + 1).map(v => `<option value="${v}" ${v === val ? 'selected' : ''}>${v}</option>`).join('');
        const url = M().urlImmagine(c.immagine, 300);

        el.pannello.innerHTML = `
            <div class="pannello-testata">
                <h2>${Griglia.icona('griglia')} Cella</h2>
                <button type="button" class="btn-icona" id="pcChiudi" aria-label="Chiudi pannello">${Griglia.icona('chiudi')}</button>
            </div>
            <div class="pannello-corpo">
                <div class="campo-gruppo">
                    <label class="etichetta-campo" for="pcEtichetta">Parola scritta sulla cella</label>
                    <input type="text" class="campo" id="pcEtichetta" maxlength="120" value="${esc(c.etichetta)}" placeholder="Es. mangiare" autocomplete="off">
                </div>

                <div class="campo-gruppo">
                    <span class="etichetta-campo">Immagine</span>
                    <div class="immagine-blocco">
                        <div class="anteprima-immagine" id="pcAnteprima" style="--c:${M().coloreCella(c)}">
                            ${url ? `<img src="${esc(url)}" alt="">` : `<span class="anteprima-vuota">${Griglia.icona('immagine')}</span>`}
                        </div>
                        <div class="schede schede-verticali" role="tablist">
                            <button type="button" class="scheda" role="tab" data-img="arasaac" aria-selected="${schedaImmagine === 'arasaac'}">${Griglia.icona('cerca')}<span>Pittogrammi</span></button>
                            <button type="button" class="scheda" role="tab" data-img="carica" aria-selected="${schedaImmagine === 'carica'}">${Griglia.icona('carica')}<span>Dal dispositivo</span></button>
                            <button type="button" class="scheda scheda-secondaria" data-img="nessuna" ${c.immagine.tipo === 'nessuna' ? 'disabled' : ''}>${Griglia.icona('chiudi')}<span>Togli</span></button>
                        </div>
                    </div>
                    <div class="scheda-contenuto" data-img-pannello="arasaac" ${schedaImmagine === 'arasaac' ? '' : 'hidden'}>
                        <div class="campo-con-icona">${Griglia.icona('cerca')}<input type="search" class="campo" id="pcCerca" placeholder="Cerca un pittogramma…" autocomplete="off" value="${esc(c.etichetta)}"></div>
                        <div class="risultati" id="pcRisultati" aria-live="polite"></div>
                        <p class="nota nota-piccola">Pittogrammi ARASAAC (CC BY-NC-SA), Governo di Aragona.</p>
                    </div>
                    <div class="scheda-contenuto" data-img-pannello="carica" ${schedaImmagine === 'carica' ? '' : 'hidden'}>
                        <label class="carica-file">
                            ${Griglia.icona('immagine')}<span>Scegli una foto o un'immagine</span>
                            <input type="file" id="pcFile" accept="image/*" hidden>
                        </label>
                        <p class="nota nota-piccola">JPG, PNG, GIF o WebP. L'immagine viene ridotta a 600 px.</p>
                    </div>
                </div>

                <div class="campo-gruppo">
                    <span class="etichetta-campo">Colore (categoria della parola)</span>
                    <div class="tavolozza" role="radiogroup" id="pcColori">
                        ${M().CATEGORIE.map(cat => `<button type="button" class="swatch" role="radio" aria-checked="${c.categoria === cat.id && !c.colore}" data-cat="${cat.id}" style="--c:${cat.colore}" title="${esc(cat.nome)}" aria-label="${esc(cat.nome)}">${c.categoria === cat.id && !c.colore ? Griglia.icona('spunta') : ''}</button>`).join('')}
                        <label class="swatch swatch-personalizzato ${c.colore ? 'attivo' : ''}" title="Colore personalizzato" style="--c:${c.colore || '#ffffff'}">
                            <input type="color" id="pcColore" value="${c.colore || '#ffffff'}">${Griglia.icona('piu')}
                        </label>
                    </div>
                    <p class="nota nota-piccola" id="pcNomeCat">${esc((M().CATEGORIE.find(x => x.id === c.categoria) || {}).nome || '')}</p>
                </div>

                <div class="campo-gruppo">
                    <span class="etichetta-campo">Cosa fa quando la tocchi</span>
                    <div class="opzioni-lista" role="radiogroup">
                        <label class="opzione-lista ${azione === 'dice' ? 'attiva' : ''}"><input type="radio" name="pcAzione" value="dice" ${azione === 'dice' ? 'checked' : ''}>${Griglia.icona('parla')}<span><strong>Dice la parola</strong><small>Legge quello che c'è scritto</small></span></label>
                        <label class="opzione-lista ${azione === 'diceTesto' ? 'attiva' : ''}"><input type="radio" name="pcAzione" value="diceTesto" ${azione === 'diceTesto' ? 'checked' : ''}>${Griglia.icona('parla')}<span><strong>Dice un testo diverso</strong><small>Es. sulla cella «bagno» dice «Devo andare in bagno»</small></span></label>
                        <input type="text" class="campo campo-annidato" id="pcDice" maxlength="300" value="${esc(c.dice || '')}" placeholder="Testo da pronunciare" ${azione === 'diceTesto' ? '' : 'hidden'}>
                        <label class="opzione-lista ${azione === 'vaiA' ? 'attiva' : ''}"><input type="radio" name="pcAzione" value="vaiA" ${azione === 'vaiA' ? 'checked' : ''}>${Griglia.icona('cartella')}<span><strong>Apre una pagina</strong><small>Come una cartella; può mettere anche la parola nella frase</small></span></label>
                        <select class="campo campo-annidato" id="pcVaiA" ${azione === 'vaiA' ? '' : 'hidden'}>
                            ${d.pagine.filter(x => x.id !== p.id).map(x => `<option value="${esc(x.id)}" ${c.vaiA === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
                            <option value="__nuova__">+ Nuova pagina…</option>
                        </select>
                        <label class="interruttore campo-annidato" id="pcInFraseRiga" ${azione === 'vaiA' ? '' : 'hidden'}><input type="checkbox" id="pcInFrase" ${c.inFrase !== false ? 'checked' : ''}><span>Mette anche la parola nella frase<small class="nota nota-piccola" style="display:block;margin:0">Es. «voglio» apre le scelte e la frase diventa «io voglio…». Spegnilo per le cartelle di argomento (Cibo, Giochi).</small></span></label>
                        <label class="interruttore campo-annidato" id="pcVaiADiceRiga" ${azione === 'vaiA' ? '' : 'hidden'}><input type="checkbox" id="pcVaiADiceCheck" ${c.dice ? 'checked' : ''}><span>Dì anche una frase diversa da quella scritta<small class="nota nota-piccola" style="display:block;margin:0">La frase viene pronunciata e messa nella barra, ma non è scritta sotto l'immagine. Insieme apre comunque la pagina.</small></span></label>
                        <input type="text" class="campo campo-annidato" id="pcVaiADice" maxlength="300" value="${esc(c.dice || '')}" placeholder="Frase da dire e mettere nella barra" ${azione === 'vaiA' && c.dice ? '' : 'hidden'}>
                        <label class="opzione-lista ${azione === 'video' ? 'attiva' : ''}"><input type="radio" name="pcAzione" value="video" ${azione === 'video' ? 'checked' : ''}>${Griglia.icona('gioca')}<span><strong>Avvia un video</strong><small>YouTube a tutto schermo; le celle video della pagina sono la scaletta</small></span></label>
                        <div class="video-blocco campo-annidato" id="pcVideoBlocco" ${azione === 'video' ? '' : 'hidden'}>${htmlVideoBlocco(c)}</div>
                    </div>
                </div>
                ${htmlVoceGruppo(c, azione)}

                <div class="campo-gruppo campo-riga">
                    <label>Larghezza <select class="campo campo-compatto" id="pcW">${opzioni(maxW, c.w)}</select></label>
                    <label>Altezza <select class="campo campo-compatto" id="pcH">${opzioni(maxH, c.h)}</select></label>
                </div>
                <div class="campo-gruppo campo-riga">
                    <button type="button" class="btn btn-secondario btn-piccolo" id="pcUnisci" title="Unisci questo box con altri box vicini: diventano un box solo">${Griglia.icona('unisci')} Unisci con altri box</button>
                    ${c.w > 1 || c.h > 1 ? `<button type="button" class="btn btn-secondario btn-piccolo" id="pcDividi" title="Il box torna di una casella; le altre caselle tornano vuote">${Griglia.icona('dividi')} Dividi</button>` : ''}
                </div>
                <label class="interruttore"><input type="checkbox" id="pcNascosta" ${c.nascosta ? 'checked' : ''}><span>Nascosta: la vedi solo qui, non durante l'uso</span></label>
            </div>
            <div class="pannello-azioni">
                <button type="button" class="btn btn-secondario" id="pcProva">${Griglia.icona('prova')} Prova</button>
                <button type="button" class="btn btn-secondario" id="pcSvuota">${Griglia.icona('cancellaParola')} Svuota</button>
                <button type="button" class="btn btn-pericolo" id="pcElimina">${Griglia.icona('elimina')} Elimina</button>
            </div>`;

        collegaPannello(c);
        if (schedaImmagine === 'arasaac' && c.etichetta.trim().length >= 2) cercaArasaac(c.etichetta);
        else if (schedaImmagine === 'arasaac' && c.immagine.tipo === 'arasaac') mostraRisultati([{ id: c.immagine.id, url: Griglia.Arasaac.url(c.immagine.id), parole: [c.etichetta] }], c.immagine.id);
    }

    function collegaPannello(c) {
        const q = (s) => el.pannello.querySelector(s);
        q('#pcChiudi').addEventListener('click', chiudiPannello);

        // Etichetta: aggiornamento immediato della cella, ricerca automatica se non c'è immagine
        let primaModificaEtichetta = true;
        const aggiornaEtichetta = U().debounce(() => {
            const v = q('#pcEtichetta').value;
            if (primaModificaEtichetta) { snapshot(); primaModificaEtichetta = false; }
            c.etichetta = v.slice(0, 120);
            aggiornaCellaNelPalco(c);
            app.segnaModificato();
            sincronizzaBarra();
            if (schedaImmagine === 'arasaac' && c.immagine.tipo !== 'arasaac' && v.trim().length >= 2) { q('#pcCerca').value = v; cercaArasaac(v); }
        }, 250);
        q('#pcEtichetta').addEventListener('input', aggiornaEtichetta);
        q('#pcEtichetta').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); aggiornaEtichetta.subito(); q('#pcCerca')?.focus(); } });

        // Schede immagine
        el.pannello.querySelectorAll('[data-img]').forEach(b => b.addEventListener('click', () => {
            const t = b.dataset.img;
            if (t === 'nessuna') { snapshot(); c.immagine = { tipo: 'nessuna' }; b.disabled = true; aggiornaAnteprima(c); aggiornaCellaNelPalco(c); app.segnaModificato(); return; }
            schedaImmagine = t;
            el.pannello.querySelectorAll('[data-img]').forEach(x => x.setAttribute('aria-selected', x.dataset.img === t ? 'true' : 'false'));
            el.pannello.querySelectorAll('[data-img-pannello]').forEach(x => x.hidden = x.dataset.imgPannello !== t);
            if (t === 'arasaac' && !q('#pcRisultati').children.length && q('#pcCerca').value.trim()) cercaArasaac(q('#pcCerca').value);
        }));

        // Ricerca ARASAAC
        if (!cercaDebounce) cercaDebounce = U().debounce((v) => cercaArasaac(v), 350);
        q('#pcCerca').addEventListener('input', e => cercaDebounce(e.target.value));
        q('#pcCerca').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cercaDebounce.subito(e.target.value); } });
        q('#pcRisultati').addEventListener('click', e => {
            const r = e.target.closest('.risultato');
            if (!r) return;
            snapshot();
            c.immagine = { tipo: 'arasaac', id: parseInt(r.dataset.id, 10) };
            if (!c.etichetta.trim() && r.dataset.parola) { c.etichetta = r.dataset.parola; q('#pcEtichetta').value = c.etichetta; }
            q('#pcRisultati').querySelectorAll('.risultato').forEach(x => x.setAttribute('aria-pressed', x === r ? 'true' : 'false'));
            q('[data-img="nessuna"]').disabled = false;
            aggiornaAnteprima(c); aggiornaCellaNelPalco(c); app.segnaModificato();
        });

        // Caricamento dal dispositivo
        q('#pcFile').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            const etichettaCarica = q('.carica-file span');
            etichettaCarica.textContent = 'Caricamento…';
            try {
                const ridotta = await Griglia.Archivio.ridimensionaImmagine(file, 600);
                snapshot();
                const url = await Griglia.Archivio.uploadImmagine(ridotta, 'cella');
                c.immagine = { tipo: 'upload', url };
                q('[data-img="nessuna"]').disabled = false;
                aggiornaAnteprima(c); aggiornaCellaNelPalco(c); app.segnaModificato();
                U().toast('Immagine caricata', 'ok', 1500);
            } catch (err) {
                U().toast(err.message || 'Caricamento non riuscito', 'errore');
            } finally {
                etichettaCarica.textContent = 'Scegli una foto o un\'immagine';
                e.target.value = '';
            }
        });

        // Colori
        el.pannello.querySelectorAll('.swatch[data-cat]').forEach(b => b.addEventListener('click', () => {
            snapshot();
            c.categoria = b.dataset.cat;
            delete c.colore;
            el.pannello.querySelectorAll('.swatch[data-cat]').forEach(x => { const on = x === b; x.setAttribute('aria-checked', on); x.innerHTML = on ? Griglia.icona('spunta') : ''; });
            q('.swatch-personalizzato').classList.remove('attivo');
            q('#pcNomeCat').textContent = (M().CATEGORIE.find(x => x.id === c.categoria) || {}).nome || '';
            aggiornaAnteprima(c); aggiornaCellaNelPalco(c); app.segnaModificato();
        }));
        let primaColore = true;
        q('#pcColore').addEventListener('input', e => {
            if (primaColore) { snapshot(); primaColore = false; }
            c.colore = e.target.value.toUpperCase();
            q('.swatch-personalizzato').style.setProperty('--c', c.colore);
            q('.swatch-personalizzato').classList.add('attivo');
            el.pannello.querySelectorAll('.swatch[data-cat]').forEach(x => { x.setAttribute('aria-checked', 'false'); x.innerHTML = ''; });
            q('#pcNomeCat').textContent = 'Colore personalizzato';
            aggiornaAnteprima(c); aggiornaCellaNelPalco(c); app.segnaModificato();
        });

        // Azione
        el.pannello.querySelectorAll('input[name="pcAzione"]').forEach(r => r.addEventListener('change', async e => {
            const v = e.target.value;
            el.pannello.querySelectorAll('.opzione-lista').forEach(o => o.classList.toggle('attiva', o.querySelector('input').checked));
            q('#pcDice').hidden = v !== 'diceTesto';
            q('#pcVaiA').hidden = v !== 'vaiA';
            q('#pcInFraseRiga').hidden = v !== 'vaiA';
            q('#pcVaiADiceRiga').hidden = v !== 'vaiA';
            q('#pcVaiADice').hidden = !(v === 'vaiA' && q('#pcVaiADiceCheck').checked);
            q('#pcVideoBlocco').hidden = v !== 'video';
            q('#pcVoceGruppo').hidden = v === 'video';
            snapshot();
            if (v === 'dice') { c.dice = null; c.vaiA = null; c.video = null; }
            else if (v === 'diceTesto') { c.vaiA = null; c.video = null; c.dice = q('#pcDice').value.trim() || null; q('#pcDice').focus(); }
            else if (v === 'video') {
                c.vaiA = null; c.dice = null;
                if (!c.video) { scegliVideo(c, true); return; }
            }
            else if (v === 'vaiA') {
                c.video = null;   // «dice» resta: una cella-cartella può anche dire una frase e metterla nella barra
                q('#pcVaiADiceCheck').checked = !!c.dice;
                q('#pcVaiADice').hidden = !c.dice;
                q('#pcVaiADice').value = c.dice || '';
                const sel = q('#pcVaiA');
                if (sel.value === '__nuova__' || !sel.value) {
                    const nuova = await nuovaPagina(true);
                    if (nuova) { c.vaiA = nuova.id; riempiPannello(c); return; }
                    sel.value = sel.options[0]?.value || '';
                }
                c.vaiA = sel.value && sel.value !== '__nuova__' ? sel.value : null;
                if (!c.vaiA) { q('input[name="pcAzione"][value="dice"]').checked = true; q('#pcVaiA').hidden = true; q('#pcInFraseRiga').hidden = true; }
            }
            applica();
        }));
        let primaDice = true;
        q('#pcDice').addEventListener('input', U().debounce(e => {
            if (primaDice) { snapshot(); primaDice = false; }
            c.dice = q('#pcDice').value.trim() || null;
            app.segnaModificato();
        }, 250));
        q('#pcInFrase').addEventListener('change', e => { snapshot(); c.inFrase = e.target.checked; app.segnaModificato(); });
        // Cella-cartella che dice anche una frase (non scritta sotto l'immagine) e la mette nella barra
        q('#pcVaiADiceCheck').addEventListener('change', e => {
            snapshot();
            if (e.target.checked) {
                q('#pcVaiADice').hidden = false;
                c.dice = q('#pcVaiADice').value.trim() || null;
                q('#pcVaiADice').focus();
            } else {
                q('#pcVaiADice').hidden = true;
                c.dice = null;
            }
            aggiornaAnteprima(c); aggiornaCellaNelPalco(c); app.segnaModificato();
        });
        q('#pcVaiADice').addEventListener('input', U().debounce(() => {
            c.dice = q('#pcVaiADice').value.trim() || null;
            app.segnaModificato();
        }, 250));
        q('#pcVaiA').addEventListener('change', async e => {
            if (e.target.value === '__nuova__') {
                const nuova = await nuovaPagina(true);
                if (nuova) { snapshot(); c.vaiA = nuova.id; applica(); riempiPannello(c); }
                else e.target.value = c.vaiA || '';
                return;
            }
            snapshot(); c.vaiA = e.target.value || null; applica();
        });

        collegaVideoBlocco(c);
        collegaVoce(c);

        // Misura
        const cambiaMisura = () => {
            const w = parseInt(q('#pcW').value, 10), h = parseInt(q('#pcH').value, 10);
            if (!M().postoLibero(pag(), c.x, c.y, w, h, c.id)) {
                U().toast('Non c\'è spazio: sposta prima le celle vicine', 'errore');
                q('#pcW').value = c.w; q('#pcH').value = c.h;
                return;
            }
            snapshot(); c.w = w; c.h = h; applica();
        };
        q('#pcW').addEventListener('change', cambiaMisura);
        q('#pcH').addEventListener('change', cambiaMisura);
        q('#pcUnisci').addEventListener('click', () => avviaUnione(c));
        q('#pcDividi')?.addEventListener('click', () => dividiCella(c));
        q('#pcNascosta').addEventListener('change', e => { snapshot(); c.nascosta = e.target.checked; applica(); });

        // Azioni in basso
        q('#pcProva').addEventListener('click', () => {
            const a = M().audioCella(c);
            if (a) { app.riproduciAudio(a); return; }
            const t = M().testoDetto(c);
            if (t) app.parla(t); else U().toast('Scrivi prima una parola', 'info');
        });
        q('#pcSvuota').addEventListener('click', () => {
            snapshot();
            Object.assign(c, { etichetta: '', immagine: { tipo: 'nessuna' }, categoria: 'nessuna', dice: null, vaiA: null, video: null, audio: null, nascosta: false, inFrase: true });
            delete c.colore;
            applica(); riempiPannello(c);
        });
        q('#pcElimina').addEventListener('click', () => {
            snapshot();
            const p = pag();
            p.celle = p.celle.filter(x => x.id !== c.id);
            chiudiPannello();
            applica();
        });
    }

    // ---------- Voce registrata ----------
    function htmlVoceGruppo(c, azione) {
        return `
                <div class="campo-gruppo" id="pcVoceGruppo" ${azione === 'video' ? 'hidden' : ''}>
                    <span class="etichetta-campo">Con quale voce parla</span>
                    <div class="segmenti" role="radiogroup">
                        <label class="segmento ${schedaVoce === 'sintesi' ? 'attivo' : ''}"><input type="radio" name="pcVoce" value="sintesi" ${schedaVoce === 'sintesi' ? 'checked' : ''}><span>${Griglia.icona('parla')}Voce del dispositivo</span></label>
                        <label class="segmento ${schedaVoce === 'registrazione' ? 'attivo' : ''}"><input type="radio" name="pcVoce" value="registrazione" ${schedaVoce === 'registrazione' ? 'checked' : ''}><span>${Griglia.icona('microfono')}Registrazione o mp3</span></label>
                    </div>
                    <div class="audio-blocco" id="pcAudioBlocco" ${schedaVoce === 'registrazione' ? '' : 'hidden'}>${htmlAudioBlocco(c)}</div>
                </div>`;
    }

    function htmlAudioBlocco(c) {
        const A = Griglia.Audio;
        const a = c.audio;
        if (statoAudio.fase === 'registrazione') return `
            <div class="audio-registrazione" role="status">
                <span class="audio-puntino" aria-hidden="true"></span>
                <strong>Sto registrando…</strong>
                <output class="audio-tempo" id="pcRegTempo">0:00</output>
                <div class="audio-livello" aria-hidden="true"><i id="pcRegLivello"></i></div>
                <div class="audio-azioni">
                    <button type="button" class="btn btn-piccolo btn-primario" id="pcRegStop">${Griglia.icona('stop')} Ferma e salva</button>
                    <button type="button" class="btn btn-piccolo" id="pcRegAnnulla">Annulla</button>
                </div>
            </div>`;
        if (statoAudio.fase === 'lavoro') return `<div class="audio-lavoro" role="status">${Griglia.icona('salva')}<span>${esc(statoAudio.testo || 'Salvataggio…')}</span></div>`;
        const puoRegistrare = A.supportaRegistrazione() && window.isSecureContext;
        return `
            ${a ? `
            <div class="audio-presente">
                <button type="button" class="audio-play" id="pcAudioPlay" aria-label="Ascolta la registrazione" title="Ascolta">${Griglia.icona('gioca')}</button>
                <div class="audio-info">
                    <strong>${esc(a.nome || 'Registrazione')}</strong>
                    <small>${a.durata ? A.formattaDurata(a.durata) : 'Audio'}${a.tipo === 'dati' ? ' · salvata solo su questo dispositivo' : ''}</small>
                </div>
                <button type="button" class="btn-icona btn-icona-s" id="pcAudioTogli" title="Togli la registrazione" aria-label="Togli la registrazione">${Griglia.icona('elimina')}</button>
            </div>` : ''}
            <div class="audio-scelte">
                <button type="button" class="btn btn-piccolo btn-giallo" id="pcRegistra" ${puoRegistrare ? '' : 'disabled'}>${Griglia.icona('microfono')} ${a ? 'Registra di nuovo' : 'Registra con il microfono'}</button>
                <label class="btn btn-piccolo">${Griglia.icona('carica')} ${a ? 'Carica un altro file' : 'Carica un file mp3'}<input type="file" id="pcAudioFile" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.webm,.flac" hidden></label>
            </div>
            ${a ? '' : `<p class="nota nota-piccola">${puoRegistrare
                ? 'Premi Registra, parla (per esempio «mamma» o «acqua») e poi Ferma: la registrazione viene salvata con il comunicatore.'
                : 'Per registrare dal microfono serve un browser aggiornato e il collegamento sicuro (https).'}
                Va bene anche una canzone o un suono: fino a ${Math.round(A.MAX_SECONDI / 60)} minuti di registrazione, ${A.MAX_BYTES / 1048576} MB per file.</p>`}`;
    }

    function collegaVoce(c) {
        const q = (s) => el.pannello.querySelector(s);
        el.pannello.querySelectorAll('input[name="pcVoce"]').forEach(r => r.addEventListener('change', async e => {
            const v = e.target.value;
            if (v === 'sintesi') {
                annullaRegistrazione();
                if (c.audio) {
                    const ok = await U().conferma('Togliere la registrazione?', 'La cella tornerà a parlare con la voce del dispositivo.', { ok: 'Togli', pericolo: true });
                    if (!ok) { const r2 = q('input[name="pcVoce"][value="registrazione"]'); if (r2) r2.checked = true; return; }
                    snapshot(); c.audio = null; applica({ rendering: false }); aggiornaCellaNelPalco(c);
                }
            }
            schedaVoce = v;
            el.pannello.querySelectorAll('input[name="pcVoce"]').forEach(x => x.closest('.segmento').classList.toggle('attivo', x.checked));
            const blocco = q('#pcAudioBlocco');
            if (blocco) blocco.hidden = v !== 'registrazione';
            if (v === 'registrazione') aggiornaAudioBlocco(c);
        }));
        collegaAudioBlocco(c);
    }

    function collegaAudioBlocco(c) {
        const blocco = el.pannello.querySelector('#pcAudioBlocco');
        if (!blocco) return;
        const q = (s) => blocco.querySelector(s);
        q('#pcRegistra')?.addEventListener('click', () => avviaRegistrazione(c));
        q('#pcAudioFile')?.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) salvaAudioDaFile(c, f); });
        q('#pcAudioPlay')?.addEventListener('click', () => { if (c.audio) app.riproduciAudio(Griglia.Media.risolvi(c.audio.url)); });
        q('#pcAudioTogli')?.addEventListener('click', async () => {
            const ok = await U().conferma('Togliere la registrazione?', 'La cella tornerà a parlare con la voce del dispositivo.', { ok: 'Togli', pericolo: true });
            if (!ok) return;
            snapshot(); c.audio = null; applica({ rendering: false }); aggiornaCellaNelPalco(c); aggiornaAudioBlocco(c);
        });
        q('#pcRegStop')?.addEventListener('click', () => { if (statoAudio.registratore) statoAudio.registratore.stop(); });
        q('#pcRegAnnulla')?.addEventListener('click', () => annullaRegistrazione(c));
    }

    /** Ridisegna solo il blocco audio della cella aperta */
    function aggiornaAudioBlocco(c) {
        if (cellaApertaId !== c.id) return;
        const blocco = el.pannello.querySelector('#pcAudioBlocco');
        if (!blocco) return;
        blocco.innerHTML = htmlAudioBlocco(c);
        collegaAudioBlocco(c);
    }

    /** Interrompe una registrazione in corso senza salvarla */
    function annullaRegistrazione(c) {
        const r = statoAudio.registratore;
        const eraInCorso = statoAudio.fase === 'registrazione';
        statoAudio = { fase: 'pronto', registratore: null };
        if (r && r.attivo) r.annulla();          // onFine(null) ridisegna il blocco
        else if (c && eraInCorso) aggiornaAudioBlocco(c);
    }

    async function avviaRegistrazione(c) {
        if (statoAudio.fase !== 'pronto') return;
        Griglia.Audio.stop();
        Griglia.Voce.stop();
        statoAudio = { fase: 'registrazione', registratore: null };
        aggiornaAudioBlocco(c);
        try {
            const registratore = await Griglia.Audio.registra({
                onTempo: s => { const o = el.pannello.querySelector('#pcRegTempo'); if (o) o.value = Griglia.Audio.formattaDurata(s, true); },
                onLivello: l => { const i = el.pannello.querySelector('#pcRegLivello'); if (i) i.style.width = `${Math.round(l * 100)}%`; },
                onFine: ris => {
                    statoAudio = { fase: 'pronto', registratore: null };
                    if (!ris) { aggiornaAudioBlocco(c); return; }
                    if (ris.durata < 0.5) { aggiornaAudioBlocco(c); U().toast('Registrazione troppo breve: parla e poi premi Ferma', 'errore'); return; }
                    salvaAudio(c, () => Griglia.Audio.registrazioneInMp3(ris.blob), 'Registrazione');
                }
            });
            // Annullata mentre il browser chiedeva il permesso del microfono
            if (statoAudio.fase !== 'registrazione') { registratore.annulla(); return; }
            statoAudio.registratore = registratore;
        } catch (e) {
            statoAudio = { fase: 'pronto', registratore: null };
            aggiornaAudioBlocco(c);
            U().toast(e.message, 'errore', 6000);
        }
    }

    /** Converte (se serve), salva sul dispositivo e assegna l'audio alla cella */
    async function salvaAudio(c, prepara, nome) {
        statoAudio = { fase: 'lavoro', registratore: null, testo: 'Conversione in mp3…' };
        aggiornaAudioBlocco(c);
        try {
            const pronto = await prepara();
            statoAudio.testo = 'Salvataggio sul dispositivo…';
            aggiornaAudioBlocco(c);
            const url = await Griglia.Archivio.uploadAudio(pronto.blob, pronto.estensione, 'reg');
            const audio = { tipo: 'upload', url };
            if (pronto.durata > 0) audio.durata = Math.round(pronto.durata * 10) / 10;
            audio.nome = String(nome || 'Registrazione').slice(0, 100);
            snapshot();
            c.audio = audio;
            if (!c.etichetta.trim() && nome && nome !== 'Registrazione') {
                c.etichetta = nome.slice(0, 40);
                const campo = el.pannello.querySelector('#pcEtichetta');
                if (campo) campo.value = c.etichetta;
            }
            applica({ rendering: false });
            aggiornaCellaNelPalco(c);
            U().toast('Registrazione salvata: premi ▶ per riascoltarla', 'ok', 2500);
        } catch (e) {
            U().toast(e.message || 'Salvataggio dell\'audio non riuscito', 'errore', 6000);
        } finally {
            statoAudio = { fase: 'pronto', registratore: null };
            aggiornaAudioBlocco(c);
        }
    }

    function salvaAudioDaFile(c, file) {
        const nome = String(file.name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        salvaAudio(c, () => Griglia.Audio.fileInAudio(file), nome || 'File audio');
    }

    // ---------- Video ----------
    function htmlVideoBlocco(c) {
        const V = Griglia.Video;
        const v = c.video;
        const opzDurata = [['', 'Come la pagina'], ['0', 'Tutto il video'], ['30', '30 secondi'], ['60', '1 minuto'], ['120', '2 minuti'], ['180', '3 minuti'], ['300', '5 minuti'], ['600', '10 minuti']];
        const durataVal = v && v.durata !== null && v.durata !== undefined ? String(v.durata) : '';
        return `
            <div class="video-blocco-testa">
                ${v ? `<img src="${esc(V.miniatura(v.id))}" alt="">` : `<span class="video-blocco-vuoto">${Griglia.icona('gioca')}</span>`}
                <div class="video-blocco-info">
                    <strong>${v ? esc(v.titolo || 'Video YouTube') : 'Nessun video scelto'}</strong>
                    ${v ? `<small>${v.inizio || v.fine ? `${V.formattaTempo(v.inizio)} → ${v.fine ? V.formattaTempo(v.fine) : 'fine'}` : 'Video intero'}</small>` : '<small>Scegli dall\'archivio, cerca su YouTube o incolla un link</small>'}
                </div>
            </div>
            <button type="button" class="btn btn-piccolo" id="pcScegliVideo">${Griglia.icona('cerca')} ${v ? 'Cambia video' : 'Scegli video'}</button>
            ${v ? `
            <div class="campo-riga" style="margin-top:10px;flex-wrap:wrap;gap:10px 16px">
                <label>Inizio ${V.htmlCampoTempo('pcVideoInizio', v.inizio)}</label>
                <label>Fine ${V.htmlCampoTempo('pcVideoFine', v.fine)}</label>
            </div>
            <p class="nota nota-piccola">Minuti e secondi, validi per questa cella: cambiare i tempi in archivio non li aggiorna. Vuoto = dall'inizio / fino alla fine.</p>
            <label class="etichetta-campo" for="pcVideoDurata" style="margin-top:10px">Tempo di visione di questa cella</label>
            <select class="campo campo-compatto" id="pcVideoDurata">${opzDurata.map(([val, t]) => `<option value="${val}" ${durataVal === val ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <p class="nota nota-piccola">Cosa succede alla fine del tempo e con Spazio si imposta per tutta la pagina dal pulsante «Video» in alto.</p>` : ''}`;
    }

    function collegaVideoBlocco(c) {
        const blocco = el.pannello.querySelector('#pcVideoBlocco');
        if (!blocco) return;
        blocco.querySelector('#pcScegliVideo')?.addEventListener('click', () => scegliVideo(c, false));
        const V = Griglia.Video;
        const aggiornaTempi = () => {
            if (!c.video) return;
            const inizio = V.leggiCampoTempo(blocco, 'pcVideoInizio');
            const fine = V.leggiCampoTempo(blocco, 'pcVideoFine');
            if (fine > 0 && fine <= inizio) { U().toast('Il tempo di fine deve essere maggiore di quello di inizio', 'errore'); V.scriviCampoTempo(blocco, 'pcVideoFine', c.video.fine); return; }
            snapshot();
            c.video.inizio = inizio; c.video.fine = fine;
            V.scriviCampoTempo(blocco, 'pcVideoInizio', inizio);
            V.scriviCampoTempo(blocco, 'pcVideoFine', fine);
            app.segnaModificato();
        };
        // Minuti e secondi valgono insieme: si applicano quando il fuoco lascia la coppia di caselle, o con Invio
        blocco.querySelectorAll('[data-tempo]').forEach(coppia => {
            coppia.addEventListener('focusout', e => { if (!e.relatedTarget || !coppia.contains(e.relatedTarget)) aggiornaTempi(); });
            coppia.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
        });
        blocco.querySelector('#pcVideoDurata')?.addEventListener('change', e => {
            if (!c.video) return;
            snapshot();
            c.video.durata = e.target.value === '' ? null : parseInt(e.target.value, 10);
            app.segnaModificato();
        });
    }

    /** Apre il selettore; se annullato su una cella senza video, torna all'azione "dice" */
    function scegliVideo(c, appenaScelto) {
        let scelto = false;
        const box = Griglia.Video.apriSelettore({
            titolo: 'Video per la cella' + (c.etichetta ? ` «${c.etichetta}»` : ''),
            onScelta: (v) => {
                scelto = true;
                snapshot();
                c.video = { id: v.id, titolo: v.titolo || '', inizio: v.inizio || 0, fine: v.fine || 0, durata: c.video ? c.video.durata : null };
                c.vaiA = null; c.dice = null;
                if (!c.etichetta.trim() && v.titolo) c.etichetta = v.titolo.slice(0, 40);
                if (c.immagine.tipo === 'nessuna') c.immagine = { tipo: 'url', url: Griglia.Video.miniatura(v.id) };
                applica();
                riempiPannello(c);
            }
        });
        box.addEventListener('griglia:chiusa', () => setTimeout(() => {
            if (Griglia.util.modaleAperta()) return;   // si è aperta un'altra finestra (conferma): non è un annullamento
            if (!scelto && !c.video && appenaScelto) {
                // annullato: la cella resta una cella che parla
                const r = el.pannello.querySelector('input[name="pcAzione"][value="dice"]');
                if (r) { r.checked = true; el.pannello.querySelectorAll('.opzione-lista').forEach(o => o.classList.toggle('attiva', o.querySelector('input').checked)); el.pannello.querySelector('#pcVideoBlocco').hidden = true; }
            }
        }, 60), { once: true });
    }

    /** Impostazioni di riproduzione dei video della pagina corrente */
    function apriRiproduzione() {
        const p = pag();
        const r = Object.assign({}, M().RIPRODUZIONE_DEFAULT, p.riproduzione || {});
        const nVideo = M().celleVideo(p).length;
        const opzDurata = [['0', 'Tutto il video'], ['30', '30 secondi'], ['60', '1 minuto'], ['120', '2 minuti'], ['180', '3 minuti'], ['300', '5 minuti'], ['600', '10 minuti'], ['900', '15 minuti']];
        const box = U().apriModale(`
            <h2 class="modale-titolo">Video della pagina «${esc(p.nome)}»</h2>
            <p class="nota">${nVideo ? `${nVideo} celle video in questa pagina: insieme formano la scaletta.` : 'Questa pagina non ha ancora celle video: le impostazioni valgono appena ne aggiungi una (azione «Avvia un video»).'}</p>
            <div class="campo-gruppo">
                <label class="etichetta-campo" for="rpDurata">Tempo di visione</label>
                <select class="campo" id="rpDurata">${opzDurata.map(([v, t]) => `<option value="${v}" ${String(r.durata) === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
                <p class="nota nota-piccola">Ogni cella può avere un tempo diverso dal pannello della cella.</p>
            </div>
            <div class="campo-gruppo">
                <span class="etichetta-campo">Allo scadere del tempo</span>
                <div class="segmenti"><label class="segmento ${r.fineTimer === 'pausa' ? 'attivo' : ''}"><input type="radio" name="rpFineTimer" value="pausa" ${r.fineTimer === 'pausa' ? 'checked' : ''}><span>Pausa: Spazio riprende</span></label><label class="segmento ${r.fineTimer === 'torna' ? 'attivo' : ''}"><input type="radio" name="rpFineTimer" value="torna" ${r.fineTimer === 'torna' ? 'checked' : ''}><span>Torna alle scelte</span></label></div>
            </div>
            <div class="campo-gruppo">
                <span class="etichetta-campo">Quando il video finisce</span>
                <div class="segmenti">${[['torna', 'Torna alle scelte'], ['successivo', 'Passa al successivo'], ['fermo', 'Resta fermo']].map(([v, t]) => `<label class="segmento ${r.fineVideo === v ? 'attivo' : ''}"><input type="radio" name="rpFineVideo" value="${v}" ${r.fineVideo === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
            </div>
            <div class="campo-gruppo">
                <span class="etichetta-campo">Spazio (o tocco sullo schermo) durante la visione</span>
                <div class="segmenti">${[['sequenziale', 'Video successivo'], ['casuale', 'Video a caso'], ['disabilitato', 'Nessun effetto']].map(([v, t]) => `<label class="segmento ${r.spazio === v ? 'attivo' : ''}"><input type="radio" name="rpSpazio" value="${v}" ${r.spazio === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
            </div>
            <label class="interruttore"><input type="checkbox" id="rpBloccato" ${r.spazioBloccato ? 'checked' : ''}><span>Spazio bloccato durante la riproduzione (timer persistente): vale solo alla pausa o alla fine</span></label>
            <label class="interruttore"><input type="checkbox" id="rpTimer" ${r.mostraTimer ? 'checked' : ''}><span>Mostra il conto alla rovescia</span></label>
            <div class="modale-azioni"><button type="button" class="btn btn-primario" id="rpOk">Fatto</button></div>`);
        box.querySelectorAll('.segmento input').forEach(i => i.addEventListener('change', () => box.querySelectorAll(`input[name="${i.name}"]`).forEach(x => x.closest('.segmento').classList.toggle('attivo', x.checked))));
        box.querySelector('#rpOk').addEventListener('click', () => {
            snapshot();
            p.riproduzione = {
                durata: parseInt(box.querySelector('#rpDurata').value, 10) || 0,
                fineTimer: box.querySelector('input[name="rpFineTimer"]:checked').value,
                fineVideo: box.querySelector('input[name="rpFineVideo"]:checked').value,
                spazio: box.querySelector('input[name="rpSpazio"]:checked').value,
                spazioBloccato: box.querySelector('#rpBloccato').checked,
                mostraTimer: box.querySelector('#rpTimer').checked
            };
            app.segnaModificato();
            U().chiudiModale();
            U().toast('Impostazioni video della pagina salvate', 'ok');
        });
    }

    function aggiornaAnteprima(c) {
        const a = el.pannello.querySelector('#pcAnteprima');
        if (!a) return;
        const url = M().urlImmagine(c.immagine, 300);
        a.style.setProperty('--c', M().coloreCella(c));
        a.innerHTML = url ? `<img src="${esc(url)}" alt="">` : `<span class="anteprima-vuota">${Griglia.icona('immagine')}</span>`;
    }

    /** Ridisegna solo la cella modificata (evita lo sfarfallio delle immagini) */
    function aggiornaCellaNelPalco(c) {
        const vecchio = el.palco.querySelector(`.cella[data-id="${c.id}"]`);
        if (!vecchio) { app.render(); return; }
        const nuovo = Griglia.Render.elementoCella(c, doc(), { modifica: true, selezionata: true });
        vecchio.replaceWith(nuovo);
        app.adattaTesti();
    }

    async function cercaArasaac(query) {
        const cont = el.pannello.querySelector('#pcRisultati');
        if (!cont) return;
        query = String(query || '').trim();
        if (query.length < 2) { cont.innerHTML = '<p class="nota">Scrivi almeno due lettere</p>'; return; }
        cont.innerHTML = '<p class="nota">Ricerca…</p>';
        try {
            const ris = await Griglia.Arasaac.cerca(query, 48);
            if (el.pannello.querySelector('#pcCerca')?.value.trim() !== query) return;   // ricerca superata
            const c = cellaCorrente();
            mostraRisultati(ris, c && c.immagine.tipo === 'arasaac' ? c.immagine.id : null);
        } catch (e) {
            const c = cellaCorrente();
            if (c && c.immagine.tipo === 'arasaac') mostraRisultati([{ id: c.immagine.id, url: Griglia.Arasaac.url(c.immagine.id), parole: [c.etichetta] }], c.immagine.id);
            else cont.innerHTML = `<p class="nota">${esc(navigator.onLine === false ? 'Senza rete la ricerca non è disponibile' : e.message)}</p>`;
        }
    }

    function mostraRisultati(ris, idScelto) {
        const cont = el.pannello.querySelector('#pcRisultati');
        if (!cont) return;
        if (!ris.length) { cont.innerHTML = '<p class="nota">Nessun pittogramma trovato: prova con un\'altra parola</p>'; return; }
        cont.innerHTML = ris.map(r => `
            <button type="button" class="risultato" data-id="${r.id}" data-parola="${esc((r.parole || [])[0] || '')}" aria-pressed="${r.id === idScelto}" title="${esc((r.parole || []).slice(0, 3).join(', '))}">
                <img src="${esc(r.url)}" alt="${esc((r.parole || [])[0] || '')}" loading="lazy">
            </button>`).join('');
    }

    // ---------- Unisci e dividi box ----------
    // Si parte dal box aperto nel pannello (il suo contenuto resta), si toccano gli altri box
    // e gli spazi vuoti da unire. Tutti insieme devono formare un rettangolo pieno: allora
    // diventano un box solo, che occupa tutto il rettangolo.

    function avviaUnione(c) {
        unione = { baseId: c.id, celle: new Set(), vuoti: new Set() };
        document.addEventListener('keydown', tastoUnione);
        document.body.classList.add('in-unione');
        riempiPannelloUnione();
        evidenziaUnione();
    }

    function esciUnione() {
        if (!unione) return;
        unione = null;
        document.removeEventListener('keydown', tastoUnione);
        document.body.classList.remove('in-unione');
        document.body.style.removeProperty('--altezza-unione');
        el.palco.querySelectorAll('.unione-base, .unione-scelta').forEach(x => x.classList.remove('unione-base', 'unione-scelta'));
        el.palco.querySelector('.unione-anteprima')?.remove();
    }

    function tastoUnione(e) {
        if (e.key === 'Escape') { e.preventDefault(); annullaUnione(); }
    }

    function annullaUnione() {
        const c = cellaCorrente();
        esciUnione();
        if (c) riempiPannello(c);
    }

    // Tocco sulla griglia durante l'unione: aggiunge o toglie un box o uno spazio vuoto
    function sceltaUnione(e) {
        const slot = e.target.closest('.slot-vuoto');
        const cella = e.target.closest('.cella');
        if (slot) {
            const chiave = `${slot.dataset.x},${slot.dataset.y}`;
            if (unione.vuoti.has(chiave)) unione.vuoti.delete(chiave); else unione.vuoti.add(chiave);
        } else if (cella && cella.dataset.id !== unione.baseId) {
            const id = cella.dataset.id;
            if (unione.celle.has(id)) unione.celle.delete(id); else unione.celle.add(id);
        } else {
            return;
        }
        evidenziaUnione();
        aggiornaPannelloUnione();
    }

    // Rettangolo che racchiude i box scelti e se è pieno (nessun buco, nessun altro box dentro)
    function calcolaUnione() {
        const p = pag();
        const base = p.celle.find(c => c.id === unione.baseId);
        const scelte = [...unione.celle].map(id => p.celle.find(c => c.id === id)).filter(Boolean);
        const pezzi = [base, ...scelte].map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
            .concat([...unione.vuoti].map(k => { const [x, y] = k.split(',').map(Number); return { x, y, w: 1, h: 1 }; }));
        const x = Math.min(...pezzi.map(q => q.x)), y = Math.min(...pezzi.map(q => q.y));
        const x2 = Math.max(...pezzi.map(q => q.x + q.w)), y2 = Math.max(...pezzi.map(q => q.y + q.h));
        const rett = { x, y, w: x2 - x, h: y2 - y };
        const nomi = new Set([base.id, ...scelte.map(c => c.id)]);
        const estranee = new Set();
        let buchi = 0;
        for (let yy = y; yy < y2; yy++) for (let xx = x; xx < x2; xx++) {
            const c = M().cellaIn(p, xx, yy);
            if (c) { if (!nomi.has(c.id)) estranee.add(c); }
            else if (!unione.vuoti.has(`${xx},${yy}`)) buchi++;
        }
        const quanti = scelte.length + unione.vuoti.size;
        let motivo = '';
        if (!quanti) motivo = 'Tocca gli altri box da unire.';
        else if (estranee.size) motivo = `Nel rettangolo c'è anche «${[...estranee].map(c => c.etichetta || 'senza nome').join('», «')}»: toccalo per unirlo, oppure scegli box che formano un rettangolo.`;
        else if (buchi) motivo = 'I box scelti non formano un rettangolo: tocca anche gli spazi vuoti che lo completano, oppure togli un box.';
        return { base, scelte, rett, valido: !motivo, motivo, quanti };
    }

    function evidenziaUnione() {
        if (!unione) return;
        const g = el.palco.querySelector('.griglia');
        if (!g) return;
        g.querySelectorAll('.unione-base, .unione-scelta').forEach(x => x.classList.remove('unione-base', 'unione-scelta'));
        g.querySelector(`.cella[data-id="${unione.baseId}"]`)?.classList.add('unione-base');
        unione.celle.forEach(id => g.querySelector(`.cella[data-id="${id}"]`)?.classList.add('unione-scelta'));
        unione.vuoti.forEach(k => {
            const [x, y] = k.split(',');
            g.querySelector(`.slot-vuoto[data-x="${x}"][data-y="${y}"]`)?.classList.add('unione-scelta');
        });
        // Contorno del box che nascerà: verde se si può unire, rosso se no
        const { rett, valido, quanti } = calcolaUnione();
        let a = g.querySelector('.unione-anteprima');
        if (!a) { a = document.createElement('div'); a.className = 'unione-anteprima'; a.setAttribute('aria-hidden', 'true'); g.appendChild(a); }
        a.style.gridColumn = `${rett.x + 1} / span ${rett.w}`;
        a.style.gridRow = `${rett.y + 1} / span ${rett.h}`;
        a.classList.toggle('non-valida', !valido && quanti > 0);
        a.hidden = !quanti;
    }

    function riempiPannelloUnione() {
        const c = cellaCorrente();
        el.pannello.innerHTML = `
            <div class="pannello-testata">
                <h2>${Griglia.icona('unisci')} Unisci box</h2>
                <button type="button" class="btn-icona" id="unChiudi" aria-label="Annulla l'unione">${Griglia.icona('chiudi')}</button>
            </div>
            <div class="pannello-corpo">
                <p class="nota">Tocca nella griglia gli altri box da unire a «<strong>${esc(c.etichetta || 'senza nome')}</strong>», anche gli spazi vuoti. Tocca di nuovo per togliere. Insieme devono formare un rettangolo.</p>
                <p class="nota unione-nota-extra">Resta il contenuto di «${esc(c.etichetta || 'senza nome')}»: quello degli altri box viene tolto.</p>
                <p class="unione-stato" id="unStato" role="status" aria-live="polite"></p>
            </div>
            <div class="pannello-azioni">
                <button type="button" class="btn btn-secondario" id="unAnnulla">${Griglia.icona('chiudi')} Annulla</button>
                <button type="button" class="btn btn-primario" id="unConferma" disabled>${Griglia.icona('unisci')} Unisci</button>
            </div>`;
        el.pannello.querySelector('#unChiudi').addEventListener('click', annullaUnione);
        el.pannello.querySelector('#unAnnulla').addEventListener('click', annullaUnione);
        el.pannello.querySelector('#unConferma').addEventListener('click', confermaUnione);
        aggiornaPannelloUnione();
    }

    function aggiornaPannelloUnione() {
        const stato = el.pannello.querySelector('#unStato');
        if (!stato || !unione) return;
        const { rett, valido, motivo, quanti } = calcolaUnione();
        stato.classList.toggle('unione-errore', !valido && quanti > 0);
        stato.textContent = valido
            ? `✓ ${quanti + 1} box diventano uno solo, largo ${rett.w} e alto ${rett.h} caselle.`
            : motivo;
        el.pannello.querySelector('#unConferma').disabled = !valido;
        // Su tablet e telefono il pannello è un foglio in basso: la griglia si stringe sopra di
        // lui, così tutti i box restano visibili e toccabili (regola in app.css, body.in-unione)
        document.body.style.setProperty('--altezza-unione', `${el.pannello.offsetHeight}px`);
    }

    async function confermaUnione() {
        const { base, scelte, rett, valido } = calcolaUnione();
        if (!valido) return;
        const conContenuto = scelte.filter(c => c.etichetta || c.immagine?.tipo !== 'nessuna' || c.audio || c.video || c.vaiA);
        if (conContenuto.length) {
            const nomi = conContenuto.map(c => `«${c.etichetta || 'senza nome'}»`).join(', ');
            const ok = await U().conferma('Unire i box?', `Resta «${base.etichetta || 'senza nome'}». Vengono tolti: ${nomi}. Puoi tornare indietro con Annulla.`, { ok: 'Unisci' });
            if (!ok || !unione) return;
        }
        snapshot();
        const p = pag();
        const via = new Set(scelte.map(c => c.id));
        p.celle = p.celle.filter(c => !via.has(c.id));
        Object.assign(base, rett);
        esciUnione();
        applica();
        riempiPannello(base);
        el.palco.querySelector(`.cella[data-id="${base.id}"]`)?.classList.add('cella-selezionata');
        U().toast(`Box uniti: ora occupa ${rett.w} × ${rett.h} caselle`, 'ok', 2000);
    }

    // Il box torna di una casella (in alto a sinistra, con il suo contenuto): le altre tornano vuote
    function dividiCella(c) {
        if (c.w === 1 && c.h === 1) return;
        snapshot();
        c.w = 1; c.h = 1;
        applica();
        riempiPannello(c);
        el.palco.querySelector(`.cella[data-id="${c.id}"]`)?.classList.add('cella-selezionata');
        U().toast('Box diviso: le altre caselle sono vuote', 'ok', 2000);
    }

    // ---------- Trascinamento (pointer events: mouse e tocco) ----------
    function onPointerDown(e) {
        if (app.stato.modalita !== 'modifica' || e.button > 0 || unione) return;
        const cella = e.target.closest('.cella');
        if (!cella) return;
        drag = { id: cella.dataset.id, el: cella, x0: e.clientX, y0: e.clientY, mosso: false, ghost: null, target: null, pointerId: e.pointerId };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
        if (!drag) return;
        const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (!drag.mosso) {
            if (Math.hypot(dx, dy) < 8) return;
            drag.mosso = true;
            const r = drag.el.getBoundingClientRect();
            drag.ghost = drag.el.cloneNode(true);
            drag.ghost.className += ' cella-fantasma';
            Object.assign(drag.ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, gridColumn: '', gridRow: '', zIndex: 900, pointerEvents: 'none', margin: 0 });
            drag.offX = e.clientX - r.left; drag.offY = e.clientY - r.top;
            document.body.appendChild(drag.ghost);
            drag.el.classList.add('trascinando');
            document.body.classList.add('in-trascinamento');
        }
        e.preventDefault();
        drag.ghost.style.left = `${e.clientX - drag.offX}px`;
        drag.ghost.style.top = `${e.clientY - drag.offY}px`;
        const sotto = document.elementFromPoint(e.clientX, e.clientY);
        const target = sotto ? sotto.closest('.slot-vuoto, .cella') : null;
        if (target !== drag.target) {
            if (drag.target) drag.target.classList.remove('drop-target');
            drag.target = target && el.palco.contains(target) && target !== drag.el ? target : null;
            if (drag.target) drag.target.classList.add('drop-target');
        }
    }

    function onPointerUp() {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        if (!drag) return;
        const d = drag;
        if (d.ghost) d.ghost.remove();
        d.el.classList.remove('trascinando');
        document.body.classList.remove('in-trascinamento');
        if (d.target) d.target.classList.remove('drop-target');
        if (!d.mosso) { drag = null; return; }
        if (d.target) spostaCella(d.id, d.target);
        // drag resta impostato finché il click successivo non lo consuma (evita l'apertura del pannello dopo il trascinamento)
        setTimeout(() => { drag = null; }, 50);
    }

    function spostaCella(id, target) {
        const p = pag();
        const c = p.celle.find(x => x.id === id);
        if (!c) return;
        if (target.classList.contains('slot-vuoto')) {
            const x = parseInt(target.dataset.x, 10), y = parseInt(target.dataset.y, 10);
            let w = c.w, h = c.h;
            if (!M().postoLibero(p, x, y, w, h, c.id)) { w = 1; h = 1; }
            if (!M().postoLibero(p, x, y, w, h, c.id)) { U().toast('Non c\'è spazio in quel punto', 'errore'); return; }
            snapshot();
            Object.assign(c, { x, y, w, h });
        } else {
            const t = p.celle.find(x => x.id === target.dataset.id);
            if (!t || t.id === c.id) return;
            snapshot();
            const tmp = { x: c.x, y: c.y, w: c.w, h: c.h };
            Object.assign(c, { x: t.x, y: t.y, w: t.w, h: t.h });
            Object.assign(t, tmp);
        }
        applica();
        if (cellaApertaId === c.id) riempiPannello(c);
    }

    // ---------- Pagina veloce: parole → celle ----------
    function apriParole() {
        const p = pag();
        const liberi = p.righe * p.colonne - p.celle.reduce((n, c) => n + c.w * c.h, 0);
        const box = U().apriModale(`
            <h2 class="modale-titolo">Aggiungi parole a «${esc(p.nome)}»</h2>
            <p class="nota">${liberi} posti liberi in questa pagina; se servono altre righe vengono aggiunte da sole (fino a 12).</p>
            ${Griglia.Veloce.htmlModulo({ prefisso: 'ep' })}
            <div class="modale-azioni">
                <button type="button" class="btn btn-secondario" id="epAnnulla">Annulla</button>
                <button type="button" class="btn btn-primario" id="epAggiungi">${Griglia.icona('piu')} Aggiungi le celle</button>
            </div>`);
        setTimeout(() => box.querySelector('#epTesto')?.focus(), 80);
        box.querySelector('#epAnnulla').addEventListener('click', () => U().chiudiModale());
        box.querySelector('#epAggiungi').addEventListener('click', async () => {
            const b = box.querySelector('#epAggiungi');
            const testo = box.querySelector('#epTesto').value;
            if (!Griglia.Veloce.analizza(testo).length) { U().toast('Scrivi almeno una parola', 'errore'); return; }
            b.disabled = true;
            const copia = M().clona(doc());
            try {
                const stat = await Griglia.Veloce.aggiungiAPagina(copia, copia.pagine.find(x => x.id === p.id), testo, (f, t) => { b.textContent = `Cerco i pittogrammi… ${f}/${t}`; });
                snapshot();
                app.sostituisciDoc(copia);
                chiudiPannello();
                applica();
                U().chiudiModale();
                U().toast(Griglia.Veloce.messaggioEsito(stat), 'ok', 5000);
            } catch (e) {
                U().toast(e.message, 'errore', 6000);
                b.disabled = false;
                b.innerHTML = `${Griglia.icona('piu')} Aggiungi le celle`;
            }
        });
    }

    // ---------- Importa ed esporta ----------
    async function importaFile(file) {
        U().toast('Lettura del file…', 'info', 1500);
        let ris;
        try { ris = await Griglia.Importa.daFile(file); }
        catch (e) { U().toast(e.message, 'errore', 5000); return; }
        const imp = ris.documento;
        const n = M().conta(imp);
        const d = doc();
        const vuoto = d.pagine.length === 1 && d.pagine[0].celle.length === 0;
        const ok = await U().conferma(
            vuoto ? 'Usare il contenuto del file?' : 'Aggiungere le pagine del file?',
            `«${imp.nome}»: ${n.pagine} pagine e ${n.celle} celle.` + (vuoto ? ' Sostituirà la pagina vuota attuale.' : ' Le pagine verranno aggiunte a quelle esistenti: poi collega una cella con «Apre una pagina».') +
            (ris.avvisi.length ? `\n\nNote: ${ris.avvisi.join('; ')}.` : ''),
            { ok: vuoto ? 'Usa il file' : 'Aggiungi pagine' });
        if (!ok) return;
        snapshot();
        chiudiPannello();
        if (vuoto) {
            const nome = d.nome;
            Object.assign(d, imp, { nome });
            app.setPagina(d.paginaHomeId);
        } else {
            d.pagine.push(...imp.pagine);
        }
        applica();
        const esito = await Griglia.Importa.caricaMediaIncorporati(d, (f, t) => { if (t) app.renderBarra(); });
        if (esito.totale) { U().toast(`${esito.totale - esito.errori} immagini e audio incorporati salvati sul dispositivo`, 'ok'); applica(); }
        U().toast('Importazione completata', 'ok');
    }

    function apriEsporta() {
        const d = doc();
        const box = U().apriModale(`
            <h2 class="modale-titolo">Esporta «${esc(d.nome)}»</h2>
            <div class="scelte-esporta">
                <button type="button" class="scelta" id="espJson">${Griglia.icona('scarica')}<span><strong>File Griglia (.json)</strong><small>Copia completa con foto e registrazioni, da ricaricare qui o su un altro dispositivo</small></span></button>
                <button type="button" class="scelta" id="espObz">${Griglia.icona('scarica')}<span><strong>Open Board Format (.obz)</strong><small>Per aprirlo in altre app di comunicazione (Asterics AAC, CoughDrop…)</small></span></button>
            </div>`, { piccola: true });
        box.querySelector('#espJson').addEventListener('click', () => { Griglia.Importa.esportaJson(d); U().chiudiModale(); });
        box.querySelector('#espObz').addEventListener('click', async () => {
            try { await Griglia.Importa.esportaObz(d); U().chiudiModale(); }
            catch (e) { U().toast(e.message, 'errore', 5000); }
        });
    }

    return { init, attiva, disattiva, dopoRender, apriCella, chiudiPannello, annulla, snapshot };
})();
