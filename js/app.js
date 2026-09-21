/**
 * Griglia - Applicazione: uso del comunicatore, navigazione, frase, voce, video, salvataggio
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Parametri URL:
 *   ?id=<n>          comunicatore salvato su questo dispositivo
 *   &modifica=1      apre subito in modalità modifica (dall'Area Educatore)
 *   &utente=1        aperto dall'Area Utente: interfaccia bloccata, si sblocca tenendo premuto il lucchetto
 *
 * Un dispositivo = un utente: l'educatore prepara il comunicatore sul dispositivo
 * dell'utente. Non c'è login: a proteggere la modifica c'è il lucchetto.
 */
window.Griglia = window.Griglia || {};

Griglia.App = (function () {
    const M = () => Griglia.Modello;
    const U = () => Griglia.util;

    const S = {
        id: null,
        daAreaUtente: false,
        doc: null,
        paginaId: null,
        storia: [],
        frase: [],              // [{ id, testo, url, audio }]  audio = URL della voce registrata, se c'è
        modalita: 'usa',        // usa | modifica
        sbloccato: false,
        salvataggio: 'ok',      // ok | sporco | in-corso | errore
        cellaSelezionataId: null,
        paginaCalendario: null  // pagina speciale ieri/oggi/domani generata al volo (non salvata)
    };

    let el = {};
    let input = null;
    let salvaDebounce = null;
    let timerBlocco = null;
    let fraseToken = 0;         // lettura della frase in corso: cambia per interromperla

    // ---------- Avvio ----------
    async function init() {
        el = {
            body: document.body,
            nome: document.getElementById('nomeComunicatore'),
            nomePagina: document.getElementById('nomePagina'),
            stato: document.getElementById('statoSalvataggio'),
            barra: document.getElementById('barraFrase'),
            palco: document.getElementById('palco'),
            area: document.getElementById('areaComunicatore'),
            btnEsci: document.getElementById('btnEsci'),
            btnAnnulla: document.getElementById('btnAnnulla'),
            btnModifica: document.getElementById('btnModifica'),
            btnEducatore: document.getElementById('btnEducatore'),
            btnFine: document.getElementById('btnFine'),
            btnImpostazioni: document.getElementById('btnImpostazioni'),
            btnSchermo: document.getElementById('btnSchermo'),
            btnBlocco: document.getElementById('btnBlocco')
        };
        el.btnEsci.innerHTML = Griglia.icona('esci');
        el.btnAnnulla.innerHTML = Griglia.icona('annulla');
        el.btnModifica.innerHTML = Griglia.icona('modifica') + '<span>Modifica</span>';
        el.btnEducatore.innerHTML = Griglia.icona('utenti') + '<span>Area educatore</span>';
        el.btnFine.innerHTML = Griglia.icona('fine') + '<span>Fine</span>';
        el.btnImpostazioni.innerHTML = Griglia.icona('impostazioni');
        el.btnSchermo.innerHTML = Griglia.icona('schermo');

        const q = new URLSearchParams(location.search);
        S.id = parseInt(q.get('id'), 10) || null;
        S.daAreaUtente = q.get('utente') === '1';
        S.prova = q.get('prova') === '1';           // «Prova» dall'Area Educatore: come lo vede l'utente, bloccato

        if (!S.id) { location.replace('index.html'); return; }

        // Sbloccato: apertura in modifica dall'Area Educatore; bloccato dall'Area Utente e con «Prova»
        S.sbloccato = q.get('modifica') === '1' || (!S.daAreaUtente && !S.prova);
        Griglia.DB.persistente();
        aggiornaBlocco();

        collegaEventi();
        Griglia.Voce.init();
        Griglia.registraServiceWorker();

        try {
            await carica();
        } catch (e) {
            const azioni = [{ testo: 'Riprova', href: location.href }, { testo: 'Area educatore', href: 'gestione.html', secondario: true }];
            schermataMessaggio('Comunicatore non disponibile', e.message || 'Errore di caricamento', azioni);
            return;
        }

        input = new Griglia.Input({ radice: el.area, onSeleziona: onSeleziona });
        input.imposta(S.doc.input);
        input.avvia();

        S.paginaId = M().paginaHome(S.doc).id;
        Griglia.Editor.init(api);
        render();
        // Il testo delle celle si riadatta quando cambia lo spazio (rotazione, pannello di modifica) e quando arriva il font
        if (window.ResizeObserver) new ResizeObserver(adattaTesti).observe(el.palco);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(adattaTesti);

        if (q.get('modifica') === '1' && S.sbloccato) entraModifica();
        if (!S.sbloccato && S.prova) U().toast('Lo vedi come l\'utente. Per tornare all\'Area educatore tieni premuto il lucchetto per 2 secondi', 'info', 6000);
    }

    async function carica() {
        const dati = await Griglia.Archivio.locale.carica(S.id);
        S.doc = M().normalizza(dati.documento);
        await Griglia.Media.precarica(S.doc);   // foto e registrazioni pronte prima del primo rendering
    }

    // ---------- Rendering ----------
    function paginaCorrente() {
        if (S.paginaCalendario) return S.paginaCalendario;
        return M().pagina(S.doc, S.paginaId) || M().paginaHome(S.doc);
    }

    // ---------- Calendario (ieri / oggi / domani) ----------
    const GIORNI_SETTIMANA = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']; // getDay(): 0 = domenica
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const capitale = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

    /** Normalizza un nome per il confronto: minuscolo, senza accenti né spazi ai lati */
    function normNome(s) {
        return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    /** true se la cella è la "cella calendario" (riconosciuta dal nome dato dall'educatrice) */
    function eCellaCalendario(cella) {
        return normNome(cella && cella.etichetta) === 'calendario';
    }

    /** id della pagina del documento che ha come nome quel giorno (es. "lunedì"), o null */
    function idPaginaGiorno(nomeGiorno) {
        const t = normNome(nomeGiorno);
        const p = S.doc.pagine.find(pg => normNome(pg.nome) === t);
        return p ? p.id : null;
    }

    /** Costruisce al volo la pagina calendario a 3 box con le date reali del dispositivo */
    function costruisciPaginaCalendario() {
        const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
        const box = (offset, x, quale) => {
            const d = new Date(oggi); d.setDate(oggi.getDate() + offset);
            const nomeGiorno = GIORNI_SETTIMANA[d.getDay()];
            const vaiA = idPaginaGiorno(nomeGiorno);
            return {
                id: 'cal_' + quale, x, y: 0, w: 1, h: 1,
                etichetta: capitale(nomeGiorno),
                immagine: { tipo: 'nessuna' }, categoria: 'nessuna',
                dice: null, vaiA: vaiA || null, video: null, audio: null, nascosta: false, inFrase: false,
                _cal: {
                    quale,                                  // ieri | oggi | domani
                    giorno: capitale(nomeGiorno),
                    numero: d.getDate(),
                    mese: capitale(MESI[d.getMonth()]),
                    oggi: offset === 0,
                    mancante: !vaiA
                }
            };
        };
        return {
            id: '__calendario__', nome: 'Calendario', righe: 1, colonne: 3,
            riproduzione: M().RIPRODUZIONE_DEFAULT,
            celle: [box(-1, 0, 'ieri'), box(0, 1, 'oggi'), box(1, 2, 'domani')]
        };
    }

    /** Apre la pagina calendario (transiente): la origin resta nella storia per "indietro" */
    function apriCalendario(cella) {
        if (cella && S.doc.voce.parlaAlTocco) {
            const audio = M().audioCella(cella);
            if (audio) riproduciAudio(audio); else parla(M().testoDetto(cella) || 'calendario');
        }
        S.storia.push(S.paginaId);
        if (S.storia.length > 50) S.storia.shift();
        S.paginaCalendario = costruisciPaginaCalendario();
        S.paginaId = S.paginaCalendario.id;
        render();
    }

    /** Disegna i 3 box del calendario (compatibili con tocco/dwell/scansione: sono .cella[data-id]) */
    function renderCalendarioDOM(contenitore, cal) {
        const esc = U().escapeHtml;
        const g = document.createElement('div');
        g.className = 'griglia griglia-calendario';
        g.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
        g.style.gridTemplateRows = 'repeat(1, minmax(0, 1fr))';
        g.dataset.pagina = cal.id;
        const intestazione = { ieri: 'Ieri', oggi: 'Oggi', domani: 'Domani' };
        cal.celle.forEach(c => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cella cella-calendario' + (c._cal.oggi ? ' cal-oggi' : '') + (c._cal.mancante ? ' cal-mancante' : '');
            b.dataset.id = c.id;
            b.setAttribute('data-sel', '');
            b.style.gridColumn = `${c.x + 1}`;
            b.style.gridRow = '1';
            b.setAttribute('aria-label', `${intestazione[c._cal.quale]}: ${c._cal.giorno} ${c._cal.numero} ${c._cal.mese}` + (c._cal.mancante ? ', pagina non ancora pronta' : ''));
            b.innerHTML = `
                <span class="cal-quale">${intestazione[c._cal.quale]}</span>
                <span class="cal-giorno">${esc(c._cal.giorno)}</span>
                <span class="cal-numero">${c._cal.numero}</span>
                <span class="cal-mese">${esc(c._cal.mese)}</span>`;
            g.appendChild(b);
        });
        contenitore.replaceChildren(g);
        return g;
    }

    /** Riduce le righe di testo dei box calendario che, con l'ingrandimento, non entrano nel box */
    function adattaCalendario(radice) {
        if (!radice) return;
        const righe = Array.from(radice.querySelectorAll('.cella-calendario .cal-quale, .cella-calendario .cal-giorno, .cella-calendario .cal-numero, .cella-calendario .cal-mese'));
        if (!righe.length) return;
        righe.forEach(t => { if (t.style.fontSize) t.style.fontSize = ''; });
        const misure = righe.map(t => ({ t, larghezza: t.scrollWidth, disponibile: t.clientWidth, attuale: parseFloat(getComputedStyle(t).fontSize) || 16 }));
        misure.forEach(({ t, larghezza, disponibile, attuale }) => {
            if (!disponibile || larghezza <= disponibile) return;
            t.style.fontSize = `${Math.max(10, Math.floor(attuale * disponibile / larghezza * 0.90))}px`;
        });
    }

    /** Tocco su un box del calendario: apre la pagina del giorno o avvisa se non è pronta */
    function selezionaGiornoCalendario(id, elemento) {
        const c = S.paginaCalendario.celle.find(x => x.id === id);
        if (!c) return;
        if (elemento) {
            elemento.classList.add('cella-premuta');
            setTimeout(() => elemento.classList.remove('cella-premuta'), 220);
        }
        if (c.vaiA && M().pagina(S.doc, c.vaiA)) {
            naviga(c.vaiA);
        } else {
            U().toast(`La pagina di ${c._cal.giorno} non è ancora pronta`, 'info', 3200);
            if (S.doc.voce.parlaAlTocco) parla(`${c._cal.giorno}. La pagina non è ancora pronta.`);
        }
    }

    function render() {
        const pag = paginaCorrente();
        S.paginaId = pag.id;
        Griglia.Render.applicaAspetto(el.body, S.doc);
        el.nome.textContent = S.doc.nome;
        document.title = `${S.doc.nome} - Griglia`;
        const inHome = pag.id === S.doc.paginaHomeId;
        el.nomePagina.textContent = inHome ? '' : pag.nome;
        if (S.paginaCalendario) {
            renderCalendarioDOM(el.palco, S.paginaCalendario);
        } else {
            Griglia.Render.pagina(el.palco, S.doc, pag, { modifica: S.modalita === 'modifica', cellaSelezionataId: S.cellaSelezionataId });
        }
        Griglia.Render.adattaTesti(el.palco);
        if (S.paginaCalendario) adattaCalendario(el.palco);
        renderBarra();
        if (input) input.aggiorna();
        if (S.modalita === 'modifica') Griglia.Editor.dopoRender();
        if (!S.paginaCalendario && M().celleVideo(pag).length) Griglia.Video.Schermo.precarica();
    }

    let adattaRaf = 0;
    function adattaTesti() {
        if (adattaRaf) return;
        adattaRaf = requestAnimationFrame(() => { adattaRaf = 0; Griglia.Render.adattaTesti(el.palco); if (S.paginaCalendario) adattaCalendario(el.palco); });
    }

    function renderBarra() {
        const pag = paginaCorrente();
        Griglia.Render.barra(el.barra, S.doc, { frase: S.frase, puoTornare: S.storia.length > 0, inHome: pag.id === S.doc.paginaHomeId });
    }

    // ---------- Selezione e azioni ----------
    function onSeleziona(elemento) {
        if (S.modalita === 'modifica') return;
        if (elemento.dataset.azione) { azioneBarra(elemento.dataset.azione); return; }
        const id = elemento.dataset.id;
        if (S.paginaCalendario) { selezionaGiornoCalendario(id, elemento); return; }
        const cella = paginaCorrente().celle.find(c => c.id === id);
        if (cella) selezionaCella(cella, elemento);
    }

    function selezionaCella(cella, elemento) {
        // Cella "calendario" (riconosciuta dal nome): apre la pagina ieri/oggi/domani
        if (eCellaCalendario(cella)) {
            if (elemento) {
                elemento.classList.add('cella-premuta');
                setTimeout(() => elemento.classList.remove('cella-premuta'), 220);
            }
            apriCalendario(cella);
            return;
        }
        const testo = M().testoDetto(cella);
        const audio = M().audioCella(cella);      // voce registrata al posto della sintesi
        if (elemento) {
            elemento.classList.add('cella-premuta');
            setTimeout(() => elemento.classList.remove('cella-premuta'), 220);
        }
        const azione = M().azioneCella(cella);
        if (azione === 'pagina') {
            // La cartella apre la sua pagina; se «inFrase» la parola va anche nella frase («io» + «voglio» + «uscire»)
            const inFrase = cella.inFrase !== false && !!(testo || audio);
            if (inFrase && S.doc.barra.frase) {
                S.frase.push({ id: cella.id, testo: testo || '♪', url: M().urlImmagineCella(cella, 300), audio });
                if (S.frase.length > 40) S.frase.shift();
            }
            if (S.doc.voce.parlaAlTocco || (inFrase && !S.doc.barra.frase)) { if (audio) riproduciAudio(audio); else if (testo) parla(testo); }
            naviga(cella.vaiA);
            return;
        }
        if (azione === 'video') {
            fraseToken++;
            Griglia.Audio.stop();
            Griglia.Video.Schermo.apri({ app: api, pagina: paginaCorrente(), cella });
            return;
        }
        if (!testo && !audio) return;
        if (S.doc.barra.frase) {
            S.frase.push({ id: cella.id, testo: testo || '♪', url: M().urlImmagineCella(cella, 300), audio });
            if (S.frase.length > 40) S.frase.shift();
        }
        if (S.doc.voce.parlaAlTocco || !S.doc.barra.frase) { if (audio) riproduciAudio(audio); else parla(testo); }
        if (S.doc.tornaHomeDopoSelezione && S.paginaId !== S.doc.paginaHomeId) naviga(S.doc.paginaHomeId, { azzera: true });
        else { renderBarra(); if (input) input.aggiorna(); }
    }

    function azioneBarra(azione) {
        switch (azione) {
            case 'home': naviga(S.doc.paginaHomeId, { azzera: true }); break;
            case 'indietro': indietro(); break;
            case 'parla': parlaFrase(); break;
            case 'cancellaParola': S.frase.pop(); renderBarra(); if (input) input.aggiorna(); break;
            case 'cancellaTutto': S.frase = []; fraseToken++; Griglia.Voce.stop(); Griglia.Audio.stop(); renderBarra(); if (input) input.aggiorna(); break;
        }
    }

    function naviga(paginaId, { azzera = false } = {}) {
        if (!M().pagina(S.doc, paginaId)) return;
        const eraCalendario = !!S.paginaCalendario;
        S.paginaCalendario = null;   // uscendo dal calendario si torna a una pagina reale
        if (azzera) S.storia = [];
        else if (!eraCalendario && paginaId !== S.paginaId) { S.storia.push(S.paginaId); if (S.storia.length > 50) S.storia.shift(); }
        S.paginaId = paginaId;
        render();
    }

    function indietro() {
        S.paginaCalendario = null;
        const prec = S.storia.pop();
        if (prec && M().pagina(S.doc, prec)) { S.paginaId = prec; render(); }
        else naviga(S.doc.paginaHomeId, { azzera: true });
    }

    /** Voce sintetica: interrompe registrazioni e lettura della frase in corso */
    function parla(testo) {
        fraseToken++;
        Griglia.Audio.stop();
        return Griglia.Voce.parla(testo, { velocita: S.doc.voce.velocita, tono: S.doc.voce.tono });
    }

    /** Voce registrata di una cella: interrompe sintesi e lettura della frase in corso */
    function riproduciAudio(url) {
        fraseToken++;
        Griglia.Voce.stop();
        return Griglia.Audio.riproduci(url);
    }

    /** Legge la frase: le parole con voce sintetica insieme, le registrazioni una alla volta, nell'ordine in cui sono */
    async function parlaFrase() {
        const parti = S.frase.slice();
        if (!parti.length) return;
        if (!parti.some(p => p.audio)) { parla(parti.map(p => p.testo).join(' ')); return; }
        const token = ++fraseToken;
        Griglia.Voce.stop();
        Griglia.Audio.stop();
        let coda = [];
        const leggiCoda = async () => {
            if (!coda.length) return;
            const t = coda.join(' ');
            coda = [];
            // Se il browser non segnala la fine della lettura, si va avanti dopo un tempo ragionevole
            await Promise.race([
                Griglia.Voce.parla(t, { velocita: S.doc.voce.velocita, tono: S.doc.voce.tono }),
                U().attesa(Math.min(30000, 1500 + t.length * 110))
            ]);
        };
        for (const p of parti) {
            if (token !== fraseToken) return;
            if (p.audio) {
                await leggiCoda();
                if (token !== fraseToken) return;
                await Griglia.Audio.riproduci(p.audio);
            } else {
                coda.push(p.testo);
            }
        }
        if (token === fraseToken) await leggiCoda();
    }

    // ---------- Modalità modifica ----------
    function entraModifica() {
        if (S.modalita === 'modifica') return;
        if (S.paginaCalendario) { S.paginaCalendario = null; if (!M().pagina(S.doc, S.paginaId)) S.paginaId = S.doc.paginaHomeId; }
        fraseToken++;
        Griglia.Voce.stop();
        Griglia.Audio.stop();
        Griglia.Video.Schermo.chiudi();
        S.modalita = 'modifica';
        S.frase = [];
        el.body.dataset.modalita = 'modifica';
        if (input) input.sospendi(true);
        Griglia.Editor.attiva();
        render();
    }

    /** Fine modifica: si torna direttamente all'uso, come lo vede l'utente */
    async function esciModifica() {
        if (S.modalita !== 'modifica') return;
        Griglia.Editor.disattiva();
        S.modalita = 'usa';
        S.cellaSelezionataId = null;
        el.body.dataset.modalita = 'usa';
        if (!M().pagina(S.doc, S.paginaId)) S.paginaId = S.doc.paginaHomeId;
        S.storia = [];
        if (input) { input.imposta(S.doc.input); input.sospendi(false); }
        render();
        await salvaSubito();
    }

    function sostituisciDoc(doc) {
        S.doc = M().normalizza(doc);
        if (!M().pagina(S.doc, S.paginaId)) S.paginaId = S.doc.paginaHomeId;
        if (S.cellaSelezionataId && !paginaCorrente().celle.some(c => c.id === S.cellaSelezionataId)) S.cellaSelezionataId = null;
    }

    // ---------- Salvataggio ----------
    function segnaModificato() {
        S.salvataggio = 'sporco';
        mostraStato();
        if (!salvaDebounce) salvaDebounce = U().debounce(() => salva(), 1200);
        salvaDebounce();
    }

    async function salvaSubito() {
        if (salvaDebounce) salvaDebounce.annulla();
        if (S.salvataggio === 'sporco' || S.salvataggio === 'errore') await salva();
    }

    async function salva() {
        S.salvataggio = 'in-corso';
        mostraStato();
        try {
            await Griglia.Archivio.locale.salva(S.id, S.doc);
            S.salvataggio = 'ok';
            mostraStato();
        } catch (e) {
            S.salvataggio = 'errore';
            mostraStato(e.message);
            U().toast('Salvataggio non riuscito: ' + e.message, 'errore', 4000);
        }
    }

    function mostraStato(dettaglio) {
        const mappa = {
            ok: { testo: 'Salvato', icona: 'ok', cls: 'stato-ok' },
            sporco: { testo: 'Modifiche…', icona: 'salva', cls: 'stato-sporco' },
            'in-corso': { testo: 'Salvataggio…', icona: 'salva', cls: 'stato-sporco' },
            errore: { testo: 'Non salvato: tocca per riprovare', icona: 'errore', cls: 'stato-errore' }
        };
        const s = mappa[S.salvataggio] || mappa.ok;
        el.stato.className = `stato-salvataggio ${s.cls}`;
        el.stato.innerHTML = `${Griglia.icona(s.icona)}<span>${U().escapeHtml(dettaglio || s.testo)}</span>`;
        el.stato.title = dettaglio || s.testo;
    }

    // ---------- Blocco, schermo intero, uscita ----------
    function aggiornaBlocco() {
        el.btnBlocco.innerHTML = Griglia.icona(S.sbloccato ? 'sblocco' : 'blocco');
        el.btnBlocco.classList.toggle('sbloccato', S.sbloccato);
        el.btnBlocco.title = S.sbloccato ? 'Blocca l\'interfaccia per l\'utente' : 'Educatore: tieni premuto 2 secondi per sbloccare';
        el.body.dataset.sbloccato = S.sbloccato ? '1' : '0';
    }
    function sblocca() {
        S.sbloccato = true;
        aggiornaBlocco();
        U().toast('Sbloccato: puoi modificare o tornare all\'Area educatore', 'ok', 2500);
    }
    async function blocca() {
        if (S.modalita === 'modifica') await esciModifica();
        Griglia.Video.Schermo.chiudi();
        S.sbloccato = false;
        aggiornaBlocco();
        U().toast('Bloccato: per sbloccare tieni premuto il lucchetto', 'info', 2600);
    }

    function toggleSchermo() {
        const d = document;
        if (!d.fullscreenElement && d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
        else if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
    }

    async function esci() {
        if (S.modalita === 'modifica') await esciModifica(); else await salvaSubito();
        location.href = 'index.html';
    }

    async function vaiAreaEducatore() {
        if (S.modalita === 'modifica') await esciModifica(); else await salvaSubito();
        location.href = 'gestione.html';
    }

    function schermataMessaggio(titolo, testo, azioni = []) {
        document.getElementById('area').innerHTML = `
            <div class="schermata-messaggio">
                <div class="schermata-icona">${Griglia.icona('griglia')}</div>
                <h1>${U().escapeHtml(titolo)}</h1>
                <p>${U().escapeHtml(testo)}</p>
                <div class="schermata-azioni">${azioni.map(a => `<a class="btn ${a.secondario ? 'btn-secondario' : 'btn-primario'}" href="${U().escapeHtml(a.href)}">${U().escapeHtml(a.testo)}</a>`).join('')}</div>
            </div>`;
        document.getElementById('testata').hidden = true;
    }

    // ---------- Impostazioni ----------
    /** Tre parole del comunicatore (con immagine, se c'è) per l'anteprima della barra nelle impostazioni */
    function anteprimaChips() {
        const esc = U().escapeHtml;
        const celle = [];
        for (const p of [M().paginaHome(S.doc), ...S.doc.pagine]) {
            for (const c of p.celle) {
                if (!c.nascosta && c.etichetta && M().azioneCella(c) !== 'video' && !celle.some(x => x.etichetta === c.etichetta)) celle.push(c);
                if (celle.length >= 3) break;
            }
            if (celle.length >= 3) break;
        }
        if (!celle.length) return '<span class="chip"><span class="chip-testo">io</span></span><span class="chip"><span class="chip-testo">voglio</span></span>';
        return celle.map(c => {
            const url = M().urlImmagineCella(c, 300);
            return `<span class="chip">${url ? `<img src="${esc(url)}" alt="">` : ''}<span class="chip-testo">${esc(c.etichetta)}</span></span>`;
        }).join('');
    }

    function apriImpostazioni() {
        const d = S.doc;
        const voci = Griglia.Voce.vociItaliane();
        const vocePref = Griglia.Voce.vocePreferitaId();
        const esc = U().escapeHtml;
        const check = (v) => v ? 'checked' : '';

        const html = `
            <h2 class="modale-titolo">Impostazioni</h2>
            <div class="schede" role="tablist" id="schedeImp">
                <button type="button" class="scheda" role="tab" aria-selected="true" data-scheda="voce">Voce</button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-scheda="aspetto">Aspetto</button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-scheda="input">Selezione</button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-scheda="barra">Barra</button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-scheda="info">Info</button>
            </div>

            <section class="scheda-contenuto" data-scheda="voce">
                <div class="campo-gruppo">
                    <label class="etichetta-campo" for="impVoce">Voce di questo dispositivo</label>
                    <select class="campo" id="impVoce">
                        <option value="">Automatica (italiano)</option>
                        ${voci.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === vocePref ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}
                    </select>
                    ${voci.length ? '' : '<p class="nota">Nessuna voce italiana trovata sul dispositivo: verrà usata la voce predefinita del sistema.</p>'}
                </div>
                <div class="campo-gruppo">
                    <label class="etichetta-campo" for="impVelocita">Velocità: <output id="outVelocita">${d.voce.velocita.toFixed(1)}</output></label>
                    <input type="range" class="cursore" id="impVelocita" min="0.5" max="1.6" step="0.1" value="${d.voce.velocita}">
                </div>
                <label class="interruttore"><input type="checkbox" id="impParlaTocco" ${check(d.voce.parlaAlTocco)}><span>Leggi la parola appena tocco la cella</span></label>
                <button type="button" class="btn btn-secondario" id="btnProvaVoce">${Griglia.icona('prova')} Prova la voce</button>
            </section>

            <section class="scheda-contenuto" data-scheda="aspetto" hidden>
                <div class="campo-gruppo">
                    <span class="etichetta-campo">Colori delle celle</span>
                    <div class="opzioni-preset" role="radiogroup">
                        ${[['sfondo', 'Sfondo colorato'], ['bordo', 'Bordo colorato'], ['entrambi', 'Sfondo chiaro e bordo'], ['neutro', 'Senza colori']].map(([v, t]) => `
                        <label class="opzione-preset ${d.aspetto.preset === v ? 'attiva' : ''}" data-preset-anteprima="${v}">
                            <input type="radio" name="impPreset" value="${v}" ${d.aspetto.preset === v ? 'checked' : ''}>
                            <span class="anteprima-cella"><i></i><i></i><i></i></span>
                            <span>${t}</span>
                        </label>`).join('')}
                    </div>
                </div>
                <div class="campo-gruppo">
                    <label class="etichetta-campo" for="impTestoScala">Grandezza del testo nelle celle: <output id="outTestoScala">${Math.round((d.aspetto.testoScala || 1) * 100)}%</output></label>
                    <input type="range" class="cursore" id="impTestoScala" min="0.6" max="3" step="0.1" value="${d.aspetto.testoScala || 1}">
                    <p class="nota nota-piccola">Il testo resta su una riga sola: se una parola è più lunga della sua cella, in quella cella si riduce da sola fino al bordo. Righe e colonne non cambiano.</p>
                </div>
                <div class="campo-gruppo">
                    <label class="etichetta-campo" for="impImgScala">Grandezza dell'immagine nelle celle: <output id="outImgScala">${Math.round((d.aspetto.immagineScala || 1) * 100)}%</output></label>
                    <input type="range" class="cursore" id="impImgScala" min="0.5" max="1.5" step="0.05" value="${d.aspetto.immagineScala || 1}">
                    <p class="nota nota-piccola">Oltre il 100% l'immagine riempie di più la cella e il bordo del pittogramma resta fuori.</p>
                </div>
                <div class="campo-gruppo">
                    <label class="etichetta-campo" for="impCalScala">Grandezza del testo del calendario: <output id="outCalScala">${Math.round((d.aspetto.calendarioScala || 1) * 100)}%</output></label>
                    <input type="range" class="cursore" id="impCalScala" min="0.5" max="3" step="0.1" value="${d.aspetto.calendarioScala || 1}">
                    <p class="nota nota-piccola">Regola i tre box ieri/oggi/domani in modo indipendente dal testo delle celle: se i pittogrammi hanno un testo grande, qui puoi rimpicciolire il calendario perché non venga tagliato. Se un nome non entra, si riduce da solo fino al bordo.</p>
                </div>
                <div class="campo-gruppo">
                    <span class="etichetta-campo">Posizione del testo</span>
                    <div class="segmenti" role="radiogroup">
                        ${[['sotto', 'Sotto l\'immagine'], ['sopra', 'Sopra l\'immagine']].map(([v, t]) => `<label class="segmento ${d.aspetto.posizioneTesto === v ? 'attivo' : ''}"><input type="radio" name="impPosTesto" value="${v}" ${d.aspetto.posizioneTesto === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
                    </div>
                </div>
                <label class="interruttore"><input type="checkbox" id="impEtichette" ${check(d.aspetto.mostraEtichette)}><span>Mostra le parole sotto le immagini</span></label>
            </section>

            <section class="scheda-contenuto" data-scheda="input" hidden>
                <div class="campo-gruppo">
                    <span class="etichetta-campo">Come si selezionano le celle</span>
                    <div class="opzioni-lista" role="radiogroup">
                        ${[['tocco', 'tocco', 'Tocco o clic', 'Con il dito, il mouse o un puntatore'], ['dwell', 'timer', 'Permanenza (dwell)', 'Basta fermarsi sulla cella per il tempo scelto: adatto a puntatori oculari e a chi non riesce a cliccare'], ['scansione', 'scansione', 'Scansione con un pulsante', 'Le righe si illuminano una alla volta; premi Spazio, Invio o tocca lo schermo per scegliere']].map(([v, ic, t, s]) => `
                        <label class="opzione-lista ${d.input.metodo === v ? 'attiva' : ''}">
                            <input type="radio" name="impMetodo" value="${v}" ${d.input.metodo === v ? 'checked' : ''}>
                            ${Griglia.icona(ic)}<span><strong>${t}</strong><small>${s}</small></span>
                        </label>`).join('')}
                    </div>
                </div>
                <div class="campo-gruppo" id="gruppoDwell">
                    <label class="etichetta-campo" for="impDwell">Tempo di permanenza: <output id="outDwell">${(d.input.tempoDwell / 1000).toFixed(1)} s</output></label>
                    <input type="range" class="cursore" id="impDwell" min="400" max="4000" step="100" value="${d.input.tempoDwell}">
                </div>
                <div class="campo-gruppo" id="gruppoScan">
                    <label class="etichetta-campo" for="impScan">Tempo di scansione: <output id="outScan">${(d.input.tempoScansione / 1000).toFixed(1)} s</output></label>
                    <input type="range" class="cursore" id="impScan" min="600" max="6000" step="100" value="${d.input.tempoScansione}">
                    <label class="etichetta-campo" for="impTasto" style="margin-top:10px">Pulsante di selezione</label>
                    <select class="campo" id="impTasto">
                        <option value="qualsiasi" ${d.input.tastoSelezione === 'qualsiasi' ? 'selected' : ''}>Spazio, Invio o tocco sullo schermo</option>
                        <option value="spazio" ${d.input.tastoSelezione === 'spazio' ? 'selected' : ''}>Solo Spazio (e tocco)</option>
                        <option value="invio" ${d.input.tastoSelezione === 'invio' ? 'selected' : ''}>Solo Invio (e tocco)</option>
                    </select>
                    <p class="nota">I pulsanti esterni (switch USB o Bluetooth) di solito inviano Spazio o Invio.</p>
                </div>
            </section>

            <section class="scheda-contenuto" data-scheda="barra" hidden>
                <div class="campo-gruppo">
                    <label class="etichetta-campo" for="impBarraDim">Grandezza della barra della frase: <output id="outBarraDim">${Math.round((d.barra.dimensione || 1) * 100)}%</output></label>
                    <input type="range" class="cursore" id="impBarraDim" min="1" max="5" step="0.1" value="${d.barra.dimensione || 1}" aria-describedby="notaBarraDim">
                    <div class="barra-frase anteprima-barra" aria-hidden="true">
                        <div class="barra-frase-parole">${anteprimaChips()}</div>
                        <div class="barra-comandi"><span class="barra-btn barra-parla">${Griglia.icona('parla')}<span class="barra-btn-testo">Parla</span></span></div>
                    </div>
                    <p class="nota nota-piccola" id="notaBarraDim">Parole, immagini e pulsanti della barra crescono insieme; la barra dietro questa finestra cambia subito.</p>
                </div>
                <p class="nota">La barra in alto è fissa e uguale su tutte le pagine: scegli cosa mostrare.</p>
                ${[['frase', 'Barra della frase (le parole toccate si mettono in fila)'], ['parla', 'Pulsante Parla'], ['cancellaParola', 'Pulsante Togli l\'ultima parola'], ['cancellaTutto', 'Pulsante Cancella tutto'], ['home', 'Pulsante Pagina iniziale'], ['indietro', 'Pulsante Indietro']].map(([k, t]) => `
                <label class="interruttore"><input type="checkbox" data-barra="${k}" ${check(d.barra[k])}><span>${t}</span></label>`).join('')}
                <hr class="separatore">
                <label class="interruttore"><input type="checkbox" id="impTornaHome" ${check(d.tornaHomeDopoSelezione)}><span>Dopo ogni parola torna alla pagina iniziale</span></label>
            </section>

            <section class="scheda-contenuto" data-scheda="info" hidden>
                <p><strong>Griglia</strong> v${Griglia.VERSIONE} · comunicatore a griglie di AssistiveTech.it</p>
                <p>${d.pagine.length} pagine, ${M().conta(d).celle} celle. Salvato solo su questo dispositivo: per non perderlo scarica ogni tanto una copia di sicurezza dall'Area Educatore.</p>
                <p class="nota">${esc(Griglia.Arasaac.ATTRIBUZIONE)}. I pittogrammi ARASAAC sono liberi per uso non commerciale.</p>
                <p class="nota">Ispirato ad Asterics AAC (grid.asterics.eu), riscritto da zero per essere semplice da configurare.</p>
            </section>`;

        const box = U().apriModale(html);
        if (input) input.sospendi(true);
        box.addEventListener('griglia:chiusa', () => { if (input && S.modalita === 'usa') input.sospendi(false); }, { once: true });

        box.querySelectorAll('#schedeImp .scheda').forEach(t => t.addEventListener('click', () => {
            box.querySelectorAll('#schedeImp .scheda').forEach(x => x.setAttribute('aria-selected', x === t ? 'true' : 'false'));
            box.querySelectorAll('.scheda-contenuto').forEach(s => s.hidden = s.dataset.scheda !== t.dataset.scheda);
        }));
        const aggiornaGruppiInput = () => {
            const m = box.querySelector('input[name="impMetodo"]:checked')?.value || d.input.metodo;
            box.querySelector('#gruppoDwell').hidden = m !== 'dwell';
            box.querySelector('#gruppoScan').hidden = m !== 'scansione';
        };
        aggiornaGruppiInput();

        box.querySelector('#impVoce').addEventListener('change', e => Griglia.Voce.setVocePreferita(e.target.value));
        box.querySelector('#btnProvaVoce').addEventListener('click', () => parla('Ciao! Questa è la mia voce.'));

        const cambia = (fn) => { fn(); segnaModificato(); render(); };
        box.querySelector('#impVelocita').addEventListener('input', e => { box.querySelector('#outVelocita').value = parseFloat(e.target.value).toFixed(1); cambia(() => d.voce.velocita = parseFloat(e.target.value)); });
        box.querySelector('#impParlaTocco').addEventListener('change', e => cambia(() => d.voce.parlaAlTocco = e.target.checked));
        box.querySelectorAll('input[name="impPreset"]').forEach(r => r.addEventListener('change', e => {
            box.querySelectorAll('.opzione-preset').forEach(o => o.classList.toggle('attiva', o.querySelector('input').checked));
            cambia(() => d.aspetto.preset = e.target.value);
        }));
        box.querySelector('#impTestoScala').addEventListener('input', e => {
            const v = Math.round(parseFloat(e.target.value) * 10) / 10;
            box.querySelector('#outTestoScala').value = `${Math.round(v * 100)}%`;
            d.aspetto.testoScala = v;
            Griglia.Render.applicaAspetto(el.body, d);
            Griglia.Render.adattaTesti(el.palco);   // anteprima immediata sulla griglia dietro la finestra
            segnaModificato();
        });
        box.querySelector('#impImgScala').addEventListener('input', e => {
            const v = Math.round(parseFloat(e.target.value) * 20) / 20;
            box.querySelector('#outImgScala').value = `${Math.round(v * 100)}%`;
            d.aspetto.immagineScala = v;
            Griglia.Render.applicaAspetto(el.body, d);
            segnaModificato();
        });
        box.querySelector('#impCalScala').addEventListener('input', e => {
            const v = Math.round(parseFloat(e.target.value) * 10) / 10;
            box.querySelector('#outCalScala').value = `${Math.round(v * 100)}%`;
            d.aspetto.calendarioScala = v;
            Griglia.Render.applicaAspetto(el.body, d);
            if (S.paginaCalendario) adattaCalendario(el.palco);   // anteprima immediata se il calendario è aperto
            segnaModificato();
        });
        box.querySelectorAll('input[name="impPosTesto"]').forEach(r => r.addEventListener('change', e => { box.querySelectorAll('input[name="impPosTesto"]').forEach(x => x.closest('.segmento').classList.toggle('attivo', x.checked)); cambia(() => d.aspetto.posizioneTesto = e.target.value); }));
        box.querySelector('#impEtichette').addEventListener('change', e => cambia(() => d.aspetto.mostraEtichette = e.target.checked));
        box.querySelectorAll('input[name="impMetodo"]').forEach(r => r.addEventListener('change', e => {
            box.querySelectorAll('.opzione-lista').forEach(o => o.classList.toggle('attiva', o.querySelector('input').checked));
            aggiornaGruppiInput();
            cambia(() => d.input.metodo = e.target.value);
            if (input) input.imposta(d.input);
        }));
        box.querySelector('#impDwell').addEventListener('input', e => { box.querySelector('#outDwell').value = (e.target.value / 1000).toFixed(1) + ' s'; d.input.tempoDwell = parseInt(e.target.value, 10); segnaModificato(); if (input) input.imposta(d.input); });
        box.querySelector('#impScan').addEventListener('input', e => { box.querySelector('#outScan').value = (e.target.value / 1000).toFixed(1) + ' s'; d.input.tempoScansione = parseInt(e.target.value, 10); segnaModificato(); if (input) input.imposta(d.input); });
        box.querySelector('#impTasto').addEventListener('change', e => { d.input.tastoSelezione = e.target.value; segnaModificato(); if (input) input.imposta(d.input); });
        box.querySelector('#impBarraDim').addEventListener('input', e => {
            const v = Math.round(parseFloat(e.target.value) * 10) / 10;
            box.querySelector('#outBarraDim').value = `${Math.round(v * 100)}%`;
            d.barra.dimensione = v;
            Griglia.Render.applicaAspetto(el.body, d);   // anteprima immediata: la barra vera e quella nella finestra
            segnaModificato();
        });
        box.querySelectorAll('input[data-barra]').forEach(c => c.addEventListener('change', e => cambia(() => d.barra[e.target.dataset.barra] = e.target.checked)));
        box.querySelector('#impTornaHome').addEventListener('change', e => cambia(() => d.tornaHomeDopoSelezione = e.target.checked));
    }

    // ---------- Eventi ----------
    function collegaEventi() {
        el.btnEsci.addEventListener('click', esci);
        el.btnModifica.addEventListener('click', entraModifica);
        el.btnEducatore.addEventListener('click', vaiAreaEducatore);
        el.btnFine.addEventListener('click', esciModifica);
        el.btnImpostazioni.addEventListener('click', apriImpostazioni);
        el.btnSchermo.addEventListener('click', toggleSchermo);
        el.btnAnnulla.addEventListener('click', () => Griglia.Editor.annulla());
        el.stato.addEventListener('click', () => { if (S.salvataggio === 'errore') salva(); });

        // Lucchetto: pressione lunga per sbloccare, tocco per bloccare
        let ignoraClick = false;   // il clic che segue la pressione lunga (mouse) non deve ribloccare
        const iniziaPressione = (e) => {
            e.preventDefault();
            ignoraClick = false;
            if (S.sbloccato) return;
            el.btnBlocco.classList.add('in-pressione');
            timerBlocco = setTimeout(() => { el.btnBlocco.classList.remove('in-pressione'); timerBlocco = null; ignoraClick = true; sblocca(); }, 2000);
        };
        const finePressione = () => {
            el.btnBlocco.classList.remove('in-pressione');
            if (timerBlocco) { clearTimeout(timerBlocco); timerBlocco = null; }
        };
        el.btnBlocco.addEventListener('pointerdown', iniziaPressione);
        el.btnBlocco.addEventListener('pointerup', finePressione);
        el.btnBlocco.addEventListener('pointerleave', finePressione);
        el.btnBlocco.addEventListener('pointercancel', finePressione);
        el.btnBlocco.addEventListener('click', () => {
            if (ignoraClick) { ignoraClick = false; return; }
            if (S.sbloccato) blocca();
            else U().toast('Educatore: per sbloccare tieni premuto il lucchetto per 2 secondi', 'info', 3000);   // tocco breve da bloccato: suggerimento
        });
        el.btnBlocco.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !S.sbloccato) { e.preventDefault(); sblocca(); } });

        el.area.addEventListener('contextmenu', e => { if (e.target.closest('.cella, .barra-btn')) e.preventDefault(); });

        // Sui tablet l'audio parte solo dopo un gesto: al primo tocco si "sblocca" il lettore delle registrazioni,
        // così poi le celle possono suonare anche con permanenza e scansione
        const sbloccaAudio = () => Griglia.Audio.sblocca();
        ['pointerup', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, sbloccaAudio, { capture: true, passive: true }));

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && U().modaleAperta()) { U().chiudiModale(); return; }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && S.modalita === 'modifica' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
                e.preventDefault(); Griglia.Editor.annulla();
            }
        });

        window.addEventListener('pagehide', () => { if (S.salvataggio === 'sporco') salvaSubito(); });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvaSubito(); });
    }

    // API per editor e schermo video
    const api = {
        get stato() { return S; },
        get doc() { return S.doc; },
        paginaCorrente, render, renderBarra, adattaTesti, segnaModificato, salvaSubito, naviga, sostituisciDoc, parla, riproduciAudio,
        entraModifica, esciModifica, vaiAreaEducatore,
        setCellaSelezionata(id) { S.cellaSelezionataId = id; },
        setPagina(id) { S.paginaId = id; S.storia = []; },
        abilitaAnnulla(v) { el.btnAnnulla.disabled = !v; },
        get input() { return input; }
    };

    document.addEventListener('DOMContentLoaded', init);
    return api;
})();
