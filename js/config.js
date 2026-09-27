/**
 * Griglia - Configurazione e utilità comuni
 * AssistiveTech.it - Training Cognitivo / Strumenti (versione autonoma per Azure Static Web Apps)
 */
window.Griglia = window.Griglia || {};

Griglia.VERSIONE = '2.1.0';
Griglia.APP_NAME = 'grid';
// Chiave YouTube Data API v3 (la stessa dello strumento Agenda). Serve solo alla ricerca nell'Area Educatore:
// se la chiave ha restrizioni sui referrer, va aggiunto il dominio di Azure nella Google Cloud Console.
Griglia.YOUTUBE_API_KEY = 'AIzaSyAKrM5EtCxmo_7_kSSN1rpalvb9QfDIan8';

Griglia.util = {
    uid(prefisso) {
        return `${prefisso}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    },
    escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    clamp(v, min, max) { return Math.min(max, Math.max(min, v)); },
    debounce(fn, ms) {
        let t;
        const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
        d.annulla = () => clearTimeout(t);
        d.subito = (...args) => { clearTimeout(t); fn(...args); };
        return d;
    },
    attesa(ms) { return new Promise(r => setTimeout(r, ms)); },
    /** fetch JSON con controllo di success; lancia Error con message leggibile */
    async fetchJson(url, opzioni = {}) {
        const risposta = await fetch(url, opzioni);
        let json = null;
        try { json = await risposta.json(); } catch (e) { /* corpo non JSON */ }
        if (!json) throw new Error(`Risposta non valida dal server (${risposta.status})`);
        if (!json.success) {
            const err = new Error(json.message || 'Operazione non riuscita');
            err.dati = json.data;
            err.status = risposta.status;
            throw err;
        }
        return json;
    },
    dataOra() {
        const d = new Date(), p = n => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },
    /** Notifica leggera in basso */
    toast(messaggio, tipo = 'info', durata = 3200) {
        let cont = document.getElementById('toast');
        if (!cont) {
            cont = document.createElement('div');
            cont.id = 'toast';
            cont.className = 'toast-contenitore';
            document.body.appendChild(cont);
        }
        const el = document.createElement('div');
        el.className = `toast toast-${tipo}`;
        el.setAttribute('role', 'status');
        el.textContent = messaggio;
        cont.appendChild(el);
        requestAnimationFrame(() => el.classList.add('visibile'));
        setTimeout(() => {
            el.classList.remove('visibile');
            setTimeout(() => el.remove(), 300);
        }, durata);
    },
    /** Finestra di conferma non bloccante (Promise<boolean>) */
    conferma(titolo, testo, { ok = 'Conferma', annulla = 'Annulla', pericolo = false } = {}) {
        return new Promise(risolvi => {
            const m = Griglia.util.apriModale(`
                <h2 class="modale-titolo">${Griglia.util.escapeHtml(titolo)}</h2>
                <p class="modale-testo">${Griglia.util.escapeHtml(testo)}</p>
                <div class="modale-azioni">
                    <button type="button" class="btn btn-secondario" data-ris="0">${Griglia.util.escapeHtml(annulla)}</button>
                    <button type="button" class="btn ${pericolo ? 'btn-pericolo' : 'btn-primario'}" data-ris="1">${Griglia.util.escapeHtml(ok)}</button>
                </div>`, { piccola: true });
            // Prima si risolve, poi si chiude: la chiusura emette 'griglia:chiusa' che risolverebbe con false
            m.querySelectorAll('[data-ris]').forEach(b => b.addEventListener('click', () => {
                risolvi(b.dataset.ris === '1');
                Griglia.util.chiudiModale();
            }));
            m.addEventListener('griglia:chiusa', () => risolvi(false), { once: true });
        });
    },
    /** Finestra con un campo di testo (Promise<string|null>) */
    chiediTesto(titolo, valore = '', { ok = 'Salva', segnaposto = '' } = {}) {
        return new Promise(risolvi => {
            const m = Griglia.util.apriModale(`
                <h2 class="modale-titolo">${Griglia.util.escapeHtml(titolo)}</h2>
                <input type="text" class="campo" id="campoChiediTesto" maxlength="200" value="${Griglia.util.escapeHtml(valore)}" placeholder="${Griglia.util.escapeHtml(segnaposto)}">
                <div class="modale-azioni">
                    <button type="button" class="btn btn-secondario" data-ris="0">Annulla</button>
                    <button type="button" class="btn btn-primario" data-ris="1">${Griglia.util.escapeHtml(ok)}</button>
                </div>`, { piccola: true });
            const campo = m.querySelector('#campoChiediTesto');
            setTimeout(() => { campo.focus(); campo.select(); }, 50);
            const fine = (ok) => { const v = campo.value.trim(); risolvi(ok && v ? v : null); Griglia.util.chiudiModale(); };
            m.querySelectorAll('[data-ris]').forEach(b => b.addEventListener('click', () => fine(b.dataset.ris === '1')));
            campo.addEventListener('keydown', e => { if (e.key === 'Enter') fine(true); });
            m.addEventListener('griglia:chiusa', () => risolvi(null), { once: true });
        });
    },
    /** Modale generica: restituisce l'elemento contenuto */
    apriModale(html, { piccola = false, larga = false, chiudibile = true } = {}) {
        Griglia.util.chiudiModale();
        const sfondo = document.createElement('div');
        sfondo.className = 'modale-sfondo';
        sfondo.id = 'modaleAttiva';
        const box = document.createElement('div');
        box.className = 'modale' + (piccola ? ' modale-piccola' : '') + (larga ? ' modale-larga' : '');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.innerHTML = (chiudibile ? `<button type="button" class="modale-chiudi btn-icona" aria-label="Chiudi">${Griglia.icona('chiudi')}</button>` : '') + html;
        sfondo.appendChild(box);
        document.body.appendChild(sfondo);
        document.body.classList.add('con-modale');
        if (chiudibile) {
            box.querySelector('.modale-chiudi').addEventListener('click', () => Griglia.util.chiudiModale());
            sfondo.addEventListener('pointerdown', e => { if (e.target === sfondo) Griglia.util.chiudiModale(); });
        }
        requestAnimationFrame(() => sfondo.classList.add('visibile'));
        return box;
    },
    chiudiModale() {
        const s = document.getElementById('modaleAttiva');
        if (!s) return;
        const box = s.querySelector('.modale');
        if (box) box.dispatchEvent(new CustomEvent('griglia:chiusa'));
        s.remove();
        document.body.classList.remove('con-modale');
    },
    modaleAperta() { return !!document.getElementById('modaleAttiva'); }
};

/** Registrazione del service worker per la PWA */
Griglia.registraServiceWorker = function () {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('[Griglia] Service worker non registrato:', err));
    });
};
