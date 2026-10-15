import { iscrizioniStore, fotoStore, json, isAdmin, STATI } from "../lib/shared.mjs";

/**
 * API area riservata (header x-admin-password obbligatorio)
 *  GET    /api/admin/iscritti            -> elenco completo
 *  GET    /api/admin/foto?key=<id>/<n>   -> immagine
 *  PATCH  /api/admin/iscritti?id=<id>    -> { stato, note }
 *  DELETE /api/admin/iscritti?id=<id>    -> elimina iscrizione e foto
 */
export default async (req) => {
  if (!process.env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD non configurata su Netlify" }, 500);
  if (!isAdmin(req)) return json({ error: "Password errata" }, 401);

  const url = new URL(req.url);
  const risorsa = url.pathname.split("/").pop();
  const store = iscrizioniStore();

  if (risorsa === "foto" && req.method === "GET") {
    const key = url.searchParams.get("key") || "";
    const res = await fotoStore().getWithMetadata(key, { type: "arrayBuffer" });
    if (!res) return json({ error: "Foto non trovata" }, 404);
    return new Response(res.data, {
      headers: { "content-type": res.metadata?.type || "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  }

  if (risorsa !== "iscritti") return json({ error: "Non trovato" }, 404);

  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: "iscritti/" });
    const records = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    const lista = records.filter(Boolean).sort((a, b) => a.creato.localeCompare(b.creato));
    return json({ iscritti: lista });
  }

  const id = url.searchParams.get("id") || "";
  if (!/^[\w-]+$/.test(id)) return json({ error: "ID non valido" }, 400);
  const key = `iscritti/${id}`;
  const rec = await store.get(key, { type: "json" });
  if (!rec) return json({ error: "Iscrizione non trovata" }, 404);

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => ({}));
    if (body.stato !== undefined) {
      if (!STATI.includes(body.stato)) return json({ error: "Stato non valido" }, 400);
      rec.stato = body.stato;
    }
    if (typeof body.note === "string") rec.note = body.note.slice(0, 2000);
    rec.aggiornato = new Date().toISOString();
    await store.setJSON(key, rec);
    return json({ ok: true, iscritto: rec });
  }

  if (req.method === "DELETE") {
    const fs = fotoStore();
    await Promise.all((rec.foto || []).map((k) => fs.delete(k)));
    await store.delete(key);
    return json({ ok: true });
  }

  return json({ error: "Metodo non consentito" }, 405);
};

export const config = { path: ["/api/admin/iscritti", "/api/admin/foto"] };
