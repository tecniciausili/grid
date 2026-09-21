/**
 * Griglia - Area Educatore: comunicatori, archivio video, copia di sicurezza
 * AssistiveTech.it - Training Cognitivo / Strumenti (versione autonoma per Azure Static Web Apps)
 *
 * Un dispositivo = un utente: l'educatore prepara qui i comunicatori dell'utente di questo
 * dispositivo. Il comunicatore "in uso" è quello che l'Area Utente apre.
 * I dati restano solo su questo dispositivo: la copia di sicurezza li salva in un file.
 */
(function () {
    const M = () => Griglia.Modello;
    const U = () => Griglia.util;
    const esc = (s) => Griglia.util.escapeHtml(s);
    const S = { lista: [], modelli: null };
    let el = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        el.corpo = document.getElementById('gestioneCorpo');
        el.chip = document.getElementById('avvioUtente');
        Griglia.registraServiceWorker();
        Griglia.DB.persistente();
        el.chip.innerHTML = `<a class="btn btn-piccolo btn-primario" href="utente.html" id="btnVaiUtente">${Griglia.icona('gioca')} Vai all'area utente</a>`;
        await caricaLista();
    }

    function messaggio(titolo, testo, azioni = []) {
        el.corpo.innerHTML = `<div class="vuoto-stato" style="max-width:560px;margin:0 auto">${Griglia.icona('info')}<h3>${esc(titolo)}</h3><p class="nota">${esc(testo)}</p>
            <div class="eroe-azioni" style="justify-content:center">${azioni.map(a => `<a class="btn ${a.secondario ? '' : 'btn-primario'}" href="${esc(a.href)}">${esc(a.testo)}</a>`).join('')}</div></div>`;
    }

    // ---------- Elenco ----------
    async function caricaLista() {
        try { S.lista = await Griglia.Archivio.locale.lista(); }
        catch (e) { messaggio('Archivio non disponibile', e.message, [{ testo: 'Riprova', href: location.href }]); return; }
        render();
    }

    function anteprimaHtml(doc, colonne, righe, classe = 'anteprima') {
        let colori = [];
        let c = colonne, r = righe;
        if (doc && doc.pagine) {
            const home = M().paginaHome(doc);
            c = Math.min(home.colonne, 6); r = Math.min(home.righe, 4);
            for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) { const cella = M().cellaIn(home, x, y); colori.push(cella ? M().coloreCella(cella) : null); }
        } else colori = Array(c * r).fill(null);
        return `<div class="${classe}" style="grid-template-columns:repeat(${c},1fr);grid-template-rows:repeat(${r},1fr)">${colori.map(col => col ? `<i style="--c:${col}"></i>` : '<i class="vuota"></i>').join('')}</div>`;
    }

    function render() {
        const schede = S.lista.map(c => `
            <article class="scheda-com ${c.attivo ? 'scheda-com-attiva' : ''}" data-id="${c.id_comunicatore}">
                <div class="anteprima-vuota-box" data-anteprima="${c.id_comunicatore}">${anteprimaHtml(null, 4, 3)}</div>
                <div>
                    <h3>${esc(c.nome)} ${c.attivo ? `<span class="badge-attivo" title="Lo apre l'Area Utente">${Griglia.icona('stella')} in uso</span>` : ''}</h3>
                    <div class="meta">${c.n_pagine} pagine · ${c.n_celle} celle · ${esc(c.data_modifica || '')}</div>
                </div>
                <div class="azioni">
                    <a class="btn btn-primario btn-piccolo" href="app.html?id=${c.id_comunicatore}&modifica=1">${Griglia.icona('modifica')} Modifica</a>
                    <a class="btn btn-piccolo" href="app.html?id=${c.id_comunicatore}&prova=1" title="Guardalo come lo vede l'utente (bloccato): per tornare qui tieni premuto il lucchetto 2 secondi">${Griglia.icona('gioca')} Prova</a>
                    <button type="button" class="btn btn-piccolo btn-menu" data-id="${c.id_comunicatore}" aria-label="Altre azioni" title="Altre azioni" style="flex:0 0 auto;padding:0 10px">···</button>
                </div>
            </article>`).join('');

        const nuovo = `<button type="button" class="scheda-nuovo" id="btnNuovo">${Griglia.icona('piu')}<span>Nuovo comunicatore</span><small class="nota" style="margin:0">da un modello, vuoto, da parole o da un file</small></button>`;
        const vuoto = !S.lista.length ? `<div class="vuoto-stato" style="grid-column:1/-1">${Griglia.icona('griglia')}<h3>Nessun comunicatore su questo dispositivo</h3><p class="nota">Creane uno partendo da un modello in italiano: bastano pochi tocchi. Il primo creato diventa quello in uso. Hai una copia di sicurezza? Ripristinala qui sopra.</p></div>` : '';

        // Ordine pensato per il tablet: strumenti rapidi (archivio video, copia di sicurezza), poi i comunicatori
        el.corpo.innerHTML = `
            <div class="banner banner-riquadro">${Griglia.icona('info')}<span>Comunicatori, foto, registrazioni e video restano <strong>solo su questo dispositivo</strong>, per l'utente che lo usa.
                Non cancellare i dati di navigazione del browser e scarica ogni tanto una copia di sicurezza.</span></div>
            <div class="strumenti-rapidi">
                <div class="strumento-box">
                    <h3>${Griglia.icona('cartella')} Archivio video</h3>
                    <p class="nota">Cerca su YouTube o incolla un link, con categoria e tempi di inizio e fine. Nel comunicatore, le celle «Avvia un video» scelgono da qui. <span id="riepilogoArchivio"></span></p>
                    <button type="button" class="btn btn-piccolo" id="btnArchivio">${Griglia.icona('cartella')} Gestisci l'archivio</button>
                </div>
                <div class="strumento-box">
                    <h3>${Griglia.icona('salva')} Copia di sicurezza</h3>
                    <p class="nota">Un unico file con tutti i comunicatori, le foto, le registrazioni e l'archivio video: serve per non perdere il lavoro o per passarlo a un nuovo dispositivo. <span id="riepilogoSpazio"></span></p>
                    <div class="eroe-azioni">
                        <button type="button" class="btn btn-piccolo" id="btnBackup">${Griglia.icona('scarica')} Scarica la copia</button>
                        <label class="btn btn-piccolo" style="cursor:pointer">${Griglia.icona('importa')} Ripristina<input type="file" id="fileBackup" accept=".json,application/json" hidden></label>
                    </div>
                </div>
            </div>
            <div class="sezione-titolo"><h2>Comunicatori</h2></div>
            <div class="lista-comunicatori">${schede}${nuovo}${vuoto}</div>`;

        el.corpo.querySelector('#btnNuovo').addEventListener('click', apriNuovo);
        el.corpo.querySelector('#btnArchivio').addEventListener('click', () => Griglia.Video.apriSelettore({ titolo: 'Archivio video' }));
        el.corpo.querySelector('#btnBackup').addEventListener('click', scaricaBackup);
        el.corpo.querySelector('#fileBackup').addEventListener('change', ripristina);
        el.corpo.querySelectorAll('.btn-menu').forEach(b => b.addEventListener('click', () => apriMenu(parseInt(b.dataset.id, 10))));
        caricaAnteprime();
        riepilogoArchivio();
        riepilogoSpazio();
    }

    // ---------- Copia di sicurezza ----------
    async function scaricaBackup(e) {
        const b = e.currentTarget;
        b.disabled = true;
        try {
            const dati = await Griglia.Archivio.creaBackup();
            const blob = new Blob([JSON.stringify(dati)], { type: 'application/json' });
            const oggi = new Date().toISOString().slice(0, 10);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `griglia_copia_${oggi}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            U().toast(`Copia scaricata: ${dati.comunicatori.length} comunicatori, ${dati.video.length} video`, 'ok', 4000);
        } catch (err) { U().toast('Copia non riuscita: ' + err.message, 'errore', 6000); }
        finally { b.disabled = false; }
    }

    async function ripristina(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        let json;
        try { json = JSON.parse(await file.text()); } catch (err) { U().toast('Il file non è leggibile', 'errore'); return; }
        if (!Griglia.Archivio.eBackup(json)) {
            U().toast('Non è una copia di sicurezza di Griglia: per un singolo comunicatore usa «Nuovo comunicatore» → «Da un file»', 'errore', 7000);
            return;
        }
        const ok = await U().conferma('Ripristinare la copia?', `Copia del ${json.data || '?'}: ${json.comunicatori.length} comunicatori e ${(json.video || []).length} video. Vengono aggiunti a quelli già presenti su questo dispositivo, senza cancellare nulla.`, { ok: 'Ripristina' });
        if (!ok) return;
        try {
            U().toast('Ripristino in corso…', 'info', 2500);
            const esito = await Griglia.Archivio.ripristinaBackup(json);
            U().toast(`Ripristinati ${esito.comunicatori} comunicatori e ${esito.video} video`, 'ok', 5000);
        } catch (err) { U().toast('Ripristino non riuscito: ' + err.message, 'errore', 6000); }
        await caricaLista();
    }

    async function riepilogoSpazio() {
        const s = await Griglia.Archivio.spazio();
        const sp = el.corpo.querySelector('#riepilogoSpazio');
        if (!s || !sp || s.usato < 104858) return;   // sotto 0,1 MB non dice nulla di utile
        const mb = (n) => (n / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 });
        sp.textContent = `Spazio usato: ${mb(s.usato)} MB${s.totale ? ` su ${mb(s.totale)} MB disponibili` : ''}.`;
    }

    /** Anteprime colorate: carica i documenti in sottofondo */
    async function caricaAnteprime() {
        for (const c of S.lista.slice(0, 12)) {
            try {
                const dati = await Griglia.Archivio.locale.carica(c.id_comunicatore);
                const box = el.corpo.querySelector(`[data-anteprima="${c.id_comunicatore}"]`);
                if (box) box.innerHTML = anteprimaHtml(M().normalizza(dati.documento), 4, 3);
            } catch (e) { /* anteprima non essenziale */ }
        }
    }

    async function riepilogoArchivio() {
        try {
            const cat = await Griglia.Video.archivio.categorie();
            const n = cat.reduce((s, c) => s + parseInt(c.n, 10), 0);
            const sp = el.corpo.querySelector('#riepilogoArchivio');
            if (sp) sp.textContent = n ? `Oggi contiene ${n} video in ${cat.length} categorie: ${cat.map(c => c.categoria).join(', ')}.` : 'L\'archivio è ancora vuoto.';
        } catch (e) { /* ignora */ }
    }

    // ---------- Menu azioni ----------
    function apriMenu(id) {
        const c = S.lista.find(x => x.id_comunicatore === id);
        if (!c) return;
        const box = U().apriModale(`
            <h2 class="modale-titolo">${esc(c.nome)}</h2>
            <div class="scelte-esporta">
                ${c.attivo ? '' : `<button type="button" class="scelta" data-az="attivo">${Griglia.icona('stella')}<span><strong>Metti in uso</strong><small>Diventa il comunicatore che l'Area Utente apre</small></span></button>`}
                <button type="button" class="scelta" data-az="rinomina">${Griglia.icona('modifica')}<span><strong>Rinomina</strong></span></button>
                <button type="button" class="scelta" data-az="duplica">${Griglia.icona('duplica')}<span><strong>Duplica</strong><small>Crea una copia su questo dispositivo</small></span></button>
                <button type="button" class="scelta" data-az="esporta">${Griglia.icona('scarica')}<span><strong>Scarica file (.json)</strong><small>Con foto e registrazioni: da importare su un altro dispositivo</small></span></button>
                <button type="button" class="scelta" data-az="elimina" style="border-color:var(--errore);color:var(--errore)">${Griglia.icona('elimina')}<span><strong>Elimina</strong></span></button>
            </div>`, { piccola: true });
        box.querySelectorAll('[data-az]').forEach(b => b.addEventListener('click', async () => {
            const az = b.dataset.az;
            try {
                if (az === 'attivo') {
                    await Griglia.Archivio.locale.impostaAttivo(id);
                    U().toast(`«${c.nome}» è ora in uso`, 'ok');
                } else if (az === 'rinomina') {
                    const nome = await U().chiediTesto('Nuovo nome', c.nome, { ok: 'Rinomina' });
                    if (!nome) return;
                    await Griglia.Archivio.locale.rinomina(id, nome);
                    U().toast('Rinominato', 'ok');
                } else if (az === 'duplica') {
                    U().chiudiModale();
                    await Griglia.Archivio.locale.duplica(id);
                    U().toast('Copia creata', 'ok');
                } else if (az === 'esporta') {
                    const dati = await Griglia.Archivio.locale.carica(id);
                    await Griglia.Importa.esportaJson(M().normalizza(dati.documento));
                    U().chiudiModale();
                    return;
                } else if (az === 'elimina') {
                    const ok = await U().conferma('Eliminare il comunicatore?', `«${c.nome}» verrà cancellato da questo dispositivo, con le sue foto e registrazioni.${c.attivo ? ' Era quello in uso: l\'Area Utente aprirà il più recente rimasto.' : ''}`, { ok: 'Elimina', pericolo: true });
                    if (!ok) return;
                    await Griglia.Archivio.locale.elimina(id);
                    U().toast('Eliminato', 'ok');
                }
                U().chiudiModale();
                await caricaLista();
            } catch (e) { U().toast(e.message, 'errore', 5000); }
        }));
    }

    // ---------- Nuovo comunicatore ----------
    async function apriNuovo() {
        if (!S.modelli) { try { S.modelli = await Griglia.Archivio.modelli.indice(); } catch (e) { S.modelli = []; } }
        const box = U().apriModale(`
            <h2 class="modale-titolo">Nuovo comunicatore</h2>
            <div class="schede" role="tablist">
                <button type="button" class="scheda" role="tab" aria-selected="true" data-s="modello">${Griglia.icona('stella')}<span>Da un modello</span></button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-s="vuoto">${Griglia.icona('griglia')}<span>Vuoto</span></button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-s="parole">${Griglia.icona('modifica')}<span>Da parole</span></button>
                <button type="button" class="scheda" role="tab" aria-selected="false" data-s="file">${Griglia.icona('importa')}<span>Da un file</span></button>
            </div>
            <section data-sez="modello">
                ${S.modelli.length ? `<div class="lista-modelli">${S.modelli.map(m => `
                    <button type="button" class="modello" data-file="${esc(m.file)}">
                        ${anteprimaHtml(null, m.colonne || 4, m.righe || 3)}
                        <h4>${esc(m.nome)}</h4>
                        <small>${esc(m.descrizione)}</small>
                        <small>${m.pagine} pagine · ${m.celle} celle</small>
                    </button>`).join('')}</div>` : '<p class="nota">Nessun modello disponibile.</p>'}
            </section>
            <section data-sez="vuoto" hidden>
                <div class="campo-gruppo"><label class="etichetta-campo" for="nvNome">Nome</label><input type="text" class="campo" id="nvNome" maxlength="200" value="Nuovo comunicatore"></div>
                <div class="campo-riga">
                    <label>Righe <select class="campo campo-compatto" id="nvRighe">${[1,2,3,4,5,6].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                    <label>Colonne <select class="campo campo-compatto" id="nvColonne">${[1,2,3,4,5,6,7,8].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                </div>
                <div class="modale-azioni"><button type="button" class="btn btn-primario" id="nvCrea">Crea e modifica</button></div>
            </section>
            <section data-sez="parole" hidden>
                <p class="nota">Hai fatto lo schizzo su carta? Scrivi qui le parole delle celle: l'app crea la pagina con pittogrammi e colori.</p>
                ${Griglia.Veloce.htmlModulo({ prefisso: 'pv', nome: 'Nuovo comunicatore', colonne: 4 })}
                <div class="modale-azioni"><button type="button" class="btn btn-primario" id="pvCrea">${Griglia.icona('griglia')} Crea e modifica</button></div>
            </section>
            <section data-sez="file" hidden>
                <p class="nota">Formati: Griglia (.json), Asterics AAC (.grd), Open Board Format (.obf, .obz). Le immagini e gli audio incorporati vengono salvati sul dispositivo.</p>
                <label class="carica-file">${Griglia.icona('importa')}<span>Scegli il file</span><input type="file" id="nvFile" accept=".json,.grd,.obf,.obz" hidden></label>
            </section>`);

        box.querySelectorAll('[role="tab"]').forEach(t => t.addEventListener('click', () => {
            box.querySelectorAll('[role="tab"]').forEach(x => x.setAttribute('aria-selected', x === t ? 'true' : 'false'));
            box.querySelectorAll('[data-sez]').forEach(s => s.hidden = s.dataset.sez !== t.dataset.s);
        }));
        box.querySelectorAll('.modello').forEach(b => b.addEventListener('click', async () => {
            b.disabled = true;
            try { const doc = await Griglia.Archivio.modelli.carica(b.dataset.file); await creaEApri(doc.nome, doc); }
            catch (e) { U().toast(e.message, 'errore', 5000); b.disabled = false; }
        }));
        box.querySelector('#nvCrea').addEventListener('click', async () => {
            const nome = box.querySelector('#nvNome').value.trim() || 'Nuovo comunicatore';
            const doc = M().nuovoDocumento({ nome, righe: parseInt(box.querySelector('#nvRighe').value, 10), colonne: parseInt(box.querySelector('#nvColonne').value, 10) });
            await creaEApri(nome, doc);
        });
        box.querySelector('#pvCrea').addEventListener('click', async () => {
            const b = box.querySelector('#pvCrea');
            const nome = box.querySelector('#pvNome').value.trim() || 'Nuovo comunicatore';
            const testo = box.querySelector('#pvTesto').value;
            if (!Griglia.Veloce.analizza(testo).length) { U().toast('Scrivi almeno una parola', 'errore'); box.querySelector('#pvTesto').focus(); return; }
            b.disabled = true;
            try {
                const { documento, stat } = await Griglia.Veloce.nuovoDocumento({
                    nome, testo, colonne: parseInt(box.querySelector('#pvColonne').value, 10),
                    avanzamento: (f, t) => { b.textContent = `Cerco i pittogrammi… ${f}/${t}`; }
                });
                U().toast(Griglia.Veloce.messaggioEsito(stat), 'ok', 5000);
                await creaEApri(nome, documento);
            } catch (e) {
                U().toast(e.message, 'errore', 6000);
                b.disabled = false;
                b.innerHTML = `${Griglia.icona('griglia')} Crea e modifica`;
            }
        });
        box.querySelector('#nvFile').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            const etichetta = box.querySelector('[data-sez="file"] .carica-file span');
            etichetta.textContent = 'Lettura del file…';
            try {
                const ris = await Griglia.Importa.daFile(file);
                const n = M().conta(ris.documento);
                const ok = await U().conferma('Creare il comunicatore?', `«${ris.documento.nome}»: ${n.pagine} pagine e ${n.celle} celle.${ris.avvisi.length ? `\n\nNote: ${ris.avvisi.join('; ')}.` : ''}`, { ok: 'Crea' });
                if (!ok) { apriNuovo(); return; }
                U().toast('Salvataggio di immagini e audio incorporati…', 'info', 2500);
                await Griglia.Importa.caricaMediaIncorporati(ris.documento);
                await creaEApri(ris.documento.nome, ris.documento);
            } catch (err) { U().toast(err.message, 'errore', 6000); etichetta.textContent = 'Scegli il file'; }
        });
    }

    async function creaEApri(nome, doc) {
        try {
            const r = await Griglia.Archivio.locale.crea(nome, doc);
            U().chiudiModale();
            location.href = `app.html?id=${r.id_comunicatore}&modifica=1`;
        } catch (e) { U().toast('Creazione non riuscita: ' + e.message, 'errore', 6000); }
    }
})();
