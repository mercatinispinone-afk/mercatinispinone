import { iscrizioniStore, fotoStore, json, isAdmin, STATI, GIORNI, METODI_PAGAMENTO, ORE_SOLLECITO } from "../lib/shared.mjs";
import { costruisciPreconferma, inviaPreconferma, costruisciRifiuto, inviaRifiuto, costruisciSollecito, inviaSollecito, costruisciConfermaDefinitiva, inviaConfermaDefinitiva } from "../lib/mailer.mjs";

/**
 * API area riservata (header x-admin-password obbligatorio)
 *  GET    /api/admin/iscritti            -> elenco completo
 *  GET    /api/admin/foto?key=<id>/<n>   -> immagine
 *  PATCH  /api/admin/iscritti?id=<id>    -> { stato, note, pagamento: {importo, metodo, data} | null }
 *  DELETE /api/admin/iscritti?id=<id>    -> elimina iscrizione e foto
 *  POST   /api/admin/conferma?id=<id>     -> { giorni, quota, anteprima } invia email di pre-conferma
 *  POST   /api/admin/rifiuto?id=<id>      -> { messaggio, anteprima } invia email di non selezione
 *  POST   /api/admin/sollecito?id=<id>    -> { anteprima } invia sollecito di pagamento (48 ore)
 *  POST   /api/admin/definitiva?id=<id>   -> { anteprima, importo } email di conferma definitiva (dopo il pagamento)
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

  if (!["iscritti", "conferma", "rifiuto", "sollecito", "definitiva"].includes(risorsa)) return json({ error: "Non trovato" }, 404);

  if (req.method === "GET" && risorsa === "iscritti") {
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

  if (risorsa === "conferma") {
    if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
    const body = await req.json().catch(() => ({}));
    const giorni = Array.isArray(body.giorni) ? Object.keys(GIORNI).filter((g) => body.giorni.includes(g)) : [];
    const quota = Number(body.quota);
    if (!giorni.length) return json({ error: "Seleziona almeno un giorno" }, 400);
    if (!Number.isFinite(quota) || quota < 0 || quota > 10000) return json({ error: "Quota non valida" }, 400);

    if (body.anteprima) return json(costruisciPreconferma(rec, { giorni, quota }));

    try {
      await inviaPreconferma(rec, { giorni, quota });
    } catch (e) {
      console.error("Errore invio pre-conferma:", e.message);
      return json({ error: "Email non inviata: " + e.message }, 502);
    }
    if (rec.stato !== "confermato") rec.stato = "accettato";
    rec.giorniConfermati = giorni;
    rec.quotaConfermata = quota;
    rec.confermaInviata = new Date().toISOString();
    rec.aggiornato = rec.confermaInviata;
    await store.setJSON(key, rec);
    return json({ ok: true, iscritto: rec });
  }

  if (risorsa === "definitiva") {
    if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
    const body = await req.json().catch(() => ({}));
    if (body.anteprima) {
      const prova = { ...rec, pagamento: { ...(rec.pagamento || {}), importo: Number(body.importo ?? rec.pagamento?.importo ?? rec.quotaConfermata ?? 0) } };
      return json(costruisciConfermaDefinitiva(prova));
    }
    if (rec.stato !== "confermato") return json({ error: "Registra prima il pagamento" }, 400);
    try {
      await inviaConfermaDefinitiva(rec);
    } catch (e) {
      return json({ error: "Email non inviata: " + e.message }, 502);
    }
    rec.confermaDefinitivaInviata = new Date().toISOString();
    await store.setJSON(key, rec);
    return json({ ok: true, iscritto: rec });
  }

  if (risorsa === "sollecito") {
    if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
    if (rec.stato !== "accettato" || rec.pagamento) return json({ error: "Il sollecito vale solo per i pre-confermati senza pagamento" }, 400);
    const body = await req.json().catch(() => ({}));
    const scadenza = new Date(Date.now() + ORE_SOLLECITO * 3600 * 1000);
    if (body.anteprima) return json(costruisciSollecito(rec, { scadenza }));
    try {
      await inviaSollecito(rec, { scadenza });
    } catch (e) {
      console.error("Errore invio sollecito:", e.message);
      return json({ error: "Email non inviata: " + e.message }, 502);
    }
    rec.sollecitoInviato = new Date().toISOString();
    rec.sollecitoScadenza = scadenza.toISOString();
    rec.aggiornato = rec.sollecitoInviato;
    await store.setJSON(key, rec);
    return json({ ok: true, iscritto: rec });
  }

  if (risorsa === "rifiuto") {
    if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
    const body = await req.json().catch(() => ({}));
    const messaggio = typeof body.messaggio === "string" ? body.messaggio.slice(0, 2000) : "";
    if (body.anteprima) return json(costruisciRifiuto(rec, { messaggio }));
    try {
      await inviaRifiuto(rec, { messaggio });
    } catch (e) {
      console.error("Errore invio rifiuto:", e.message);
      return json({ error: "Email non inviata: " + e.message }, 502);
    }
    rec.stato = "rifiutato";
    rec.rifiutoInviato = new Date().toISOString();
    rec.aggiornato = rec.rifiutoInviato;
    await store.setJSON(key, rec);
    return json({ ok: true, iscritto: rec });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => ({}));
    if (body.stato !== undefined) {
      if (!STATI.includes(body.stato)) return json({ error: "Stato non valido" }, 400);
      rec.stato = body.stato;
    }
    if (typeof body.note === "string") rec.note = body.note.slice(0, 2000);
    if (body.pagamento === null) {
      delete rec.pagamento;
    } else if (body.pagamento && typeof body.pagamento === "object") {
      const importo = Number(body.pagamento.importo);
      const metodo = METODI_PAGAMENTO.includes(body.pagamento.metodo) ? body.pagamento.metodo : "Altro";
      const data = /^\d{4}-\d{2}-\d{2}$/.test(body.pagamento.data || "") ? body.pagamento.data : new Date().toISOString().slice(0, 10);
      if (!Number.isFinite(importo) || importo < 0 || importo > 10000) return json({ error: "Importo non valido" }, 400);
      const intestatario = typeof body.pagamento.intestatario === "string" ? body.pagamento.intestatario.trim().slice(0, 120) : "";
      rec.pagamento = { importo, metodo, data, intestatario, registrato: new Date().toISOString() };
    }
    rec.aggiornato = new Date().toISOString();
    await store.setJSON(key, rec);
    // Email di conferma definitiva (facoltativa) subito dopo aver registrato il pagamento
    let emailErrore = null;
    if (body.emailConfermaDefinitiva && rec.stato === "confermato" && rec.pagamento) {
      try {
        await inviaConfermaDefinitiva(rec);
        rec.confermaDefinitivaInviata = new Date().toISOString();
        await store.setJSON(key, rec);
      } catch (e) {
        console.error("Errore conferma definitiva:", e.message);
        emailErrore = e.message;
      }
    }
    return json({ ok: true, iscritto: rec, emailErrore });
  }

  if (req.method === "DELETE") {
    const fs = fotoStore();
    await Promise.all((rec.foto || []).map((k) => fs.delete(k)));
    await store.delete(key);
    return json({ ok: true });
  }

  return json({ error: "Metodo non consentito" }, 405);
};

export const config = { path: ["/api/admin/iscritti", "/api/admin/foto", "/api/admin/conferma", "/api/admin/rifiuto", "/api/admin/sollecito", "/api/admin/definitiva"] };
