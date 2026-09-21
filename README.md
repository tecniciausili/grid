# Griglia (versione autonoma)

Comunicatore CAA (Comunicazione Aumentativa Alternativa) a griglie di AssistiveTech.it.
App **100% statica** (HTML/CSS/JS) pensata per Azure Static Web Apps, derivata dallo strumento
`training_cognitivo/strumenti/grid/` del portale (quella versione, con PHP e MySQL, resta invariata).

**Modello: UN DISPOSITIVO = UN UTENTE.** Nessun server, nessun login, nessun database esterno:
comunicatori, foto, registrazioni e archivio video vivono nel browser del dispositivo (IndexedDB).
Sul dispositivo dove si installa l'app la usa l'utente, e l'educatore la prepara e la modifica da lì.

Ispirato ad Asterics AAC (ex AsTeRICS Grid), riscritto da zero per essere semplice da
configurare: tre concetti soltanto (comunicatore, pagina, cella) e due sole azioni per
cella (**dice** un testo oppure **apre** una pagina).

## Come si usa

```
index.html ──► Area Educatore (gestione.html)   comunicatori, archivio video, copia di sicurezza
           └─► Area Utente    (utente.html)     apre il comunicatore IN USO, bloccato
                                                    └── lucchetto premuto 2 s → Modifica / Area educatore
```

- L'educatore apre l'Area Educatore **sul dispositivo dell'utente**, crea il comunicatore (da un modello,
  vuoto, da parole o da un file) e lo mette **in uso**; il primo creato lo è già.
- L'utente apre l'Area Utente e trova il comunicatore pronto, con l'interfaccia bloccata.
- L'educatore torna a modificare tenendo premuto il lucchetto per due secondi («Area educatore»
  oppure «Modifica»); con «Fine» si torna direttamente all'uso. «Prova» nell'Area Educatore apre
  il comunicatore bloccato, come lo vede l'utente.
- Installata come app (icona sulla schermata Home), la pagina iniziale mette per prima l'Area Utente.
- Per preparare il materiale su un computer e poi usarlo sul tablet: sul computer «Scarica file (.json)»
  o «Scarica la copia», sul tablet «Nuovo comunicatore → Da un file» o «Ripristina».

## Cosa fa

```
┌──────────────────────────────────────────────────────────────┐
│ [🏠][↩]  io · voglio · giocare                [Parla][⌫][🗑] │  barra fissa: navigazione, frase, voce
├──────────────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                         │
│  │  io  │ │  tu  │ │voglio│ │ non  │   celle colorate per    │
│  └──────┘ └──────┘ └──────┘ └──────┘   categoria (Fitzgerald │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   modificato)           │
│  │  sì  │ │  no  │ │aiuto │ │basta │                         │
│  └──────┘ └──────┘ └──────┘ └──────┘                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   celle con l'angolo    │
│  │mangi.│ │ bere │ │gioca.│ │dormi.│   nero aprono una pagina│
│  └──────┘ └──────┘ └──────┘ └──────┘                         │
└──────────────────────────────────────────────────────────────┘
```

- **Uso**: tocco su una cella → la parola va nella barra e viene letta (Web Speech API,
  voci del dispositivo). «Parla» legge la frase intera. Le celle-cartella aprono pagine.
  La barra della frase si può ingrandire fino a 3 volte (Impostazioni → Barra, cursore con
  anteprima): parole, immagini e pulsanti crescono insieme. In Impostazioni → Aspetto due cursori
  per chi vede poco: grandezza del testo nelle celle (60–300%, il testo resta su una riga e nella
  cella dove la parola non entra si riduce da solo fino al bordo) e grandezza dell'immagine (50–150%,
  oltre il 100% il pittogramma riempie di più la cella); righe e colonne non cambiano. Una cella-cartella mette anche la sua parola
  nella frase («io» → «voglio» apre le scelte → «uscire» = «io voglio uscire»); per le cartelle di argomento
  (Cibo, Giochi) l'opzione «Mette anche la parola nella frase» si spegne nel pannello della cella.
- **Tre metodi di selezione**: tocco/clic, permanenza (dwell, per puntatori oculari) e
  scansione automatica a righe e colonne con un pulsante (Spazio, Invio o tocco sullo schermo).
  La scansione calcola le righe dalla posizione reale sullo schermo, barra compresa.
- **Modifica in pagina**: tocca una cella e cambi parola, immagine (ricerca ARASAAC o foto dal
  dispositivo), colore, azione e misura nel pannello a lato; trascina per spostare o scambiare;
  tocca uno spazio vuoto per aggiungere. Annulla (Ctrl+Z), salvataggio automatico.
- **Modelli italiani** pronti (Le mie parole, Sì no aiuto, A scuola, Io e gli altri) con
  pittogrammi ARASAAC scelti dall'API ufficiale.
- **Pagina veloce, dallo schizzo su carta alle celle** («Da parole» in Nuovo comunicatore, pulsante
  «Parole» nell'editor): si scrivono le parole una per riga; `parola -> a, b, c` crea una cella-cartella
  con una nuova pagina che contiene a, b, c; `parola = frase` fa dire una frase diversa; più parole sulla
  stessa riga con la virgola. Ogni parola riceve il primo pittogramma ARASAAC e il colore Fitzgerald dal
  tipo di parola (pronome, nome, verbo, descrittore, sociale, domanda, negazione, piccole parole). Righe
  e colonne si calcolano da sole. Nessun servizio esterno oltre ARASAAC (`js/veloce.js`).
- **Import/export**: legge `.grd` (Asterics AAC), `.obf`/`.obz` (Open Board Format) e il formato
  nativo `.json`; esporta `.json` e `.obz`. Le immagini e gli audio incorporati vengono salvati sul dispositivo; nei file esportati foto e registrazioni sono incluse.
- **PWA**: installabile sul dispositivo dell'utente e utilizzabile **senza connessione**: i file dell'app
  sono in cache, pittogrammi e miniature già visti anche. Servono la rete solo la ricerca di nuovi
  pittogrammi ARASAAC e i video YouTube.
- **Video YouTube** (come nello strumento «Ascolto la musica»): una cella può «avviare un video».
  Si apre uno schermo a un solo box con il video a tutta pagina, un grande pulsante Indietro e il
  conto alla rovescia. Le celle video della stessa pagina sono la scaletta: **Spazio** (o un tocco
  sullo schermo) passa al successivo in ordine o a caso. Tempo di visione per pagina o per cella,
  con spezzone inizio/fine (minuti e secondi); allo scadere pausa con «Spazio riprende» oppure ritorno alle scelte;
  a fine video ritorno alle scelte, video successivo o fermo; «Spazio bloccato» (timer persistente).
  Esempio: Home → «cartoni animati» (apre pagina) → pagina con i cartoni (celle video) → visione.
- **Archivio video** del dispositivo, preparato dall'educatore come i comunicatori: ricerca su YouTube dentro l'app
  (YouTube Data API, chiave dello strumento Agenda) oppure incolla-link con titolo automatico
  (oEmbed di YouTube, direttamente dal browser), categorie, tempi. Le celle YouTube dei file `.grd` di Asterics vengono importate.
- **Voce registrata o mp3 su ogni cella** (sezione «Con quale voce parla» del pannello): si registra
  dal microfono del computer (Registra → parla → Ferma e salva) oppure si carica un file audio.
  Le registrazioni e i file wav/ogg diventano MP3 mono (encoder lamejs nel browser, ~8 KB al secondo),
  mp3 e m4a restano come sono; il file va in IndexedDB e la cella ne tiene il riferimento `idb:<id>`.
  La registrazione sostituisce la voce sintetica: vale per «Dice la parola», «Dice un testo diverso»
  e «Apre una pagina» (la parola va comunque nella frase; «Parla» legge le parole sintetiche insieme e
  le registrazioni una alla volta, in ordine). Silenzi iniziali e finali tolti, volume alzato se basso.
  Limiti: 2 minuti per registrazione, 8 MB per file. Nell'export `.obz` i suoni sono inclusi nel pacchetto (`sounds/`).
- **Copia di sicurezza** (Area Educatore): un unico file `.json` con tutti i comunicatori, foto,
  registrazioni e archivio video. «Ripristina» li aggiunge a quelli presenti, senza cancellare nulla.
  Serve anche per passare il lavoro su un nuovo dispositivo.
- **Blocco**: per l'utente l'interfaccia è bloccata; l'educatore sblocca tenendo premuto il
  lucchetto per 2 secondi.

## Struttura

```
grid/
├── index.html            # Scelta area: Educatore / Utente, installazione PWA
├── gestione.html         # Area Educatore: comunicatori (in uso, nuovo, duplica…), archivio video, copia di sicurezza
├── utente.html           # Area Utente: apre il comunicatore in uso
├── app.html              # Comunicatore: uso, modifica, schermo video
├── manifest.json
├── service-worker.js     # Cache dei file dell'app (offline) e dei pittogrammi
├── staticwebapp.config.json
├── css/
│   ├── styles.css        # Stile condiviso (direzione grafica "Griglia": colori pieni, bordi netti)
│   └── app.css           # Layout dell'app: barra, griglia, celle, pannello, editor
├── js/
│   ├── config.js         # Versione, chiave YouTube, utilità, modali, toast, service worker
│   ├── icone.js          # Icone SVG inline (nessuna dipendenza)
│   ├── modello.js        # Modello dati, categorie colore, geometria della griglia
│   ├── voce.js           # Sintesi vocale
│   ├── audio.js          # Voce registrata: microfono, conversione in MP3, riproduzione (sblocco su tablet)
│   ├── arasaac.js        # Ricerca pittogrammi (con categorie e tipo di parola)
│   ├── veloce.js         # Pagina veloce: parole scritte → celle con pittogramma e colore, sottopagine
│   ├── storage.js        # IndexedDB: Griglia.DB, Griglia.Media (foto/audio), Griglia.Archivio (comunicatori, copia di sicurezza, modelli)
│   ├── video.js          # Archivio video (IndexedDB), ricerca YouTube, selettore, schermo di riproduzione
│   ├── input.js          # Tocco, dwell, scansione
│   ├── griglia.js        # Rendering di pagina e barra
│   ├── editor.js         # Editor in pagina
│   ├── importa.js        # .grd / .obf / .obz / .json, esportazione
│   ├── app.js            # Logica di app.html
│   ├── gestione.js       # Logica dell'Area Educatore
│   ├── utente.js         # Logica dell'Area Utente
│   └── vendor/           # lame.min.js (encoder MP3), jszip.min.js (file .obz)
├── modelli/              # Comunicatori di partenza (JSON) + indice.json
└── assets/icons/         # Icone PWA
```

## Architettura dati

| Dato | Dove |
|------|------|
| Comunicatori (documento JSON completo, nome, in uso, date) | IndexedDB `griglia_db`, store `comunicatori` |
| Foto caricate e registrazioni delle celle (Blob) | IndexedDB `griglia_db`, store `media`; nel documento `idb:<id>` |
| Archivio video (id YouTube, titolo, categoria, inizio, fine) | IndexedDB `griglia_db`, store `video` |
| File dell'app, pittogrammi ARASAAC e miniature già visti | Cache del service worker |

- All'avvio l'app chiede `navigator.storage.persist()` perché il browser non cancelli i dati da solo.
- Prima di disegnare il comunicatore, `Griglia.Media.precarica()` trasforma i riferimenti `idb:` in
  object URL: la griglia resta sincrona e le registrazioni suonano anche sui tablet.
- Eliminando un comunicatore, le foto e le registrazioni che nessun altro usa vengono cancellate.
- Esportazioni e copia di sicurezza incorporano foto e audio come data URL; all'importazione tornano in IndexedDB.
- I file `.json` esportati dalla versione del portale (Aruba) si importano: le immagini e gli audio in
  `assets/uploads/` vengono letti dall'indirizzo pubblico di assistivetech.it.

> ⚠️ **Non cancellare i dati di navigazione del browser** sul dispositivo dell'utente e non usare la
> navigazione privata: i comunicatori andrebbero persi. Scaricare ogni tanto la copia di sicurezza.

## Modello dati

```
Comunicatore { schema, nome, lingua, paginaHomeId,
               barra { frase, parla, cancellaParola, cancellaTutto, home, indietro, dimensione },
               aspetto { preset, testo, posizioneTesto, mostraEtichette, testoScala, immagineScala },
               voce { velocita, tono, parlaAlTocco },
               input { metodo, tempoDwell, tempoScansione, tastoSelezione },
               tornaHomeDopoSelezione, pagine[] }
Pagina       { id, nome, righe, colonne, celle[],
               riproduzione { durata, fineTimer, fineVideo, spazio, spazioBloccato, mostraTimer } }
Cella        { id, x, y, w, h, etichetta, immagine { tipo: arasaac|upload|url|dati|nessuna, id | url, autore }, categoria,
               dice, vaiA, video { id, titolo, inizio, fine, durata } | null,
               audio { tipo: upload | dati | url, url, durata?, nome? } | null, nascosta, colore?, inFrase }
```

`upload` = file sul dispositivo (`idb:<id>`), `dati` = data URL (file importati, prima del salvataggio),
`url` = indirizzo esterno. Azione della cella, in ordine di precedenza: `vaiA` (apre una pagina),
`video` (avvia un video), altrimenti dice `dice` o l'etichetta.

## Requisiti di rete

- **Senza rete funziona**: uso del comunicatore, modifica, foto e registrazioni, pittogrammi già visti.
- **Serve la rete**: ricerca e primo caricamento dei pittogrammi ARASAAC (`api.arasaac.org`,
  `static.arasaac.org`), video e ricerca YouTube, font Google (con fallback di sistema).
- La ricerca YouTube usa la chiave in `js/config.js`: se su Google Cloud la chiave è limitata per
  referrer, aggiungere il dominio della Static Web App.
- La registrazione dal microfono richiede https (Azure lo fornisce) e il permesso del browser.

## Sviluppo locale

```bash
cd grid
python3 -m http.server 8080
# poi apri http://localhost:8080/
```

## Deploy su Azure Static Web Apps

1. Crea la risorsa **Static Web App** (piano Free) nel portale Azure
2. Collega il repository GitHub del progetto
3. Impostazioni di build:
   - **Preset**: Custom
   - **App location**: `/`
   - **Api location**: (vuoto)
   - **Output location**: (vuoto)
4. Il file `staticwebapp.config.json` è già configurato (fallback su index.html, service worker senza cache HTTP)

Quando si pubblicano modifiche, aumentare `VERSIONE` in `service-worker.js` (e il `?v=` nelle pagine)
perché i dispositivi scarichino i file nuovi.

## Licenze

- Pittogrammi ARASAAC: CC BY-NC-SA (autore Sergio Palao, Governo di Aragona). Uso non commerciale.
- Codice: scritto da zero per AssistiveTech; nessun codice di Asterics AAC (AGPL) è stato riusato,
  solo idee, modello dati e formato di interscambio (Open Board Format, specifica aperta).
- Font Bricolage Grotesque e Atkinson Hyperlegible via Google Fonts (licenza OFL), con fallback di sistema.
- JSZip 3.10.1 (MIT) in `js/vendor/jszip.min.js`, per import/export `.obz`.
- Encoder MP3 lamejs 1.2.1 (LGPL, https://github.com/zhuker/lamejs) incluso non modificato come file
  separato `js/vendor/lame.min.js` (licenza in `js/vendor/LICENSE-lamejs.txt`).
- Video YouTube riprodotti con il player ufficiale (IFrame API), nel rispetto dei termini YouTube;
  la ricerca usa la YouTube Data API v3 con la chiave dello strumento Agenda (quota giornaliera: circa cento
  ricerche, e la ricerca parte solo con «Cerca» o Invio; in alternativa si incolla il link).

## Limitazioni

- I dati NON sono sincronizzati tra dispositivi: ogni dispositivo ha i propri comunicatori
  (per spostarli: esportazione o copia di sicurezza).
- Cambiare browser, usare la navigazione privata o cancellare i dati del sito significa non vedere i dati salvati.
