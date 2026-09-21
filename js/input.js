/**
 * Griglia - Metodi di input: tocco, permanenza (dwell), scansione a righe e colonne
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * Tutti gli elementi selezionabili hanno l'attributo data-sel. Il gestore non sa
 * cosa fanno: chiama onSeleziona(elemento) e l'app decide.
 * La scansione calcola le righe dalla posizione reale sullo schermo, quindi
 * funziona anche con celle di misura diversa e con la barra della frase.
 */
window.Griglia = window.Griglia || {};

Griglia.Input = class {
    constructor({ radice, onSeleziona, onFeedback }) {
        this.radice = radice;
        this.onSeleziona = onSeleziona;
        this.onFeedback = onFeedback || (() => {});
        this.config = { metodo: 'tocco', tempoDwell: 1200, tempoScansione: 1500, tastoSelezione: 'qualsiasi' };
        this.attivo = false;
        this.sospeso = false;
        this._dwell = { el: null, timer: null, ultimo: null };
        this._scan = { gruppi: [], fase: 0, iGruppo: 0, iEl: 0, timer: null, giri: 0 };
        this._bind();
    }

    _bind() {
        this._suClick = (e) => {
            if (this.sospeso || this.config.metodo === 'scansione') return;
            const el = e.target.closest('[data-sel]');
            if (!el || el.disabled || !this.radice.contains(el)) return;
            if (this.config.metodo === 'dwell' && this._dwell.ultimo === el && Date.now() - (this._dwell.quando || 0) < 400) return;
            this.onSeleziona(el, 'tocco');
        };
        this._suPointerOver = (e) => {
            if (this.sospeso || this.config.metodo !== 'dwell') return;
            const el = e.target.closest('[data-sel]');
            if (!el || el.disabled || el === this._dwell.el) return;
            this._dwellInizia(el);
        };
        this._suPointerOut = (e) => {
            if (this.config.metodo !== 'dwell' || !this._dwell.el) return;
            const el = e.target.closest('[data-sel]');
            if (el !== this._dwell.el) return;
            if (e.relatedTarget && el.contains(e.relatedTarget)) return;
            this._dwellAnnulla();
        };
        this._suPointerDownScan = (e) => {
            if (this.sospeso || this.config.metodo !== 'scansione') return;
            if (e.target.closest('.non-scansione')) return;
            e.preventDefault();
            this._scanInterruttore();
        };
        this._suTasto = (e) => {
            if (this.sospeso || this.config.metodo !== 'scansione') return;
            if (Griglia.util.modaleAperta() || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
            const t = this.config.tastoSelezione;
            const ok = (t === 'qualsiasi' && (e.key === ' ' || e.key === 'Enter')) || (t === 'spazio' && e.key === ' ') || (t === 'invio' && e.key === 'Enter');
            if (!ok) return;
            e.preventDefault();
            if (e.repeat) return;
            this._scanInterruttore();
        };
        this._suResize = Griglia.util.debounce(() => { if (this.config.metodo === 'scansione') this.aggiorna(); }, 200);
    }

    imposta(config) {
        const prima = this.config.metodo;
        this.config = Object.assign({}, this.config, config || {});
        if (this.attivo && prima !== this.config.metodo) { this.ferma(); this.avvia(); }
        else if (this.attivo && this.config.metodo === 'scansione') this.aggiorna();
    }

    avvia() {
        if (this.attivo) return;
        this.attivo = true;
        this.radice.addEventListener('click', this._suClick);
        this.radice.addEventListener('pointerover', this._suPointerOver);
        this.radice.addEventListener('pointerout', this._suPointerOut);
        this.radice.addEventListener('pointerdown', this._suPointerDownScan);
        document.addEventListener('keydown', this._suTasto);
        window.addEventListener('resize', this._suResize);
        this.radice.classList.toggle('input-scansione', this.config.metodo === 'scansione');
        this.radice.classList.toggle('input-dwell', this.config.metodo === 'dwell');
        if (this.config.metodo === 'scansione') this.aggiorna();
    }

    ferma() {
        if (!this.attivo) return;
        this.attivo = false;
        this.radice.removeEventListener('click', this._suClick);
        this.radice.removeEventListener('pointerover', this._suPointerOver);
        this.radice.removeEventListener('pointerout', this._suPointerOut);
        this.radice.removeEventListener('pointerdown', this._suPointerDownScan);
        document.removeEventListener('keydown', this._suTasto);
        window.removeEventListener('resize', this._suResize);
        this._dwellAnnulla();
        this._scanFerma();
        this.radice.classList.remove('input-scansione', 'input-dwell');
    }

    /** Sospende temporaneamente (finestre aperte, modalità modifica) */
    sospendi(valore) {
        this.sospeso = !!valore;
        if (this.sospeso) { this._dwellAnnulla(); this._scanFerma(); }
        else if (this.attivo && this.config.metodo === 'scansione') this.aggiorna();
    }

    /** Da chiamare dopo ogni nuovo rendering degli elementi selezionabili */
    aggiorna() {
        this._dwellAnnulla();
        if (this.config.metodo === 'scansione' && this.attivo && !this.sospeso) this._scanRiparti();
    }

    // ---------- Permanenza (dwell) ----------
    _dwellInizia(el) {
        this._dwellAnnulla();
        this._dwell.el = el;
        el.style.setProperty('--dwell-ms', `${this.config.tempoDwell}ms`);
        el.classList.add('dwell-attivo');
        this._dwell.timer = setTimeout(() => {
            el.classList.remove('dwell-attivo');
            this._dwell.el = null;
            this._dwell.ultimo = el;
            this._dwell.quando = Date.now();
            this.onSeleziona(el, 'dwell');
        }, this.config.tempoDwell);
    }
    _dwellAnnulla() {
        if (this._dwell.timer) clearTimeout(this._dwell.timer);
        if (this._dwell.el) this._dwell.el.classList.remove('dwell-attivo');
        this._dwell.timer = null;
        this._dwell.el = null;
    }

    // ---------- Scansione ----------
    _elementi() {
        return [...this.radice.querySelectorAll('[data-sel]')].filter(el => {
            if (el.disabled || el.hidden) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
    }
    _calcolaGruppi() {
        const el = this._elementi().map(e => ({ e, r: e.getBoundingClientRect() }));
        el.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
        const gruppi = [];
        for (const x of el) {
            const g = gruppi[gruppi.length - 1];
            const centro = x.r.top + x.r.height / 2;
            if (g && centro >= g.top && centro <= g.bottom) g.el.push(x.e);
            else gruppi.push({ top: x.r.top, bottom: x.r.bottom, el: [x.e] });
        }
        gruppi.forEach(g => g.el.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left));
        return gruppi.map(g => g.el);
    }
    _pulisciScan() {
        this.radice.querySelectorAll('.scan-gruppo, .scan-elemento').forEach(e => e.classList.remove('scan-gruppo', 'scan-elemento'));
    }
    _scanFerma() {
        if (this._scan.timer) clearInterval(this._scan.timer);
        this._scan.timer = null;
        this._pulisciScan();
    }
    _scanRiparti() {
        this._scanFerma();
        this._scan.gruppi = this._calcolaGruppi();
        this._scan.fase = 0; this._scan.iGruppo = 0; this._scan.iEl = 0; this._scan.giri = 0;
        if (!this._scan.gruppi.length) return;
        this._scanMostra();
        this._scan.timer = setInterval(() => this._scanAvanza(), this.config.tempoScansione);
    }
    _scanMostra() {
        this._pulisciScan();
        const g = this._scan.gruppi[this._scan.iGruppo];
        if (!g) return;
        if (this._scan.fase === 0) g.forEach(e => e.classList.add('scan-gruppo'));
        else { const el = g[this._scan.iEl]; if (el) { el.classList.add('scan-elemento'); this.onFeedback(el); } }
    }
    _scanAvanza() {
        const s = this._scan;
        if (s.fase === 0) {
            s.iGruppo = (s.iGruppo + 1) % s.gruppi.length;
        } else {
            const g = s.gruppi[s.iGruppo];
            s.iEl++;
            if (s.iEl >= g.length) {
                s.iEl = 0;
                if (++s.giri >= 2) { s.fase = 0; s.giri = 0; }   // dopo due giri torna alle righe
            }
        }
        this._scanMostra();
    }
    _scanInterruttore() {
        const s = this._scan;
        if (!s.gruppi.length) { this._scanRiparti(); return; }
        const g = s.gruppi[s.iGruppo];
        if (s.fase === 0) {
            if (g.length === 1) { this._scanSeleziona(g[0]); return; }
            s.fase = 1; s.iEl = 0; s.giri = 0;
            this._scanMostra();
            clearInterval(s.timer);
            s.timer = setInterval(() => this._scanAvanza(), this.config.tempoScansione);
        } else {
            this._scanSeleziona(g[s.iEl]);
        }
    }
    _scanSeleziona(el) {
        this._scanFerma();
        if (el) this.onSeleziona(el, 'scansione');
        // Dopo la selezione l'app richiama aggiorna(); se non lo fa, ripartiamo comunque
        setTimeout(() => { if (this.attivo && !this.sospeso && this.config.metodo === 'scansione' && !this._scan.timer) this._scanRiparti(); }, 350);
    }
};
