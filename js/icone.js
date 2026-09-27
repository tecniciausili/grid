/**
 * Griglia - Icone SVG inline (nessuna dipendenza esterna, funzionano offline)
 * Tratti a 2px su griglia 24x24, colore corrente.
 */
window.Griglia = window.Griglia || {};

(function () {
    const P = (d) => `<path d="${d}"/>`;
    const tracciati = {
        parla:        P('M4 9v6h4l5 4V5L8 9H4z') + P('M16 9a4 4 0 0 1 0 6') + P('M18.5 6.5a7.5 7.5 0 0 1 0 11'),
        muto:         P('M4 9v6h4l5 4V5L8 9H4z') + P('M17 9l4 4M21 9l-4 4'),
        cancellaParola: P('M20 6H9L4 12l5 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z') + P('M12 10l4 4M16 10l-4 4'),
        cancellaTutto: P('M4 7h16') + P('M9 7V4h6v3') + P('M6 7l1 13h10l1-13') + P('M10 11v6M14 11v6'),
        home:         P('M3 11l9-7 9 7') + P('M5 10v10h14V10') + P('M10 20v-6h4v6'),
        indietro:     P('M9 14L4 9l5-5') + P('M4 9h11a5 5 0 0 1 0 10h-3'),
        esci:         P('M15 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9') + P('M10 12h11') + P('M17 8l4 4-4 4'),
        modifica:     P('M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17v3z') + P('M13.5 6.5l3 3'),
        fine:         P('M5 12l5 5 9-10'),
        impostazioni: P('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z') + P('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'),
        chiudi:       P('M6 6l12 12M18 6L6 18'),
        piu:          P('M12 5v14M5 12h14'),
        meno:         P('M5 12h14'),
        cerca:        P('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z') + P('M21 21l-5-5'),
        carica:       P('M12 16V4') + P('M7 9l5-5 5 5') + P('M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'),
        scarica:      P('M12 4v12') + P('M7 11l5 5 5-5') + P('M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'),
        immagine:     P('M3 5h18v14H3z') + P('M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z') + P('M21 15l-5-5-9 9'),
        blocco:       P('M6 11h12v10H6z') + P('M8 11V7a4 4 0 0 1 8 0v4'),
        sblocco:      P('M6 11h12v10H6z') + P('M8 11V7a4 4 0 0 1 7.5-2'),
        schermo:      P('M4 9V4h5') + P('M20 9V4h-5') + P('M4 15v5h5') + P('M20 15v5h-5'),
        annulla:      P('M9 14L4 9l5-5') + P('M4 9h10a6 6 0 0 1 0 12h-2'),
        cartella:     P('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'),
        pagina:       P('M6 3h9l4 4v14H6z') + P('M14 3v5h5'),
        duplica:      P('M8 8h12v12H8z') + P('M16 8V4H4v12h4'),
        elimina:      P('M4 7h16') + P('M9 7V4h6v3') + P('M6 7l1 13h10l1-13'),
        griglia:      P('M4 4h7v7H4z') + P('M13 4h7v7h-7z') + P('M4 13h7v7H4z') + P('M13 13h7v7h-7z'),
        utente:       P('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z') + P('M4 21c0-4 3.6-7 8-7s8 3 8 7'),
        utenti:       P('M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11z') + P('M16.5 11.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z') + P('M2 20c0-3.5 2.7-6 6-6s6 2.5 6 6') + P('M14 20c0-2.6 1.6-4.6 4-5 1.8.4 3.5 2 3.5 4.5'),
        freccia:      P('M5 12h14') + P('M13 6l6 6-6 6'),
        frecciaSx:    P('M19 12H5') + P('M11 6l-6 6 6 6'),
        gioca:        P('M7 5v14l11-7z'),
        pausa:        P('M7 5h4v14H7zM13 5h4v14h-4z'),
        info:         P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z') + P('M12 11v6') + P('M12 7.5v.5'),
        attenzione:   P('M12 3l10 18H2z') + P('M12 10v5') + P('M12 18v.5'),
        occhio:       P('M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z') + P('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'),
        occhioChiuso: P('M3 3l18 18') + P('M10.6 10.6a3 3 0 0 0 4.2 4.2') + P('M6.5 6.7C4 8.3 2 12 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.8-1.1') + P('M9.9 5.1C10.6 5 11.3 5 12 5c6.5 0 10 7 10 7s-.7 1.4-2.1 3'),
        tocco:        P('M8 13V6a2 2 0 1 1 4 0v5') + P('M12 11V9.5a2 2 0 1 1 4 0V12') + P('M16 12a2 2 0 1 1 4 0v3a6 6 0 0 1-6 6h-2a5 5 0 0 1-4-2l-3.5-4.5a1.6 1.6 0 0 1 2.4-2.1L8 13'),
        timer:        P('M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z') + P('M12 9v4l3 2') + P('M9 3h6'),
        scansione:    P('M4 6h16') + P('M4 12h16') + P('M4 18h16') + P('M2 4v16'),
        spunta:       P('M5 12l5 5 9-10'),
        rete:         P('M2 8.5a16 16 0 0 1 20 0') + P('M5.5 12a11 11 0 0 1 13 0') + P('M9 15.5a6 6 0 0 1 6 0') + P('M12 19v.5'),
        senzaRete:    P('M2 8.5a16 16 0 0 1 20 0') + P('M5.5 12a11 11 0 0 1 13 0') + P('M9 15.5a6 6 0 0 1 6 0') + P('M12 19v.5') + P('M4 4l16 16'),
        salva:        P('M5 4h11l3 3v13H5z') + P('M8 4v5h7V4') + P('M8 20v-6h8v6'),
        ok:           P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z') + P('M8 12l3 3 5-6'),
        errore:       P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z') + P('M9 9l6 6M15 9l-6 6'),
        sposta:       P('M12 3v18M3 12h18') + P('M9 6l3-3 3 3M9 18l3 3 3-3M6 9L3 12l3 3M18 9l3 3-3 3'),
        importa:      P('M12 3v12') + P('M7 10l5 5 5-5') + P('M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'),
        stella:       P('M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z'),
        prova:        P('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z') + P('M10 9l5 3-5 3z'),
        microfono:    P('M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z') + P('M19 11a7 7 0 0 1-14 0') + P('M12 18v3') + P('M9 21h6'),
        stop:         P('M6 6h12v12H6z'),
        nota:         P('M9 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z') + P('M11.5 16V5l7-2v9') + P('M16 15.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'),
        unisci:       P('M3 5h18v14H3z') + P('M9 12h6') + P('M7 10l2 2-2 2') + P('M17 10l-2 2 2 2'),
        dividi:       P('M3 5h18v14H3z') + P('M12 5v14') + P('M9 10l-2 2 2 2') + P('M15 10l2 2-2 2')
    };

    Griglia.icona = function (nome, classe = '') {
        const d = tracciati[nome] || tracciati.info;
        return `<svg class="icona ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
    };
    Griglia.icone = Object.keys(tracciati);
})();
