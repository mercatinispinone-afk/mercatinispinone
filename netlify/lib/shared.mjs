import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash } from "node:crypto";

export const EVENTO = {
  titolo: "Natale a Spinone – Mercatini in riva al lago",
  date: "sabato 5 e domenica 6 dicembre 2026",
  luogo: "Area Borgo del Cigno, Spinone al Lago (BG)",
  contatto: "mercatinispinone@gmail.com",
};

export const GIORNI = {
  sab: "Sabato 5 dicembre - Dalle 10 alle 18",
  dom: "Domenica 6 dicembre - Dalle 10 alle 18",
};

export const TIPI = {
  "1": "1) Prodotti NON alimentari",
  "2": "2) Prodotti alimentari confezionati NON per il consumo in loco",
  "3": "3) Prodotti alimentari per il consumo diretto in loco",
};

/** Dati per il pagamento, usati nell'email di pre-conferma */
export const PAGAMENTO = {
  iban: "IT41S0306952790100000008776",
  intestatario: "Associazione Sotto le Stelle",
  paypal: "https://www.paypal.com/donate/?hosted_button_id=9Z2DN88Z5K8LC",
  giorniLavorativi: 5,
};

/** Etichette dei giorni per l'email di conferma */
export const GIORNI_MAIUSC = { sab: "SABATO 5 DICEMBRE", dom: "DOMENICA 6 DICEMBRE" };

/** Quota spazio (senza corrente, che si paga in loco) per i giorni confermati */
export function quotaSpazio(tipo, giorni) {
  const n = giorni.length;
  if (!n) return 0;
  return tipo === "3" ? 50 * n : n >= 2 ? 30 : 20;
}

// accettato = pre-confermato (email inviata, in attesa di pagamento); confermato = pagamento ricevuto
export const STATI = ["in_attesa", "lista", "accettato", "confermato", "rifiutato", "annullato"];
/** Scadenza pagamento: N giorni lavorativi dall'invio della pre-conferma (esclusi weekend e festivi nazionali) */
const FESTIVI = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"];
export function scadenzaPagamento(iso, giorni = PAGAMENTO.giorniLavorativi) {
  const d = new Date(iso);
  let n = 0;
  while (n < giorni) {
    d.setDate(d.getDate() + 1);
    const md = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (d.getDay() !== 0 && d.getDay() !== 6 && !FESTIVI.includes(md)) n++;
  }
  d.setHours(23, 59, 59, 0);
  return d;
}
export const ORE_SOLLECITO = 48;

export const METODI_PAGAMENTO = ["Bonifico", "PayPal / carta", "Contanti", "Altro"];

export const iscrizioniStore = () => getStore({ name: "iscrizioni", consistency: "strong" });
export const fotoStore = () => getStore({ name: "foto-iscrizioni", consistency: "strong" });

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Verifica la password admin (header x-admin-password) contro la variabile ADMIN_PASSWORD */
export function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const given = req.headers.get("x-admin-password") || "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Calcolo indicativo della quota (come da modulo) */
export function stimaQuota({ tipo, giorni, corrente }) {
  const n = giorni.length;
  let base;
  if (tipo === "3") base = 50 * n;
  else base = n >= 2 ? 30 : 20;
  const extra = corrente ? (tipo === "3" ? 20 : 5) * n : 0;
  return base + extra;
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
