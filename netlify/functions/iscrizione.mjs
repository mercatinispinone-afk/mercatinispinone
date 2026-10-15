import { randomUUID, randomInt } from "node:crypto";
import { iscrizioniStore, fotoStore, json, stimaQuota, GIORNI, TIPI } from "../lib/shared.mjs";
import { inviaConfermaEspositore, inviaNotificaOrganizzatore } from "../lib/mailer.mjs";

const SI_NO = ["Sì", "No"];
const MAX_FOTO = 5;
const MAX_FOTO_BYTES = 1.8 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Codice richiesta casuale (senza caratteri ambigui come 0/O, 1/I)
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const nuovoCodice = () => "NS-" + Array.from({ length: 5 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

const str = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }

  // Honeypot anti-spam: campo nascosto che gli umani lasciano vuoto
  if (body.sito_web) return json({ ok: true, codice: nuovoCodice() });

  const r = {
    nome: str(body.nome, 80),
    cognome: str(body.cognome, 80),
    telefono: str(body.telefono, 30),
    email: str(body.email, 120).toLowerCase(),
    giaPartecipato: str(body.giaPartecipato, 5),
    tipo: str(body.tipo, 2),
    giorni: Array.isArray(body.giorni) ? [...new Set(body.giorni.filter((g) => g in GIORNI))] : [],
    descrizione: str(body.descrizione, 2000),
    gazebo: str(body.gazebo, 5),
    corrente: str(body.corrente, 5),
    asfalto: str(body.asfalto, 5),
    motivoAsfalto: str(body.motivoAsfalto, 1000),
    vicinoA: str(body.vicinoA, 200),
    accettaRegolamento: body.accettaRegolamento === true,
    accettaPrezzoPosizione: body.accettaPrezzoPosizione === true,
    accettaPrivacy: body.accettaPrivacy === true,
  };

  const errori = [];
  if (!r.nome) errori.push("Nome");
  if (!r.cognome) errori.push("Cognome");
  if (!/^[+\d][\d\s./-]{5,}$/.test(r.telefono)) errori.push("Telefono cellulare");
  if (!EMAIL_RE.test(r.email)) errori.push("Email");
  if (!SI_NO.includes(r.giaPartecipato)) errori.push("Partecipazione precedente");
  if (!(r.tipo in TIPI)) errori.push("Tipo di merce");
  if (!r.giorni.length) errori.push("Giorni di partecipazione");
  if (!r.descrizione) errori.push("Descrizione della merce");
  if (!SI_NO.includes(r.gazebo)) errori.push("Gazebo");
  if (!SI_NO.includes(r.corrente)) errori.push("Energia elettrica");
  if (!SI_NO.includes(r.asfalto)) errori.push("Esigenza asfalto");
  if (!r.accettaRegolamento) errori.push("Accettazione regolamento");
  if (!r.accettaPrezzoPosizione) errori.push("Accettazione prezzo e posizione");
  if (!r.accettaPrivacy) errori.push("Consenso privacy");
  if (errori.length) return json({ error: "Controlla questi campi: " + errori.join(", ") }, 400);

  // Foto (facoltative, già ridimensionate nel browser)
  const fotoIn = Array.isArray(body.foto) ? body.foto.slice(0, MAX_FOTO) : [];
  const fotoBuffers = [];
  for (const f of fotoIn) {
    const m = typeof f?.data === "string" && f.data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) continue;
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_FOTO_BYTES) return json({ error: "Una delle foto è troppo grande." }, 400);
    fotoBuffers.push({ type: m[1], buf });
  }

  const store = iscrizioniStore();
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  // Numero progressivo
  const meta = (await store.get("_meta/contatore", { type: "json" })) || { n: 0 };
  meta.n += 1;
  await store.setJSON("_meta/contatore", meta);

  const fStore = fotoStore();
  const foto = [];
  for (let i = 0; i < fotoBuffers.length; i++) {
    const key = `${id}/${i + 1}`;
    await fStore.set(key, fotoBuffers[i].buf, { metadata: { type: fotoBuffers[i].type } });
    foto.push(key);
  }

  const record = {
    id,
    numero: String(meta.n).padStart(3, "0"), // solo per uso interno (area admin)
    codice: nuovoCodice(),
    creato: new Date().toISOString(),
    stato: "in_attesa",
    note: "",
    ...r,
    quotaStimata: stimaQuota({ tipo: r.tipo, giorni: r.giorni, corrente: r.corrente === "Sì" }),
    foto,
    emailInviata: false,
  };

  await store.setJSON(`iscritti/${id}`, record);

  // Email (un eventuale errore non annulla l'iscrizione)
  const siteUrl = process.env.URL || new URL(req.url).origin;
  try {
    await inviaConfermaEspositore(record);
    record.emailInviata = true;
  } catch (e) {
    console.error("Errore invio email espositore:", e.message);
    record.erroreEmail = e.message;
  }
  try {
    await inviaNotificaOrganizzatore(record, siteUrl);
  } catch (e) {
    console.error("Errore invio email organizzatore:", e.message);
  }
  await store.setJSON(`iscritti/${id}`, record);

  return json({ ok: true, codice: record.codice, emailInviata: record.emailInviata });
};

export const config = { path: "/api/iscrizione" };
