# Natale a Spinone 2026 – Iscrizioni espositori

Sito Netlify con:

- **/** – modulo di iscrizione (stile volantino, date 5–6 dicembre 2026)
- **/regolamento** – regolamento espositori aggiornato
- **/admin** – area riservata: elenco iscritti, statistiche, filtri, cambio stato (in attesa / accettato / rifiutato), note interne, foto, eliminazione ed **esportazione CSV**
- Email automatica di riepilogo all'espositore + notifica a te ad ogni nuova iscrizione (via SMTP)
- Dati e foto salvati su **Netlify Blobs** (incluso gratis, nessun database da configurare)

## 1. Pubblicazione

> Attenzione: il "drag & drop" della cartella su Netlify **non** attiva le funzioni server (iscrizione, email, admin). Usa uno dei due metodi sotto.

**Metodo A – GitHub (consigliato)**
1. Crea un repository su GitHub e carica il contenuto di questa cartella.
2. Su Netlify: *Add new site → Import an existing project → GitHub* e scegli il repository. Le impostazioni vengono lette da `netlify.toml`, non serve cambiare nulla.

**Metodo B – Netlify CLI dal tuo computer**
```bash
cd mercatini-spinone
npm install
npx netlify-cli login
npx netlify-cli deploy --build --prod
```

## 2. Variabili d'ambiente (obbligatorie)

Netlify → *Site configuration → Environment variables* (vedi `.env.example`):

| Variabile | Esempio | Note |
|---|---|---|
| `ADMIN_PASSWORD` | una password lunga | per entrare in /admin |
| `SMTP_HOST` | `smtp.gmail.com` | Office 365: `smtp.office365.com` |
| `SMTP_PORT` | `465` | Office 365: `587` |
| `SMTP_USER` | `mercatinispinone@gmail.com` | |
| `SMTP_PASS` | password per le app | vedi sotto |
| `MAIL_FROM` | `Mercatini di Natale Spinone <mercatinispinone@gmail.com>` | mittente visualizzato |

**Gmail:** serve la verifica in due passaggi attiva; poi crea una *Password per le app* su <https://myaccount.google.com/apppasswords> e usala come `SMTP_PASS` (non la password normale). Gmail consente circa 500 invii al giorno, più che sufficienti.

Dopo aver impostato le variabili fai un nuovo deploy (*Deploys → Trigger deploy*).

## 3. Uso

- Condividi il link del sito con gli espositori.
- Vai su `https://<tuo-sito>.netlify.app/admin`, inserisci la password e gestisci gli iscritti. Il pulsante **Esporta CSV** scarica gli iscritti visibili con i filtri attuali (si apre direttamente in Excel).
- Se un'email all'espositore non parte (es. SMTP configurato male), l'iscrizione viene comunque salvata e nel dettaglio compare "email di conferma NON inviata".

## Note

- La quota mostrata è indicativa (calcolata come nel vecchio modulo Google: tipo 1-2 € 20 un giorno / € 30 due giorni, tipo 3 € 50 al giorno, corrente € 5 o € 20 al giorno).
- Le foto vengono ridimensionate nel browser prima dell'invio (max 5).
- Struttura: `public/` (pagine), `netlify/functions/` (API), `netlify/lib/` (email e funzioni comuni).

## Postazioni e planimetria

Nell'area iscritti, scheda **🗺 Postazioni e mappa**:

1. **Modifica planimetria → 🖼 Carica planimetria** (immagine o PDF).
2. **📏 Imposta scala**: clicca due punti di distanza nota e scrivi i metri. Da quel momento le postazioni sono disegnate in misura reale (4×4 m, 6×4 m per lo spazio doppio, oppure misure personalizzate).
3. Crea le postazioni con **⋯ Fila dritta** (2 clic) o **◠ Fila ad arco** (3 clic), oppure una alla volta; spostale trascinandole, ruotale con **R**, selezionane più di una con **Shift+clic**. **Ctrl+Z** annulla.
4. Imposta il **passaggio** minimo tra i gazebo: le postazioni troppo vicine o sovrapposte diventano tratteggiate in rosso.
5. Esci da "Modifica", scegli il giorno e assegna gli espositori (clic o trascinamento). **🖨 Stampa giorno** produce mappa ed elenco per lo staff.

## Chiusura iscrizioni e lista d'attesa

Area iscritti → **⚙ Impostazioni**: data di chiusura e/o numero massimo di candidature, oppure chiusura immediata. Dopo la chiusura il modulo può raccogliere le richieste in **lista d'attesa** (ricevono un'email dedicata) oppure chiudersi del tutto.
Quando annulli o rifiuti un espositore che aveva il posto, il sistema propone il subentro al primo della lista che partecipa negli stessi giorni: si apre la pre-conferma (con un'introduzione "si è liberato un posto").

## Check-in del giorno

In **⚙ Impostazioni** scegli un **PIN staff** (almeno 4 caratteri). Lo staff apre `https://<tuo-sito>.netlify.app/checkin` dal telefono, inserisce il PIN e vede gli espositori del giorno ordinati per postazione: segna gli arrivi, incassa la corrente in loco e le quote non ancora pagate (in contanti, che confermano la postazione). La pagina si aggiorna da sola ogni 30 secondi e funziona su più telefoni insieme.
