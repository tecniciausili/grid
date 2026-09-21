/**
 * Griglia - Ricerca pittogrammi ARASAAC (api.arasaac.org)
 * Pittogrammi con licenza CC BY-NC-SA: autore Sergio Palao, proprietà Governo di Aragona (Spagna).
 * Le immagini vengono usate per URL (nessun download): il service worker le tiene in cache.
 */
window.Griglia = window.Griglia || {};

Griglia.Arasaac = (function () {
    const API = 'https://api.arasaac.org/api';
    const STATICO = 'https://static.arasaac.org/pictograms';
    const cache = new Map();
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

    function url(id, dimensione = 300) {
        const d = [300, 500, 2500].includes(dimensione) ? dimensione : 300;
        return `${STATICO}/${id}/${id}_${d}.png`;
    }

    /**
     * Cerca pittogrammi in italiano. Le corrispondenze esatte sulla parola vengono prima.
     * @returns {Promise<Array<{id:number, parole:string[], url:string, urlGrande:string, categorie:string[], tipi:number[]}>>}
     * tipi: 1 pronome, 2 nome, 3 verbo, 4 aggettivo/avverbio, 5 espressione, 6 preposizione (classificazione ARASAAC)
     */
    async function cerca(query, limite = 48) {
        query = String(query || '').trim();
        if (query.length < 2) return [];
        const chiave = norm(query);
        if (cache.has(chiave)) return cache.get(chiave).slice(0, limite);

        const risposta = await fetch(`${API}/pictograms/it/search/${encodeURIComponent(query)}`);
        if (risposta.status === 404) { cache.set(chiave, []); return []; }
        if (!risposta.ok) throw new Error(`ARASAAC non risponde (${risposta.status})`);
        const dati = await risposta.json();
        if (!Array.isArray(dati)) return [];

        const risultati = dati.map(d => {
            const id = parseInt(d._id, 10);
            if (!id) return null;
            const parole = (d.keywords || []).map(k => k.keyword).filter(Boolean);
            const esatto = parole.some(p => norm(p) === chiave);
            const inizia = !esatto && parole.some(p => norm(p).startsWith(chiave));
            const categorie = Array.isArray(d.categories) ? d.categories.map(String) : [];
            const tipi = (d.keywords || []).map(k => parseInt(k.type, 10)).filter(t => t > 0);
            return { id, parole, url: url(id, 300), urlGrande: url(id, 500), esatto, inizia, aac: !!d.aac, categorie, tipi };
        }).filter(Boolean);

        risultati.sort((a, b) => (b.esatto - a.esatto) || (b.inizia - a.inizia) || (b.aac - a.aac) || (a.id - b.id));
        if (cache.size > 80) cache.delete(cache.keys().next().value);
        cache.set(chiave, risultati);
        return risultati.slice(0, limite);
    }

    return { url, cerca, ATTRIBUZIONE: 'Pittogrammi ARASAAC (arasaac.org), autore Sergio Palao, Governo di Aragona, licenza CC BY-NC-SA' };
})();
