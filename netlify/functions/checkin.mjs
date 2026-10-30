import { iscrizioniStore, json, GIORNI } from "../lib/shared.mjs";
import { leggiConfig, staffAutorizzato } from "../lib/config.mjs";
import { leggiLayout } from "../lib/mappa.mjs";

/**
 * Check-in del giorno (staff, con PIN o password admin nell'header x-staff-pin)
 *  GET  /api/checkin?giorno=sab|dom   -> espositori del giorno con postazione e stato di arrivo
 *  POST /api/checkin                  -> { id, giorno, azione: "arrivato"|"annulla"|"corrente"|"quota"|"nota", importo, testo }
 */
const VISIBILI = ["confermato", "accettato"];
const pubblico = (r, giorno, layout) => {
  const pid = r.postazioni?.[giorno];
  const p = pid ? layout.postazioni.find((x) => x.id === pid) : null;
  return {
    id: r.id, nome: r.nome, cognome: r.cognome, telefono: r.telefono, tipo: r.tipo,
    descrizione: r.descrizione, gazebo: r.gazebo, corrente: r.corrente, stato: r.stato,
    pagato: !!r.pagamento,
    quotaInLoco: r.pagamento?.inLoco ? r.pagamento.importo : 0, quota: r.quotaConfermata ?? r.quotaStimata, giorni: r.giorniConfermati || r.giorni,
    postazione: p ? { label: p.label, tipo: p.tipo, corrente: p.corrente } : null,
    checkin: r.checkin?.[giorno] || null,
    correnteIncassata: r.correnteInLoco?.[giorno] || null,
    noteStaff: r.noteStaff?.[giorno] || "",
  };
};

export default async (req) => {
  const cfg = await leggiConfig();
  if (!staffAutorizzato(req, cfg)) return json({ error: "PIN non valido" }, 401);
  const store = iscrizioniStore();
  const layout = await leggiLayout();

  if (req.method === "GET") {
    const giorno = new URL(req.url).searchParams.get("giorno");
    if (!(giorno in GIORNI)) return json({ error: "Giorno non valido" }, 400);
    const { blobs } = await store.list({ prefix: "iscritti/" });
    const recs = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    const lista = recs.filter((r) => VISIBILI.includes(r.stato) && (r.giorniConfermati || r.giorni).includes(giorno)).map((r) => pubblico(r, giorno, layout));
    return json({ giorno, espositori: lista, ora: new Date().toISOString() });
  }

  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const b = await req.json().catch(() => ({}));
  if (!(b.giorno in GIORNI) || !/^[\w-]+$/.test(String(b.id || ""))) return json({ error: "Richiesta non valida" }, 400);
  const key = `iscritti/${b.id}`;
  const r = await store.get(key, { type: "json" });
  if (!r || !VISIBILI.includes(r.stato)) return json({ error: "Espositore non trovato" }, 404);
  const ora = new Date().toISOString();
  const importo = Math.max(0, Math.min(10000, Number(b.importo) || 0));
  switch (b.azione) {
    case "arrivato": r.checkin = { ...(r.checkin || {}), [b.giorno]: { ora } }; break;
    case "annulla": if (r.checkin) delete r.checkin[b.giorno]; break;
    case "corrente":
      if (b.annulla) { if (r.correnteInLoco) delete r.correnteInLoco[b.giorno]; }
      else r.correnteInLoco = { ...(r.correnteInLoco || {}), [b.giorno]: { importo, ora } };
      break;
    case "quota":
      // quota incassata in contanti all'arrivo: conferma definitiva
      if (r.pagamento) return json({ error: "Quota già registrata" }, 400);
      r.pagamento = { importo, metodo: "Contanti", data: ora.slice(0, 10), intestatario: "", registrato: ora, inLoco: true };
      r.stato = "confermato";
      break;
    case "nota": r.noteStaff = { ...(r.noteStaff || {}), [b.giorno]: String(b.testo || "").slice(0, 300) }; break;
    default: return json({ error: "Azione non valida" }, 400);
  }
  r.aggiornato = ora;
  await store.setJSON(key, r);
  return json({ ok: true, espositore: pubblico(r, b.giorno, layout) });
};

export const config = { path: "/api/checkin" };
