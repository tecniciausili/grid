/**
 * Griglia - Pagina veloce: dalle parole scritte alle celle con pittogramma e colore
 * AssistiveTech.it - Training Cognitivo / Strumenti
 *
 * L'educatore guarda il suo schizzo su carta e scrive le parole, una per riga.
 * L'app crea le celle nell'ordine scritto, cerca ogni parola su ARASAAC (primo pittogramma)
 * e assegna il colore Fitzgerald dal tipo di parola. Nessun servizio esterno oltre ARASAAC.
 *
 * Regole del testo:
 *   una parola per riga, oppure più parole sulla stessa riga separate da virgola
 *   parola -> a, b, c     la cella apre una nuova pagina con le celle a, b, c (anche vuota: «parola ->»)
 *   parola = frase        la cella dice una frase diversa da quella scritta
 */
window.Griglia = window.Griglia || {};

Griglia.Veloce = (function () {
    const M = () => Griglia.Modello;
    const esc = (s) => Griglia.util.escapeHtml(s);
    const MAX_RIGHE = 12, MAX_COLONNE = 8;
    const rxFreccia = /\s*(?:->|→|=>)\s*/;

    function analizzaVoce(testo) {
        const parti = String(testo || '').split('=');
        const etichetta = parti[0].trim().replace(/\s+/g, ' ').slice(0, 120);
        if (!etichetta) return null;
        const dice = parti.length > 1 ? parti.slice(1).join('=').trim().slice(0, 300) : '';
        return { etichetta, dice: dice || null, sottoPagina: null, pitto: null };
    }

    /** Testo scritto → voci [{ etichetta, dice, sottoPagina: [voci] | null }] */
    function analizza(testo) {
        const voci = [];
        String(testo || '').split(/\r?\n/).forEach(riga => {
            riga = riga.trim();
            if (!riga) return;
            const pezzi = riga.split(rxFreccia);
            if (pezzi.length > 1) {
                const v = analizzaVoce(pezzi[0]);
                if (!v) return;
                v.sottoPagina = pezzi.slice(1).join(' ').split(',').map(analizzaVoce).filter(Boolean);
                voci.push(v);
            } else {
                riga.split(',').map(analizzaVoce).filter(Boolean).forEach(v => voci.push(v));
            }
        });
        return voci;
    }

    /** Colore Fitzgerald dal tipo di parola e dalle categorie ARASAAC del pittogramma */
    function categoriaDa(r) {
        const cat = (r.categorie || []).join(' ').toLowerCase();
        const tipi = r.tipi || [];
        if (/interrogative/.test(cat)) return 'domanda';
        if (/denial|negation|affirmation/.test(cat)) return 'negazione';
        if (/pronoun/.test(cat)) return 'pronome';
        if (/\bverb/.test(cat)) return 'verbo';
        if (/expression|greeting|courtesy|polite/.test(cat)) return 'sociale';
        if (/preposition|conjunction|article|determiner/.test(cat)) return 'preposizione';
        if (/adjective|adverb|color|colour|feeling|size|quantity/.test(cat)) return 'descrittore';
        const t = tipi[0];
        if (t === 2) return 'nome';
        if (t === 3) return 'verbo';
        if (t === 4) return 'descrittore';
        if (t === 5) return 'sociale';
        if (t === 1) return 'pronome';
        if (t === 6) return 'preposizione';
        return 'varie';
    }

    const cachePitto = new Map();

    /** Primo pittogramma ARASAAC per una parola (null se non c'è o senza rete) */
    async function trovaPittogramma(parola) {
        const chiave = parola.toLowerCase();
        if (cachePitto.has(chiave)) return cachePitto.get(chiave);
        let esito = null;
        const tenta = async (q) => {
            try {
                const ris = await Griglia.Arasaac.cerca(q, 3);
                return ris.length ? { id: ris[0].id, categoria: categoriaDa(ris[0]) } : null;
            } catch (e) { return null; }
        };
        esito = await tenta(parola);
        if (!esito && parola.includes(' ')) {
            // «andare a scuola» → prova con la parola più lunga
            const lunga = parola.split(' ').filter(p => p.length >= 3).sort((a, b) => b.length - a.length)[0];
            if (lunga) esito = await tenta(lunga);
        }
        cachePitto.set(chiave, esito);
        return esito;
    }

    /** Cerca i pittogrammi di tutte le voci (sottopagine comprese), cinque ricerche alla volta */
    async function cercaPittogrammi(voci, avanzamento) {
        const tutte = [];
        voci.forEach(v => { tutte.push(v); (v.sottoPagina || []).forEach(s => tutte.push(s)); });
        let fatte = 0;
        const coda = tutte.slice();
        const lavoratore = async () => {
            while (coda.length) {
                const v = coda.shift();
                v.pitto = await trovaPittogramma(v.etichetta);
                fatte++;
                if (avanzamento) avanzamento(fatte, tutte.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(5, tutte.length) }, lavoratore));
        return tutte.length;
    }

    function postiLiberi(pag) {
        const liberi = [];
        for (let y = 0; y < pag.righe; y++) for (let x = 0; x < pag.colonne; x++) if (!M().cellaIn(pag, x, y)) liberi.push({ x, y });
        return liberi;
    }

    /** Colonne consigliate per n celle (pagina nuova) */
    function colonnePer(n, colonne = 4) {
        colonne = Math.max(1, Math.min(MAX_COLONNE, colonne));
        while (n > MAX_RIGHE * colonne && colonne < MAX_COLONNE) colonne++;
        return colonne;
    }

    /**
     * Mette le voci nella pagina (posti liberi in ordine di lettura, aggiungendo righe se servono)
     * e crea le sottopagine. Le voci devono avere già i pittogrammi (cercaPittogrammi).
     * @returns {{ celle: number, conPittogramma: number, pagineNuove: number }}
     */
    function riempi(doc, pag, voci, stat = { celle: 0, conPittogramma: 0, pagineNuove: 0 }) {
        let liberi = postiLiberi(pag);
        while (liberi.length < voci.length && pag.righe < MAX_RIGHE) { pag.righe++; liberi = postiLiberi(pag); }
        while (liberi.length < voci.length && pag.colonne < MAX_COLONNE) { pag.colonne++; liberi = postiLiberi(pag); }
        if (liberi.length < voci.length) {
            throw new Error(`Nella pagina «${pag.nome}» c'è posto per ${liberi.length} parole, non ${voci.length}: dividile su più pagine`);
        }
        voci.forEach((v, i) => {
            const { x, y } = liberi[i];
            const c = M().nuovaCella(x, y, { etichetta: v.etichetta, dice: v.dice, categoria: v.pitto ? v.pitto.categoria : 'nessuna' });
            if (v.pitto) { c.immagine = { tipo: 'arasaac', id: v.pitto.id }; stat.conPittogramma++; }
            if (v.sottoPagina) {
                let sotto = doc.pagine.find(p => p.nome.toLowerCase() === v.etichetta.toLowerCase());
                if (!sotto) {
                    sotto = M().nuovaPagina(v.etichetta.slice(0, 100), 1, colonnePer(v.sottoPagina.length, pag.colonne));
                    doc.pagine.push(sotto);
                    stat.pagineNuove++;
                }
                c.vaiA = sotto.id;
                if (v.sottoPagina.length) riempi(doc, sotto, v.sottoPagina, stat);
            }
            pag.celle.push(c);
            stat.celle++;
        });
        return stat;
    }

    /** Nuovo comunicatore dalle parole: cerca i pittogrammi e costruisce il documento */
    async function nuovoDocumento({ nome, testo, colonne = 4, avanzamento = null }) {
        const voci = analizza(testo);
        if (!voci.length) throw new Error('Scrivi almeno una parola');
        await cercaPittogrammi(voci, avanzamento);
        const col = colonnePer(voci.length, colonne);
        const doc = M().nuovoDocumento({ nome: nome || 'Nuovo comunicatore', righe: Math.max(1, Math.min(MAX_RIGHE, Math.ceil(voci.length / col))), colonne: col });
        const stat = riempi(doc, doc.pagine[0], voci);
        return { documento: M().normalizza(doc), stat };
    }

    /** Aggiunge le parole a una pagina esistente (editor) */
    async function aggiungiAPagina(doc, pag, testo, avanzamento = null) {
        const voci = analizza(testo);
        if (!voci.length) throw new Error('Scrivi almeno una parola');
        await cercaPittogrammi(voci, avanzamento);
        return riempi(doc, pag, voci);
    }

    /** Campo di testo con la legenda; con nome/colonne per la creazione di un comunicatore */
    function htmlModulo({ prefisso = 'pv', nome = null, colonne = 0 } = {}) {
        return `
            ${nome !== null ? `<div class="campo-gruppo"><label class="etichetta-campo" for="${prefisso}Nome">Nome del comunicatore</label><input type="text" class="campo" id="${prefisso}Nome" maxlength="200" value="${esc(nome)}"></div>` : ''}
            <div class="campo-gruppo">
                <label class="etichetta-campo" for="${prefisso}Testo">Le parole, una per riga: guarda il tuo foglio e scrivile nell'ordine delle celle</label>
                <textarea class="campo campo-area" id="${prefisso}Testo" rows="8" spellcheck="false" placeholder="io&#10;tu&#10;voglio&#10;mangiare -> pane, pasta, frutta&#10;bagno = devo andare in bagno"></textarea>
                <p class="nota nota-piccola veloce-legenda">
                    <strong>parola -> altre parole</strong> la cella apre una nuova pagina con quelle parole (e mette la parola nella frase: «voglio» → «io voglio uscire») ·
                    <strong>parola = frase</strong> la cella dice una frase diversa ·
                    più parole sulla stessa riga separate da virgola. Ogni parola riceve il primo pittogramma ARASAAC e il colore
                    del suo tipo (nome, verbo…): poi si ritocca tutto nell'editor.
                </p>
            </div>
            ${colonne ? `<div class="campo-riga"><label>Colonne <select class="campo campo-compatto" id="${prefisso}Colonne">${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === colonne ? 'selected' : ''}>${n}</option>`).join('')}</select></label><span class="nota nota-piccola">Le righe si calcolano da sole (fino a 12).</span></div>` : ''}`;
    }

    function messaggioEsito(stat) {
        const senza = stat.celle - stat.conPittogramma;
        return `${stat.celle} celle create` + (stat.pagineNuove ? `, ${stat.pagineNuove} pagine nuove` : '') +
            (senza ? `; ${senza} senza pittogramma: tocca la cella per sceglierne uno` : '; controlla i pittogrammi e ritocca');
    }

    return { analizza, categoriaDa, trovaPittogramma, cercaPittogrammi, riempi, nuovoDocumento, aggiungiAPagina, htmlModulo, messaggioEsito, colonnePer };
})();
