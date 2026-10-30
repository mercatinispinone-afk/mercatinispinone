import { iscrizioniStore, json } from "../lib/shared.mjs";
import { leggiConfig, statoIscrizioni, ATTIVE } from "../lib/config.mjs";

/** GET /api/stato-iscrizioni (pubblico): il modulo sa se le iscrizioni sono aperte o in lista d'attesa */
export default async () => {
  const cfg = await leggiConfig();
  let attive = 0;
  if (cfg.maxCandidature > 0) {
    const store = iscrizioniStore();
    const { blobs } = await store.list({ prefix: "iscritti/" });
    const recs = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    attive = recs.filter((r) => r && ATTIVE(r)).length;
  }
  const s = statoIscrizioni(cfg, attive);
  return new Response(JSON.stringify({ ...s, chiusura: cfg.chiusura }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/stato-iscrizioni" };
