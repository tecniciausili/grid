/**
 * Griglia - Sintesi vocale con Web Speech API (voci del dispositivo, nessun servizio esterno)
 */
window.Griglia = window.Griglia || {};

Griglia.Voce = (function () {
    const CHIAVE_PREF = 'grid_voce_preferita';
    let voci = [];
    let pronta = null;
    let corrente = null;

    function disponibile() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }

    /** Le voci vengono caricate in modo asincrono da alcuni browser (Chrome) */
    function init() {
        if (pronta) return pronta;
        pronta = new Promise(risolvi => {
            if (!disponibile()) { risolvi([]); return; }
            const carica = () => {
                voci = speechSynthesis.getVoices();
                if (voci.length) { risolvi(voci); return true; }
                return false;
            };
            if (carica()) return;
            speechSynthesis.addEventListener('voiceschanged', () => { if (carica()) return; }, { once: false });
            // Alcuni browser non emettono l'evento: ritenta per qualche secondo
            let tentativi = 0;
            const t = setInterval(() => { if (carica() || ++tentativi > 20) { clearInterval(t); risolvi(voci); } }, 250);
        });
        return pronta;
    }

    function vociItaliane() {
        const it = voci.filter(v => (v.lang || '').toLowerCase().startsWith('it'));
        return it.length ? it : voci;
    }

    function vocePreferitaId() { try { return localStorage.getItem(CHIAVE_PREF) || ''; } catch (e) { return ''; } }
    function setVocePreferita(id) { try { id ? localStorage.setItem(CHIAVE_PREF, id) : localStorage.removeItem(CHIAVE_PREF); } catch (e) { /* ignora */ } }

    function voceScelta() {
        const id = vocePreferitaId();
        const it = vociItaliane();
        return it.find(v => v.voiceURI === id || v.name === id) ||
            it.find(v => /it-IT/i.test(v.lang) && /google|alice|federica|luca|elsa|isabela|natural|premium|enhanced/i.test(v.name)) ||
            it.find(v => /it-IT/i.test(v.lang)) || it[0] || null;
    }

    function stop() {
        if (!disponibile()) return;
        try { speechSynthesis.cancel(); } catch (e) { /* ignora */ }
        corrente = null;
    }

    /**
     * Pronuncia un testo. Restituisce una Promise risolta a fine lettura.
     * @param {string} testo
     * @param {{velocita?:number, tono?:number, interrompi?:boolean}} opzioni
     */
    function parla(testo, opzioni = {}) {
        testo = String(testo || '').trim();
        if (!testo) return Promise.resolve(false);
        if (!disponibile()) { console.warn('[Griglia] Sintesi vocale non disponibile'); return Promise.resolve(false); }
        const { velocita = 1, tono = 1, interrompi = true } = opzioni;
        if (interrompi) stop();
        return init().then(() => new Promise(risolvi => {
            const u = new SpeechSynthesisUtterance(testo);
            const v = voceScelta();
            if (v) u.voice = v;
            u.lang = (v && v.lang) || 'it-IT';
            u.rate = Griglia.util.clamp(velocita, 0.5, 2);
            u.pitch = Griglia.util.clamp(tono, 0.5, 2);
            u.onend = () => { if (corrente === u) corrente = null; risolvi(true); };
            u.onerror = (e) => { if (corrente === u) corrente = null; if (e.error !== 'interrupted' && e.error !== 'canceled') console.warn('[Griglia] Errore voce:', e.error); risolvi(false); };
            corrente = u;
            // Safari/iOS a volte restano in pausa dopo un cancel()
            try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) { /* ignora */ }
            speechSynthesis.speak(u);
        }));
    }

    function staParlando() { return disponibile() && speechSynthesis.speaking; }

    return { disponibile, init, vociItaliane, vocePreferitaId, setVocePreferita, voceScelta, parla, stop, staParlando };
})();
