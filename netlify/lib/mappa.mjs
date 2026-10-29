import { getStore } from "@netlify/blobs";

export const mappaStore = () => getStore({ name: "mappa", consistency: "strong" });
export const LARGHEZZA = 1000, ALTEZZA = 736;

/** Layout di partenza: postazioni sul prato circolare, sul prato est e lungo il parcheggio (da sistemare in "Modifica layout") */
export function layoutDefault() {
  const p = [];
  const cx = 610, cy = 387, r = 138;
  let n = 1;
  for (let a = -105; a <= 150; a += 15) {
    const rad = (a * Math.PI) / 180;
    p.push({ id: `p${n}`, label: String(n), x: Math.round(cx + r * Math.cos(rad)), y: Math.round(cy + r * Math.sin(rad)), tipo: "prato", corrente: false });
    n++;
  }
  for (let i = 0; i < 5; i++) {
    p.push({ id: `p${n}`, label: String(n), x: Math.round(815 + i * 38), y: Math.round(352 + i * 33), tipo: "prato", corrente: false });
    n++;
  }
  const asfalto = [[452, 268], [428, 300], [405, 335], [392, 378], [388, 422], [392, 466]];
  asfalto.forEach(([x, y], i) => p.push({ id: `a${i + 1}`, label: `A${i + 1}`, x, y, tipo: "asfalto", corrente: true }));
  return { versione: 1, larghezza: LARGHEZZA, altezza: ALTEZZA, sfondo: null, postazioni: p };
}

export async function leggiLayout() {
  return (await mappaStore().get("layout", { type: "json" })) || layoutDefault();
}
