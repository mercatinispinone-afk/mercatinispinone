import { json, isAdmin } from "../lib/shared.mjs";
import { mappaStore, leggiLayout, layoutDefault, LARGHEZZA, ALTEZZA } from "../lib/mappa.mjs";

/**
 * Mappa delle postazioni (area riservata)
 *  GET    /api/admin/mappa          -> layout { postazioni:[{id,label,x,y,tipo,corrente}], sfondo }
 *  PUT    /api/admin/mappa          -> salva layout
 *  GET    /api/admin/mappa/sfondo   -> immagine della planimetria caricata
 *  PUT    /api/admin/mappa/sfondo   -> { data: "data:image/...;base64,..." } carica planimetria
 *  DELETE /api/admin/mappa/sfondo   -> torna alla mappa schematica
 */
const MAX_SFONDO = 4 * 1024 * 1024;

export default async (req) => {
  if (!process.env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD non configurata su Netlify" }, 500);
  if (!isAdmin(req)) return json({ error: "Password errata" }, 401);
  const store = mappaStore();
  const sfondo = new URL(req.url).pathname.endsWith("/sfondo");

  if (sfondo) {
    if (req.method === "GET") {
      const res = await store.getWithMetadata("sfondo", { type: "arrayBuffer" });
      if (!res) return json({ error: "Nessuna planimetria" }, 404);
      return new Response(res.data, { headers: { "content-type": res.metadata?.type || "image/jpeg", "cache-control": "private, max-age=600" } });
    }
    const layout = await leggiLayout();
    if (req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const m = typeof body.data === "string" && body.data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return json({ error: "Formato immagine non valido (usa JPG o PNG)" }, 400);
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > MAX_SFONDO) return json({ error: "Immagine troppo grande" }, 400);
      await store.set("sfondo", buf, { metadata: { type: m[1] } });
      const vecchiaW = layout.sfondo?.w || LARGHEZZA, vecchiaH = layout.sfondo?.h || ALTEZZA;
      layout.sfondo = { type: m[1], w: Number(body.w) || LARGHEZZA, h: Number(body.h) || ALTEZZA, caricato: new Date().toISOString() };
      // riporto le postazioni in proporzione sulla nuova immagine (poi si sistemano a mano)
      layout.postazioni = layout.postazioni.map((p) => ({ ...p, x: Math.round((p.x / vecchiaW) * layout.sfondo.w), y: Math.round((p.y / vecchiaH) * layout.sfondo.h) }));
      await store.setJSON("layout", layout);
      return json({ ok: true, layout });
    }
    if (req.method === "DELETE") {
      await store.delete("sfondo");
      const vw = layout.sfondo?.w || LARGHEZZA, vh = layout.sfondo?.h || ALTEZZA;
      layout.postazioni = layout.postazioni.map((p) => ({ ...p, x: Math.round((p.x / vw) * LARGHEZZA), y: Math.round((p.y / vh) * ALTEZZA) }));
      layout.sfondo = null;
      await store.setJSON("layout", layout);
      return json({ ok: true, layout });
    }
    return json({ error: "Metodo non consentito" }, 405);
  }

  if (req.method === "GET") return json({ layout: await leggiLayout(), default: layoutDefault() });

  if (req.method === "PUT") {
    const body = await req.json().catch(() => ({}));
    const attuale = await leggiLayout();
    const lista = Array.isArray(body.postazioni) ? body.postazioni.slice(0, 300) : null;
    if (!lista) return json({ error: "Layout non valido" }, 400);
    const ids = new Set();
    const postazioni = [];
    for (const p of lista) {
      const id = String(p.id || "").slice(0, 20);
      if (!/^[\w-]+$/.test(id) || ids.has(id)) return json({ error: "Identificativo postazione non valido: " + id }, 400);
      ids.add(id);
      postazioni.push({
        id,
        label: String(p.label || id).slice(0, 8),
        x: Math.max(0, Math.min(attuale.sfondo?.w || LARGHEZZA, Number(p.x) || 0)),
        y: Math.max(0, Math.min(attuale.sfondo?.h || ALTEZZA, Number(p.y) || 0)),
        tipo: p.tipo === "asfalto" ? "asfalto" : "prato",
        corrente: !!p.corrente,
      });
    }
    const layout = { ...attuale, postazioni, aggiornato: new Date().toISOString() };
    await store.setJSON("layout", layout);
    return json({ ok: true, layout });
  }
  return json({ error: "Metodo non consentito" }, 405);
};

export const config = { path: ["/api/admin/mappa", "/api/admin/mappa/sfondo"] };
