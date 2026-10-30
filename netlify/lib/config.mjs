import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

/** Impostazioni modificabili dall'area riservata */
export const configStore = () => getStore({ name: "config", consistency: "strong" });
export const CONFIG_DEFAULT = {
  chiusura: null,          // ISO: dopo questa data le iscrizioni chiudono
  maxCandidature: null,    // numero massimo di candidature attive (esclusi rifiutati, annullati, lista)
  dopoChiusura: "lista",   // "lista" = si raccolgono richieste in lista d'attesa · "chiuso" = modulo chiuso
  forzaChiusura: false,    // chiusura manuale immediata
  pinStaff: "",            // PIN per la pagina di check-in
};

export async function leggiConfig() {
  return { ...CONFIG_DEFAULT, ...((await configStore().get("iscrizioni", { type: "json" })) || {}) };
}
export async function salvaConfig(c) {
  await configStore().setJSON("iscrizioni", c);
}

/** Candidature che occupano un posto (per il limite massimo) */
export const ATTIVE = (r) => !["rifiutato", "annullato", "lista"].includes(r.stato);

/** Stato delle iscrizioni: { aperte, lista, motivo } */
export function statoIscrizioni(cfg, attive) {
  const scaduta = cfg.chiusura && Date.now() > new Date(cfg.chiusura).getTime();
  const piena = cfg.maxCandidature > 0 && attive >= cfg.maxCandidature;
  const chiuse = cfg.forzaChiusura || scaduta || piena;
  if (!chiuse) return { aperte: true, lista: false, motivo: null };
  const motivo = cfg.forzaChiusura ? "manuale" : scaduta ? "data" : "posti";
  return { aperte: false, lista: cfg.dopoChiusura === "lista", motivo };
}

/** PIN staff o password admin (header x-staff-pin) */
export function staffAutorizzato(req, cfg) {
  const dato = req.headers.get("x-staff-pin") || "";
  const h = (s) => createHash("sha256").update(String(s)).digest();
  const ok = (atteso) => atteso && timingSafeEqual(h(dato), h(atteso));
  return ok(cfg.pinStaff) || ok(process.env.ADMIN_PASSWORD);
}
