import nodemailer from "nodemailer";
import { EVENTO, GIORNI, GIORNI_MAIUSC, TIPI, PAGAMENTO, esc } from "./shared.mjs";

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    // Una sola connessione riutilizzata: evita un nuovo login a Gmail per ogni email
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

const from = () => process.env.MAIL_FROM || `Mercatini di Natale Spinone <${process.env.SMTP_USER}>`;

function riepilogoRighe(r) {
  const righe = [
    ["Nome e cognome", `${r.nome} ${r.cognome}`],
    ["Telefono", r.telefono],
    ["Email", r.email],
    ["Già partecipato", r.giaPartecipato],
    ["Tipo di merce", TIPI[r.tipo]],
    ["Giorni", r.giorni.map((g) => GIORNI[g]).join("<br>")],
    ["Descrizione merce", esc(r.descrizione).replace(/\n/g, "<br>")],
    ["Gazebo", r.gazebo],
    ["Corrente supplementare", r.corrente],
    ["Necessità asfalto", r.asfalto + (r.motivoAsfalto ? ` – ${esc(r.motivoAsfalto)}` : "")],
    ["Vicino a", r.vicinoA || "—"],
    ["Foto caricate", String(r.foto.length)],
    ["Quota indicativa", `€ ${r.quotaStimata.toFixed(2).replace(".", ",")}`],
  ];
  return righe
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px;color:#6b4a3a;font-size:13px;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 10px;color:#3a1a1c;font-size:14px">${
          k === "Descrizione merce" || k === "Giorni" || k === "Necessità asfalto" ? v : esc(v)
        }</td></tr>`
    )
    .join("");
}

function layout(titolo, corpo) {
  return `<!doctype html><html><body style="margin:0;background:#f7e9c6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7e9c6;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff8e6;border-radius:6px;overflow:hidden">
<tr><td style="background:#5b1f24;padding:22px 24px;text-align:center">
<div style="color:#f7c948;font-size:12px;letter-spacing:4px;text-transform:uppercase">Mercatini &amp; street food in riva al lago</div>
<div style="color:#fff8e6;font-size:30px;font-weight:bold;letter-spacing:1px;margin-top:6px">NATALE A SPINONE</div>
<div style="color:#f2a03d;font-size:14px;margin-top:6px;text-transform:uppercase;letter-spacing:1px">5 e 6 dicembre 2026 · Borgo del Cigno</div>
</td></tr>
<tr><td style="padding:26px 28px;color:#3a1a1c;font-size:15px;line-height:1.55">
<h2 style="margin:0 0 14px;color:#a3222f;font-size:20px">${titolo}</h2>
${corpo}
</td></tr>
<tr><td style="background:#6b6a2c;color:#fff8e6;padding:14px 24px;font-size:12px;text-align:center">
Associazione sotto le Stelle · via Alla Fonte 5 · Spinone al Lago (BG) · <a style="color:#f7c948" href="mailto:${EVENTO.contatto}">${EVENTO.contatto}</a>
</td></tr></table></td></tr></table></body></html>`;
}

export async function inviaConfermaEspositore(r) {
  const corpo = `<p>Ciao ${esc(r.nome)},</p>
<p>abbiamo ricevuto la tua <strong>richiesta di partecipazione</strong> ai Mercatini di Natale di Spinone al Lago, ${EVENTO.date}.</p>
<p>Ricorda che questa <strong>non è ancora una conferma</strong>: l'organizzazione valuterà le richieste in base alla tipologia merceologica e all'ordine di arrivo e ti scriverà via email sia in caso di accettazione sia di rifiuto. Insieme alla conferma riceverai le istruzioni per il pagamento della quota.</p>
<p style="margin:18px 0 6px;font-weight:bold;color:#5b1f24">Riepilogo della tua richiesta (codice ${esc(r.codice)})</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fbf1d8;border-radius:4px">${riepilogoRighe(r)}</table>
<p style="font-size:13px;color:#6b4a3a;margin-top:14px">La quota indicata è una stima calcolata sulle tue scelte; l'importo definitivo ti verrà comunicato con la conferma.</p>
<p>Per qualsiasi domanda puoi rispondere a questa email o scrivere a <a href="mailto:${EVENTO.contatto}" style="color:#a3222f">${EVENTO.contatto}</a>.</p>
<p>A presto in riva al lago!<br><strong>Associazione sotto le Stelle</strong></p>`;
  return getTransporter().sendMail({
    from: from(),
    to: r.email,
    replyTo: process.env.ORGANIZER_EMAIL || EVENTO.contatto,
    subject: "Richiesta ricevuta – Mercatini di Natale Spinone al Lago 5-6 dicembre 2026",
    html: layout("Grazie, richiesta ricevuta!", corpo),
  });
}

export async function inviaNotificaOrganizzatore(r, siteUrl) {
  const to = process.env.ORGANIZER_EMAIL;
  if (!to) return null;
  const corpo = `<p>Nuova iscrizione espositore ricevuta (n. ${esc(r.numero)} · codice ${esc(r.codice)}).</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fbf1d8">${riepilogoRighe(r)}</table>
<p style="margin-top:16px"><a href="${esc(siteUrl)}/admin" style="background:#a3222f;color:#fff;padding:10px 16px;border-radius:4px;text-decoration:none;font-weight:bold">Apri l'area iscritti</a></p>`;
  return getTransporter().sendMail({
    from: from(),
    to,
    replyTo: r.email,
    subject: `Nuovo espositore: ${r.nome} ${r.cognome} (${TIPI[r.tipo].slice(0, 2)} ${r.giorni.join("+")})`,
    html: layout("Nuova iscrizione", corpo),
  });
}

const euroIt = (n) => Number(n).toFixed(2).replace(".", ",").replace(",00", "");

/** Email di pre-conferma postazione (giorni e quota decisi dall'organizzazione) */
export function costruisciPreconferma(r, { giorni, quota }) {
  const extraCorrente = r.tipo === "3" ? 20 : 5;
  const p = (t) => `<p style="margin:0 0 12px">${t}</p>`;
  const corpo = [
    p(`Ciao ${esc(r.nome)},`),
    p(`la tua postazione è <strong>pre-confermata</strong> per:`),
    `<ul style="margin:0 0 14px;padding-left:20px;font-weight:bold;color:#5b1f24">${giorni
      .map((g) => `<li style="margin:2px 0">${GIORNI_MAIUSC[g]}</li>`)
      .join("")}</ul>`,
    `<p style="margin:0 0 12px;font-size:17px">Quota di iscrizione: <strong style="color:#a3222f">${euroIt(quota)} euro</strong></p>`,
    r.corrente === "Sì"
      ? p(`Hai richiesto la corrente supplementare: la quota extra (${euroIt(extraCorrente)} euro al giorno) si paga in loco.`)
      : "",
    `<h3 style="margin:20px 0 10px;color:#a3222f;font-size:16px;text-transform:uppercase;letter-spacing:.5px">Come procedere per confermare la postazione</h3>`,
    p(`Entro <strong>${PAGAMENTO.giorniLavorativi} giorni lavorativi</strong> dal ricevimento di questa mail procedi con il pagamento della quota tramite una delle seguenti opzioni:`),
    `<ul style="margin:0 0 14px;padding-left:20px">
      <li style="margin:0 0 8px"><strong>Bonifico bancario</strong><br>IBAN <span style="font-family:monospace;font-size:15px">${PAGAMENTO.iban}</span><br>intestato ad "${PAGAMENTO.intestatario}"<br>Causale: <strong>${esc(r.nome)} ${esc(r.cognome)}</strong></li>
      <li style="margin:0 0 8px"><strong>PayPal o carta di credito</strong><br>cliccando su <a href="${PAGAMENTO.paypal}" style="color:#a3222f">questo link</a> e inviando come donazione un importo pari alla quota di iscrizione (${euroIt(quota)} euro)</li>
    </ul>`,
    `<div style="text-align:center;margin:6px 0 18px"><a href="${PAGAMENTO.paypal}" style="display:inline-block;background:#a3222f;color:#fff;padding:11px 20px;border-radius:4px;text-decoration:none;font-weight:bold">Paga con PayPal o carta</a></div>`,
    p(`<strong>Dopo il pagamento rispondi a questa email</strong> indicando il nome dell'intestatario del bonifico o dell'account PayPal (se diverso dal tuo), così possiamo abbinare il versamento alla tua postazione.`),
    p(`Il ricevimento della quota di iscrizione vale come conferma.`),
    p(`Se non perverrà il pagamento nei termini stabiliti, la postazione verrà ceduta ai richiedenti presenti in lista d'attesa.`),
    p(`Si precisa che la quota versata verrà rimborsata solo in caso di annullamento dell'evento e non in caso di rinuncia da parte dell'espositore.`),
    p(`Pochi giorni prima dei Mercatini riceverai ulteriori dettagli operativi sulla tua partecipazione.`),
    `<p style="margin:16px 0 0">Grazie, a presto!<br><strong>Staff<br>Mercatini di Spinone al Lago</strong></p>`,
  ].join("\n");
  return {
    subject: "Postazione pre-confermata – Mercatini di Natale Spinone al Lago 2026",
    html: layout("La tua postazione è pre-confermata!", corpo),
  };
}

export async function inviaPreconferma(r, opts) {
  const { subject, html } = costruisciPreconferma(r, opts);
  return getTransporter().sendMail({
    from: from(),
    to: r.email,
    replyTo: process.env.ORGANIZER_EMAIL || EVENTO.contatto,
    subject,
    html,
  });
}

/** Email di non selezione (gentile), con eventuale messaggio personale */
export function costruisciRifiuto(r, { messaggio = "" } = {}) {
  const p = (t) => `<p style="margin:0 0 12px">${t}</p>`;
  const extra = messaggio.trim()
    ? `<p style="margin:0 0 12px;padding:10px 14px;background:#fbf1d8;border-left:4px solid #6b6a2c;border-radius:3px">${esc(messaggio.trim()).replace(/\n/g, "<br>")}</p>`
    : "";
  const corpo = [
    p(`Ciao ${esc(r.nome)},`),
    p(`grazie di cuore per aver inviato la tua richiesta di partecipazione ai Mercatini di Natale di Spinone al Lago (${EVENTO.date}) e per l'interesse che hai dimostrato verso la nostra manifestazione.`),
    p(`Per garantire al pubblico un'offerta varia e ben bilanciata abbiamo dovuto fare una selezione in base alla tipologia merceologica e agli spazi disponibili, e purtroppo <strong>per questa edizione non è stato possibile riservarti una postazione</strong>.`),
    extra,
    p(`Non si tratta di un giudizio sul tuo lavoro: la tua candidatura resta tra i nostri contatti e <strong>ne terremo conto volentieri per le prossime edizioni</strong> dei mercatini. Se nel frattempo dovesse liberarsi una postazione, sarà nostra premura ricontattarti.`),
    p(`Ti ringraziamo ancora e speriamo di incontrarti presto, magari come visitatore in riva al lago!`),
    `<p style="margin:16px 0 0">Un caro saluto,<br><strong>Staff<br>Mercatini di Spinone al Lago</strong></p>`,
  ].join("\n");
  return {
    subject: "La tua richiesta per i Mercatini di Natale di Spinone al Lago 2026",
    html: layout("Grazie per la tua candidatura", corpo),
  };
}

export async function inviaRifiuto(r, opts) {
  const { subject, html } = costruisciRifiuto(r, opts);
  return getTransporter().sendMail({
    from: from(),
    to: r.email,
    replyTo: process.env.ORGANIZER_EMAIL || EVENTO.contatto,
    subject,
    html,
  });
}

/** Email di invito (testo libero scritto dall'organizzatore) */
export function costruisciInvito(dest, { oggetto, testo }, siteUrl) {
  const nome = (dest.nome || "").trim();
  let t = String(testo || "");
  t = nome ? t.replace(/\{nome\}/g, nome) : t.replace(/[ \t]*\{nome\}/g, "");
  const bottone = `<div style="text-align:center;margin:8px 0 18px"><a href="${esc(siteUrl)}" style="display:inline-block;background:#a3222f;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:16px">Iscriviti ora</a><div style="font-size:12px;color:#6b4a3a;margin-top:6px">${esc(siteUrl.replace(/^https?:\/\//, ""))}</div></div>`;
  const linkify = (h) => h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#a3222f">$1</a>');
  const paragrafi = t.split(/\n{2,}/).map((blocco) => {
    if (blocco.trim() === "[ISCRIVITI]") return bottone;
    return `<p style="margin:0 0 12px">${linkify(esc(blocco.trim())).replace(/\n/g, "<br>")}</p>`;
  });
  if (!t.includes("[ISCRIVITI]")) paragrafi.push(bottone);
  paragrafi.push(`<p style="margin:18px 0 0;font-size:12px;color:#8a6a5a">Ricevi questa email perché in passato hai partecipato o ti sei candidato ai nostri mercatini. Se non vuoi più ricevere comunicazioni, rispondi a questa email scrivendo "cancellami".</p>`);
  return { subject: String(oggetto || "").replace(/\{nome\}/g, nome).trim(), html: layout("Iscrizioni aperte!", paragrafi.join("\n")) };
}

export async function inviaInvito(dest, opts, siteUrl) {
  const { subject, html } = costruisciInvito(dest, opts, siteUrl);
  return getTransporter().sendMail({
    from: from(),
    to: dest.email,
    replyTo: process.env.ORGANIZER_EMAIL || EVENTO.contatto,
    subject,
    html,
  });
}

const fmtData = (d) =>
  new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Sollecito di pagamento: 48 ore per pagare, poi la postazione passa alla lista d'attesa */
export function costruisciSollecito(r, { scadenza }) {
  const p = (t) => `<p style="margin:0 0 12px">${t}</p>`;
  const quota = r.quotaConfermata ?? r.quotaStimata;
  const giorni = (r.giorniConfermati || r.giorni).map((g) => GIORNI_MAIUSC[g]).join(" e ");
  const inviata = new Date(r.confermaInviata).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long" });
  const corpo = [
    p(`Ciao ${esc(r.nome)},`),
    p(`il ${inviata} ti abbiamo inviato la pre-conferma della tua postazione ai Mercatini di Natale di Spinone al Lago (${giorni}), ma ad oggi non ci risulta ancora il pagamento della quota di iscrizione di <strong>${euroIt(quota)} euro</strong>, previsto entro ${PAGAMENTO.giorniLavorativi} giorni lavorativi.`),
    `<div style="margin:0 0 14px;padding:12px 16px;background:#fbe3e3;border-left:4px solid #a3222f;border-radius:3px;color:#5b1f24">Se il pagamento non ci arriverà entro <strong>${fmtData(scadenza)}</strong>, la prenotazione verrà annullata e la postazione sarà assegnata a chi è in lista d'attesa.</div>`,
    `<h3 style="margin:16px 0 8px;color:#a3222f;font-size:15px;text-transform:uppercase;letter-spacing:.5px">Come pagare</h3>`,
    `<ul style="margin:0 0 14px;padding-left:20px">
      <li style="margin:0 0 8px"><strong>Bonifico</strong>: IBAN <span style="font-family:monospace">${PAGAMENTO.iban}</span> intestato ad "${PAGAMENTO.intestatario}" – causale <strong>${esc(r.nome)} ${esc(r.cognome)}</strong></li>
      <li style="margin:0 0 8px"><strong>PayPal o carta</strong>: <a href="${PAGAMENTO.paypal}" style="color:#a3222f">clicca qui</a> e invia come donazione ${euroIt(quota)} euro</li>
    </ul>`,
    `<h3 style="margin:16px 0 8px;color:#6b6a2c;font-size:15px;text-transform:uppercase;letter-spacing:.5px">Hai già pagato?</h3>`,
    p(`Nessun problema: <strong>rispondi a questa email</strong> indicando il <strong>nome dell'intestatario</strong> del bonifico o della donazione PayPal, la data e l'importo. Spesso chi paga non ha lo stesso nome dell'espositore e senza questa informazione non riusciamo ad abbinare il versamento alla tua postazione.`),
    `<p style="margin:16px 0 0">Grazie e a presto!<br><strong>Staff<br>Mercatini di Spinone al Lago</strong></p>`,
  ].join("\n");
  return {
    subject: "Promemoria pagamento – Mercatini di Natale Spinone al Lago 2026",
    html: layout("Promemoria pagamento quota", corpo),
  };
}

export async function inviaSollecito(r, opts) {
  const { subject, html } = costruisciSollecito(r, opts);
  return getTransporter().sendMail({
    from: from(),
    to: r.email,
    replyTo: process.env.ORGANIZER_EMAIL || EVENTO.contatto,
    subject,
    html,
  });
}
