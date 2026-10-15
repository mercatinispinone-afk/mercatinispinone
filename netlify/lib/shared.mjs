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

export const STATI = ["in_attesa", "accettato", "rifiutato"];

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
