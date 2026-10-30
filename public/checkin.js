/* Check-in del giorno per lo staff (da telefono) */
(() => {
  const $ = (s) => document.querySelector(s);
  const KEY = "mercatini-staff-pin";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euro = (n) => "€ " + Number(n || 0).toFixed(2).replace(".", ",").replace(",00", "");
  const ora = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  let pin = "";
  try { pin = localStorage.getItem(KEY) || ""; } catch {}
  // giorno predefinito: domenica 6 dicembre se è quel giorno, altrimenti sabato
  const oggi = new Date();
  let giorno = oggi.getMonth() === 11 && oggi.getDate() === 6 ? "dom" : "sab";
  let filtro = "tutti";
  let espositori = [];
  let occupato = false;

  async function api(opts = {}) {
    const url = opts.method === "POST" ? "/api/checkin" : `/api/checkin?giorno=${giorno}`;
    const res = await fetch(url, { ...opts, headers: { "x-staff-pin": pin, "content-type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { esci(); throw new Error("PIN non valido"); }
    if (!res.ok) throw new Error(body.error || "Errore " + res.status);
    return body;
  }

  /* ---------- Accesso ---------- */
  $("#pinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    pin = $("#pin").value.trim();
    try { await carica(); try { localStorage.setItem(KEY, pin); } catch {} }
    catch (err) { const b = $("#pinErr"); b.textContent = err.message; b.classList.add("show"); }
  });
  function esci() {
    pin = "";
    try { localStorage.removeItem(KEY); } catch {}
    $("#app").hidden = true; $("#giorni").hidden = true; $("#esci").hidden = true; $("#pinForm").hidden = false;
  }
  $("#esci").onclick = esci;

  async function carica() {
    const r = await api();
    espositori = r.espositori;
    $("#pinForm").hidden = true; $("#app").hidden = false; $("#giorni").hidden = false; $("#esci").hidden = false;
    $("#agg").textContent = "Aggiornato alle " + ora(r.ora) + " · si aggiorna da solo ogni 30 secondi";
    render();
  }

  /* ---------- Giorno e filtri ---------- */
  document.querySelectorAll("#giorni button").forEach((b) => (b.onclick = () => { giorno = b.dataset.g; espositori = []; render(); carica().catch((e) => alert(e.message)); }));
  document.querySelectorAll("#filtri button").forEach((b) => (b.onclick = () => { filtro = b.dataset.f; render(); }));
  $("#q").addEventListener("input", render);

  const quotaCorrente = (e) => (e.tipo === "3" ? 20 : 5);
  const chiaveOrdine = (e) => (e.postazione ? e.postazione.label : "zzz");

  function render() {
    document.querySelectorAll("#giorni button").forEach((b) => b.classList.toggle("on", b.dataset.g === giorno));
    document.querySelectorAll("#filtri button").forEach((b) => b.classList.toggle("on", b.dataset.f === filtro));
    const arrivati = espositori.filter((e) => e.checkin).length;
    $("#cArr").textContent = `${arrivati}/${espositori.length}`;
    $("#cPag").textContent = espositori.filter((e) => !e.pagato).length;
    const incassato = espositori.reduce((s, e) => s + (e.correnteIncassata?.importo || 0) + (e.quotaInLoco || 0), 0);
    $("#cEuro").textContent = euro(incassato);

    const q = $("#q").value.trim().toLowerCase();
    const lista = espositori
      .filter((e) => {
        if (filtro === "mancanti" && e.checkin) return false;
        if (filtro === "arrivati" && !e.checkin) return false;
        if (filtro === "pagare" && e.pagato) return false;
        if (filtro === "corrente" && e.corrente !== "Sì") return false;
        if (!q) return true;
        return [e.nome, e.cognome, e.descrizione, e.postazione?.label].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => String(chiaveOrdine(a)).localeCompare(String(chiaveOrdine(b)), "it", { numeric: true }));

    $("#lista").innerHTML = lista.length ? lista.map(card).join("") : `<p class="vuoto">${espositori.length ? "Nessun espositore con questi filtri." : "Nessun espositore confermato per questo giorno."}</p>`;
  }

  function card(e) {
    const p = e.postazione;
    const pos = p ? `<div class="pos">${esc(p.label)}<small>${p.tipo === "asfalto" ? "asfalto" : "prato"}${p.corrente ? " ⚡" : ""}</small></div>` : '<div class="pos nessuna">senza<br>posto</div>';
    const bdg = [
      !e.pagato ? `<span class="bdg red">DA PAGARE ${euro(e.quota)}</span>` : '<span class="bdg ok">pagato</span>',
      e.corrente === "Sì" ? `<span class="bdg">⚡ corrente${e.correnteIncassata ? " · incassata" : " · da incassare"}</span>` : "",
      e.gazebo === "Sì" ? '<span class="bdg">gazebo</span>' : "",
      e.checkin ? `<span class="bdg ok">✓ arrivato ${ora(e.checkin.ora)}</span>` : "",
    ].join("");
    const azioni = [
      e.checkin
        ? `<button class="fatto" data-a="annulla" data-id="${esc(e.id)}" type="button">✓ Arrivato alle ${ora(e.checkin.ora)} · annulla</button>`
        : `<button class="arrivo" data-a="arrivato" data-id="${esc(e.id)}" type="button">✓ Segna arrivato</button>`,
      e.corrente === "Sì"
        ? (e.correnteIncassata
            ? `<button class="fatto" data-a="corrente-no" data-id="${esc(e.id)}" type="button">⚡ ${euro(e.correnteIncassata.importo)} incassati · annulla</button>`
            : `<button class="soldi" data-a="corrente" data-id="${esc(e.id)}" type="button">⚡ Incassa corrente ${euro(quotaCorrente(e))}</button>`)
        : "",
      !e.pagato ? `<button class="soldi" data-a="quota" data-id="${esc(e.id)}" type="button">€ Incassa quota ${euro(e.quota)}</button>` : "",
      `<a href="tel:${esc(e.telefono.replace(/\s/g, ""))}">📞 Chiama</a>`,
    ].join("");
    return `<div class="card${e.checkin ? " arr" : ""}">${pos}
      <div><div class="nome">${esc(e.cognome)} ${esc(e.nome)}</div><div class="merce">${esc(e.descrizione.slice(0, 80))}</div>${bdg}</div>
      <div class="azioni">${azioni}</div></div>`;
  }

  /* ---------- Azioni ---------- */
  $("#lista").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-a]");
    if (!b || occupato) return;
    const e = espositori.find((x) => x.id === b.dataset.id);
    let body = { id: e.id, giorno };
    switch (b.dataset.a) {
      case "arrivato": body.azione = "arrivato"; break;
      case "annulla": if (!confirm(`Annullare l'arrivo di ${e.nome} ${e.cognome}?`)) return; body.azione = "annulla"; break;
      case "corrente": {
        const v = prompt(`Importo incassato per la corrente da ${e.nome} ${e.cognome} (€):`, String(quotaCorrente(e)));
        if (v === null) return;
        body.azione = "corrente"; body.importo = parseFloat(v.replace(",", ".")) || 0; break;
      }
      case "corrente-no": if (!confirm("Annullare l'incasso della corrente?")) return; body.azione = "corrente"; body.annulla = true; break;
      case "quota": {
        const v = prompt(`Quota incassata in contanti da ${e.nome} ${e.cognome} (€):`, String(e.quota));
        if (v === null) return;
        body.azione = "quota"; body.importo = parseFloat(v.replace(",", ".")) || 0; break;
      }
    }
    occupato = true; b.disabled = true;
    try {
      const r = await api({ method: "POST", body: JSON.stringify(body) });
      Object.assign(e, r.espositore);
      render();
    } catch (err) { alert(err.message); b.disabled = false; }
    finally { occupato = false; }
  });

  setInterval(() => { if (pin && !occupato && !document.hidden) carica().catch(() => {}); }, 30000);
  if (pin) carica().catch(() => esci());
})();
