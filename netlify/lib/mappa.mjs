import { getStore } from "@netlify/blobs";

export const mappaStore = () => getStore({ name: "mappa", consistency: "strong" });
export const LARGHEZZA = 1000, ALTEZZA = 736;
/** Mappa schematica: 10 m ≈ 85 unità */
export const SCALA_SCHEMA = 8.5;

/**
 * Postazione: { id, label, x, y (centro, unità immagine), w, h (metri), rot (gradi), tipo, corrente }
 * Layout: { postazioni, sfondo, scala (unità per metro), scalaVerificata, corridoio (metri liberi tra postazioni) }
 */
export function layoutDefault() {
  const p = [];
  const cx = 610, cy = 387, r = 138;
  let n = 1;
  for (let a = -105; a <= 150; a += 22) {
    const rad = (a * Math.PI) / 180;
    p.push({ id: `p${n}`, label: String(n), x: Math.round(cx + r * Math.cos(rad)), y: Math.round(cy + r * Math.sin(rad)), w: 4, h: 4, rot: Math.round(a + 90), tipo: "prato", corrente: false });
    n++;
  }
  for (let i = 0; i < 4; i++) {
    p.push({ id: `p${n}`, label: String(n), x: Math.round(820 + i * 44), y: Math.round(355 + i * 38), w: 4, h: 4, rot: 41, tipo: "prato", corrente: false });
    n++;
  }
  const asfalto = [[462, 256], [430, 300], [404, 346], [390, 398], [388, 450], [392, 502]];
  asfalto.forEach(([x, y], i) => p.push({ id: `a${i + 1}`, label: `A${i + 1}`, x, y, w: 4, h: 4, rot: i < 3 ? -52 : -80, tipo: "asfalto", corrente: true }));
  return { versione: 2, sfondo: null, scala: SCALA_SCHEMA, scalaVerificata: false, corridoio: 1, postazioni: p };
}

/** Normalizza layout salvati con versioni precedenti */
export function normalizza(l) {
  l.postazioni = (l.postazioni || []).map((p) => ({ w: 4, h: 4, rot: 0, ...p }));
  if (!(l.scala > 0)) l.scala = l.sfondo ? null : SCALA_SCHEMA;
  if (l.corridoio == null) l.corridoio = 1;
  return l;
}

export async function leggiLayout() {
  const l = await mappaStore().get("layout", { type: "json" });
  return l ? normalizza(l) : layoutDefault();
}
