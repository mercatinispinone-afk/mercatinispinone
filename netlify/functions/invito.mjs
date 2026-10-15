import { getStore } from "@netlify/blobs";
import { json, isAdmin } from "../lib/shared.mjs";
import { costruisciInvito, inviaInvito } from "../lib/mailer.mjs";

/**
 * Inviti/comunicazioni a una lista di contatti (area riservata)
 *  GET  /api/admin/invito  -> { inviati: { email: { ultimo, volte } } }
 *  POST /api/admin/invito  -> { oggetto, testo, destinatari: [{email, nome}], anteprima }
 *       max 8 destinatari per chiamata: il browser invia a blocchi e mostra l'avanzamento
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PER_CHIAMATA = 6;
// Errori con cui Gmail chiede di rallentare (troppi login / troppi messaggi)
const RE_LIMITE = /\b(454|421|550[ -]5\.4\.5|4\.7\.0)\b|too many|rate limit|daily user sending limit|try again later/i;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  if (!process.env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD non configurata su Netlify" }, 500);
  if (!isAdmin(req)) return json({ error: "Password errata" }, 401);
  const store = getStore({ name: "inviti", consistency: "strong" });

  if (req.method === "GET") {
    const reg = (await store.get("registro", { type: "json" })) || {};
    return json({ inviati: reg });
  }
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const body = await req.json().catch(() => ({}));
  const oggetto = typeof body.oggetto === "string" ? body.oggetto.slice(0, 200) : "";
  const testo = typeof body.testo === "string" ? body.testo.slice(0, 8000) : "";
  if (!oggetto.trim() || !testo.trim()) return json({ error: "Oggetto e testo sono obbligatori" }, 400);
  const siteUrl = process.env.URL || new URL(req.url).origin;

  const dest = (Array.isArray(body.destinatari) ? body.destinatari : [])
    .map((d) => ({ email: String(d?.email || "").trim().toLowerCase().slice(0, 120), nome: String(d?.nome || "").trim().slice(0, 80) }))
    .filter((d) => EMAIL_RE.test(d.email));

  if (body.anteprima) return json(costruisciInvito(dest[0] || { email: "", nome: "Mario" }, { oggetto, testo }, siteUrl));

  if (!dest.length) return json({ error: "Nessun destinatario valido" }, 400);
  if (dest.length > MAX_PER_CHIAMATA) return json({ error: `Massimo ${MAX_PER_CHIAMATA} destinatari per invio` }, 400);

  const risultati = [];
  let bloccato = false;
  for (const d of dest) {
    if (bloccato) {
      // Gmail ha chiesto una pausa: non insistiamo, il browser riproverà più tardi
      risultati.push({ email: d.email, ok: false, rinviato: true, errore: "in attesa (pausa richiesta da Gmail)" });
      continue;
    }
    try {
      await inviaInvito(d, { oggetto, testo }, siteUrl);
      risultati.push({ email: d.email, ok: true });
    } catch (e) {
      console.error("Invito non inviato a", d.email, e.message);
      if (RE_LIMITE.test(e.message)) {
        bloccato = true;
        risultati.push({ email: d.email, ok: false, rinviato: true, errore: "in attesa (pausa richiesta da Gmail)" });
      } else {
        risultati.push({ email: d.email, ok: false, errore: e.message });
      }
    }
    await pausa(300);
  }

  if (body.prova) return json({ ok: true, bloccato, risultati });
  const reg = (await store.get("registro", { type: "json" })) || {};
  const ora = new Date().toISOString();
  for (const r of risultati) if (r.ok) reg[r.email] = { ultimo: ora, volte: (reg[r.email]?.volte || 0) + 1 };
  await store.setJSON("registro", reg);

  return json({ ok: true, bloccato, risultati });
};

export const config = { path: "/api/admin/invito" };
