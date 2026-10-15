import nodemailer from "nodemailer";
import { EVENTO, GIORNI, TIPI, esc } from "./shared.mjs";

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
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
<p style="margin:18px 0 6px;font-weight:bold;color:#5b1f24">Riepilogo della tua richiesta (n. ${esc(r.numero)})</p>
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
  const corpo = `<p>Nuova iscrizione espositore ricevuta (n. ${esc(r.numero)}).</p>
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
