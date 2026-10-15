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
| `ORGANIZER_EMAIL` | la tua email | riceve la notifica di ogni iscrizione (facoltativa) |

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
