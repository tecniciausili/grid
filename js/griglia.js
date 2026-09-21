/**
 * Griglia - Rendering della pagina (CSS Grid) e della barra della frase
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Il renderer è puro: costruisce il DOM e basta. Gli eventi sono gestiti
 * dall'app per delega (click su .cella, .slot-vuoto, [data-azione]).
 */
window.Griglia = window.Griglia || {};

Griglia.Render = (function () {
    const M = () => Griglia.Modello;
    const esc = (s) => Griglia.util.escapeHtml(s);

    /** Applica preset di aspetto e dimensione testo come attributi sulla radice */
    function applicaAspetto(radice, doc) {
        const a = doc.aspetto || {};
        radice.dataset.preset = a.preset || 'sfondo';
        radice.dataset.testo = a.testo || 'M';
        radice.dataset.posTesto = a.posizioneTesto || 'sotto';
        radice.dataset.etichette = a.mostraEtichette === false ? 'no' : 'si';
        // Grandezza della barra della frase (Impostazioni → Barra): altezza, parole, immagini e pulsanti insieme
        radice.style.setProperty('--barra-scala', String((doc.barra && doc.barra.dimensione) || 1));
        // Grandezza di testo e immagine nelle celle (Impostazioni → Aspetto), senza cambiare righe e colonne
        radice.style.setProperty('--testo-scala', String(a.testoScala || 1));
        radice.style.setProperty('--img-scala', String(a.immagineScala || 1));
        // Testo dei box del calendario: cursore proprio, indipendente dal testo delle celle
        radice.style.setProperty('--cal-scala', String(a.calendarioScala || 1));
    }

    /**
     * Testo delle celle su una riga sola: se una parola è più larga della sua cella, riduce il carattere
     * di quella cella fino a farla entrare (le altre restano alla misura del cursore).
     * Letture e scritture separate per non forzare un reflow per ogni cella.
     */
    function adattaTesti(radice) {
        if (!radice) return;
        const testi = Array.from(radice.querySelectorAll('.cella-testo'));
        if (!testi.length) return;
        testi.forEach(t => { if (t.style.fontSize) t.style.fontSize = ''; });
        const misure = testi.map(t => ({ t, larghezza: t.scrollWidth, disponibile: t.clientWidth, attuale: parseFloat(getComputedStyle(t).fontSize) || 16 }));
        misure.forEach(({ t, larghezza, disponibile, attuale }) => {
            if (!disponibile || larghezza <= disponibile) return;
            t.style.fontSize = `${Math.max(9, Math.floor(attuale * disponibile / larghezza * 0.96))}px`;
        });
    }

    function elementoCella(cella, doc, { modifica = false, selezionata = false } = {}) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cella';
        b.dataset.id = cella.id;
        b.setAttribute('data-sel', '');
        b.style.gridColumn = `${cella.x + 1} / span ${cella.w}`;
        b.style.gridRow = `${cella.y + 1} / span ${cella.h}`;
        const colore = M().coloreCella(cella);
        b.style.setProperty('--cella-colore', colore);
        b.style.setProperty('--cella-colore-chiaro', M().schiarisci(colore, 0.55));
        if (cella.categoria === 'nessuna' && !cella.colore) b.classList.add('cella-senza-colore');
        const azione = M().azioneCella(cella);
        if (azione === 'pagina') b.classList.add('cella-cartella');
        if (azione === 'video') b.classList.add('cella-video');
        const conAudio = !!M().audioCella(cella);
        if (conAudio) b.classList.add('cella-audio');
        if (cella.nascosta) b.classList.add('cella-nascosta');
        if (selezionata) b.classList.add('cella-selezionata');
        if (modifica) b.draggable = false;

        const testo = cella.etichetta || '';
        const detto = M().testoDetto(cella);
        b.setAttribute('aria-label', (azione === 'pagina' ? `${testo || 'pagina'}, apre una pagina` : azione === 'video' ? `${testo || cella.video.titolo || 'video'}, avvia un video` : (detto || (conAudio ? 'registrazione' : 'cella vuota')))
            + (conAudio ? ', con voce registrata' : ''));
        b.title = modifica ? (testo || 'Cella vuota') : '';

        const url = M().urlImmagineCella(cella, 300);
        const img = url
            ? `<span class="cella-img"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" draggable="false"></span>`
            : (testo ? '' : `<span class="cella-img cella-img-vuota">${Griglia.icona('immagine')}</span>`);
        const etichetta = `<span class="cella-testo${url ? '' : ' cella-testo-solo'}">${esc(testo)}</span>`;
        b.innerHTML = (doc.aspetto?.posizioneTesto === 'sopra' ? etichetta + img : img + etichetta)
            + (azione === 'pagina' ? `<span class="cella-angolo" aria-hidden="true">${Griglia.icona('cartella')}</span>` : '')
            + (azione === 'video' ? `<span class="cella-angolo cella-angolo-video" aria-hidden="true">${Griglia.icona('gioca')}</span>` : '')
            + (conAudio ? `<span class="cella-angolo cella-angolo-audio" aria-hidden="true">${Griglia.icona('microfono')}</span>` : '')
            + (modifica && cella.nascosta ? `<span class="cella-badge" aria-hidden="true">${Griglia.icona('occhioChiuso')}</span>` : '')
            + (modifica && !url && !testo ? '' : '');
        return b;
    }

    /**
     * Disegna la pagina nel contenitore.
     * @param {HTMLElement} contenitore
     * @param {object} doc
     * @param {object} pag
     * @param {{modifica?:boolean, cellaSelezionataId?:string}} opzioni
     */
    function pagina(contenitore, doc, pag, opzioni = {}) {
        const { modifica = false, cellaSelezionataId = null } = opzioni;
        const g = document.createElement('div');
        g.className = 'griglia' + (modifica ? ' griglia-modifica' : '');
        g.style.gridTemplateColumns = `repeat(${pag.colonne}, minmax(0, 1fr))`;
        g.style.gridTemplateRows = `repeat(${pag.righe}, minmax(0, 1fr))`;
        g.dataset.pagina = pag.id;

        pag.celle.forEach(c => {
            if (c.nascosta && !modifica) return;
            g.appendChild(elementoCella(c, doc, { modifica, selezionata: c.id === cellaSelezionataId }));
        });

        if (modifica) {
            for (let y = 0; y < pag.righe; y++) for (let x = 0; x < pag.colonne; x++) {
                if (M().cellaIn(pag, x, y)) continue;
                const s = document.createElement('button');
                s.type = 'button';
                s.className = 'slot-vuoto';
                s.dataset.x = x; s.dataset.y = y;
                s.style.gridColumn = `${x + 1}`; s.style.gridRow = `${y + 1}`;
                s.setAttribute('aria-label', `Aggiungi cella in riga ${y + 1}, colonna ${x + 1}`);
                s.innerHTML = Griglia.icona('piu');
                g.appendChild(s);
            }
        }

        contenitore.replaceChildren(g);
        return g;
    }

    /**
     * Barra della frase: navigazione a sinistra, parole al centro, comandi vocali a destra.
     * @param {HTMLElement} contenitore
     * @param {object} doc
     * @param {{frase: Array<{id:string, testo:string, url:string|null}>, puoTornare:boolean, inHome:boolean}} stato
     */
    function barra(contenitore, doc, stato) {
        const b = doc.barra || {};
        const nav = [];
        if (b.home) nav.push(`<button type="button" class="barra-btn" data-sel data-azione="home" ${stato.inHome ? 'aria-current="page"' : ''} aria-label="Pagina iniziale" title="Pagina iniziale">${Griglia.icona('home')}</button>`);
        if (b.indietro) nav.push(`<button type="button" class="barra-btn" data-sel data-azione="indietro" ${stato.puoTornare ? '' : 'disabled'} aria-label="Pagina precedente" title="Pagina precedente">${Griglia.icona('indietro')}</button>`);

        let frase = '';
        if (b.frase) {
            const chips = stato.frase.map((p, i) => `
                <span class="chip" data-indice="${i}">
                    ${p.url ? `<img src="${esc(p.url)}" alt="" draggable="false">` : ''}<span class="chip-testo">${esc(p.testo)}</span>
                </span>`).join('');
            frase = `<div class="barra-frase-parole" id="barraParole" aria-live="polite" aria-label="Frase">${chips || '<span class="barra-vuota">Tocca le celle per comporre la frase</span>'}</div>`;
        }

        const cmd = [];
        if (b.frase && b.parla) cmd.push(`<button type="button" class="barra-btn barra-parla" data-sel data-azione="parla" ${stato.frase.length ? '' : 'disabled'} aria-label="Leggi la frase">${Griglia.icona('parla')}<span class="barra-btn-testo">Parla</span></button>`);
        if (b.frase && b.cancellaParola) cmd.push(`<button type="button" class="barra-btn" data-sel data-azione="cancellaParola" ${stato.frase.length ? '' : 'disabled'} aria-label="Togli l'ultima parola" title="Togli l'ultima parola">${Griglia.icona('cancellaParola')}</button>`);
        if (b.frase && b.cancellaTutto) cmd.push(`<button type="button" class="barra-btn" data-sel data-azione="cancellaTutto" ${stato.frase.length ? '' : 'disabled'} aria-label="Cancella tutta la frase" title="Cancella tutto">${Griglia.icona('cancellaTutto')}</button>`);

        const vuota = !nav.length && !frase && !cmd.length;
        contenitore.hidden = vuota;
        contenitore.innerHTML = vuota ? '' : `
            ${nav.length ? `<div class="barra-nav">${nav.join('')}</div>` : ''}
            ${frase}
            ${cmd.length ? `<div class="barra-comandi">${cmd.join('')}</div>` : ''}`;
        const parole = contenitore.querySelector('#barraParole');
        if (parole) parole.scrollLeft = parole.scrollWidth;
        return contenitore;
    }

    return { applicaAspetto, adattaTesti, pagina, elementoCella, barra };
})();
