/**
 * Griglia - Area Utente: apre il comunicatore in uso su questo dispositivo
 * AssistiveTech.it - Training Cognitivo / Strumenti (versione autonoma per Azure Static Web Apps)
 *
 * Un dispositivo = un utente: si apre subito il comunicatore in uso, bloccato.
 */
(function () {
    const esc = (s) => Griglia.util.escapeHtml(s);
    const corpo = () => document.getElementById('utenteCorpo');

    document.addEventListener('DOMContentLoaded', async () => {
        Griglia.registraServiceWorker();
        Griglia.DB.persistente();
        try {
            const attivo = await Griglia.Archivio.locale.attivo();
            if (!attivo) {
                messaggio('Comunicatore non ancora pronto', 'Su questo dispositivo non c\'è ancora un comunicatore: l\'educatore lo prepara dall\'Area Educatore.',
                    [{ testo: 'Area educatore', href: 'gestione.html' }]);
                return;
            }
            location.replace(`app.html?id=${attivo.id_comunicatore}&utente=1`);
        } catch (e) {
            messaggio('Errore', e.message, [{ testo: 'Riprova', href: 'utente.html' }, { testo: 'Area educatore', href: 'gestione.html', secondario: true }]);
        }
    });

    function messaggio(titolo, testo, azioni = []) {
        corpo().innerHTML = `<div class="vuoto-stato" style="max-width:560px;margin:0 auto">${Griglia.icona('info')}<h3>${esc(titolo)}</h3><p class="nota">${esc(testo)}</p>
            <div class="eroe-azioni" style="justify-content:center">${azioni.map(a => `<a class="btn ${a.secondario ? '' : 'btn-primario'}" href="${esc(a.href)}">${esc(a.testo)}</a>`).join('')}</div></div>`;
    }
})();
