(() => {
  const $ = (s) => document.querySelector(s);
  const KEY = "mercatini-admin-pwd";
  let pwd = "";
  try { pwd = sessionStorage.getItem(KEY) || ""; } catch {}
  let dati = [];
  let sort = { k: "creato", dir: 1 };
  let corrente = null;

  const TIPI = { "1": "Non alimentari", "2": "Alimentari confezionati", "3": "Consumo in loco" };
  const TIPI_CSV = {
    "1": "1) Prodotti NON alimentari",
    "2": "2) Alimentari confezionati NON per consumo in loco",
    "3": "3) Alimentari per consumo diretto in loco",
  };
  const GIORNI = { sab: "Sab 5", dom: "Dom 6" };
  const STATI = { in_attesa: "In attesa", accettato: "Pre-confermato", confermato: "Confermato ✓", rifiutato: "Rifiutato" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euro = (n) => "€ " + Number(n || 0).toFixed(2).replace(".", ",");
  const data = (iso) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { "x-admin-password": pwd, "content-type": "application/json", ...(opts.headers || {}) } });
    if (res.status === 401) { esci(); throw new Error("Password errata"); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Errore " + res.status);
    return body;
  }

  /* ---------- Login ---------- */
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    pwd = $("#pwd").value;
    await carica(true);
  });
  function esci() {
    pwd = "";
    try { sessionStorage.removeItem(KEY); } catch {}
    $("#app").hidden = true; $("#topActions").hidden = true; $("#login").hidden = false;
  }
  $("#logout").onclick = esci;
  $("#reload").onclick = () => carica();

  async function carica(daLogin) {
    try {
      const r = await api("/api/admin/iscritti");
      dati = r.iscritti;
      try { sessionStorage.setItem(KEY, pwd); } catch {}
      $("#login").hidden = true; $("#app").hidden = false; $("#topActions").hidden = false;
      render();
    } catch (err) {
      if (daLogin || !$("#login").hidden) { const b = $("#loginErr"); b.textContent = err.message; b.classList.add("show"); }
      else alert(err.message);
    }
  }

  /* ---------- Filtri ---------- */
  function filtrati() {
    const q = $("#q").value.trim().toLowerCase();
    const t = $("#fTipo").value, g = $("#fGiorno").value, s = $("#fStato").value;
    return dati
      .filter((r) => {
        if (t && r.tipo !== t) return false;
        if (s && r.stato !== s) return false;
        if (g === "both" && r.giorni.length < 2) return false;
        if (g && g !== "both" && !r.giorni.includes(g)) return false;
        if (q) {
          const txt = [r.numero, r.codice, r.nome, r.cognome, r.email, r.telefono, r.descrizione, r.vicinoA, r.note].join(" ").toLowerCase();
          if (!txt.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const va = a[sort.k], vb = b[sort.k];
        return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "it")) * sort.dir;
      });
  }
  ["#q", "#fTipo", "#fGiorno", "#fStato"].forEach((s) => $(s).addEventListener("input", render));
  document.querySelectorAll("th[data-sort]").forEach((th) =>
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      sort = { k, dir: sort.k === k ? -sort.dir : 1 };
      render();
    })
  );

  /* ---------- Render ---------- */
  function render() {
    const tot = dati.length;
    const sab = dati.filter((r) => r.giorni.includes("sab")).length;
    const dom = dati.filter((r) => r.giorni.includes("dom")).length;
    const per = (t) => dati.filter((r) => r.tipo === t).length;
    const acc = dati.filter((r) => r.stato === "accettato");
    const conf = dati.filter((r) => r.stato === "confermato");
    const att = dati.filter((r) => r.stato === "in_attesa").length;
    const incassato = dati.reduce((s, r) => s + (r.pagamento?.importo || 0), 0);
    const daIncassare = acc.reduce((s, r) => s + (r.quotaConfermata ?? r.quotaStimata), 0);
    $("#stats").innerHTML = `
      <div class="stat"><div class="k">Iscritti</div><div class="v">${tot}</div><div class="s">${att} in attesa · ${acc.length} pre-conf. · ${conf.length} confermati</div></div>
      <div class="stat"><div class="k">Sabato 5</div><div class="v">${sab}</div><div class="s">espositori</div></div>
      <div class="stat"><div class="k">Domenica 6</div><div class="v">${dom}</div><div class="s">espositori</div></div>
      <div class="stat"><div class="k">Per tipo</div><div class="v" style="font-size:22px">${per("1")} · ${per("2")} · ${per("3")}</div><div class="s">tipo 1 · 2 · 3</div></div>
      <div class="stat"><div class="k">Incassato</div><div class="v" style="font-size:24px">${euro(incassato)}</div><div class="s">${conf.length} ${conf.length === 1 ? "pagamento" : "pagamenti"} · da incassare ${euro(daIncassare)}</div></div>`;

    const lista = filtrati();
    $("#empty").hidden = lista.length > 0;
    $("#rows").innerHTML = lista
      .map(
        (r) => `<tr data-id="${esc(r.id)}">
        <td><strong>${esc(r.numero)}</strong>${r.codice ? `<div class="sub">${esc(r.codice)}</div>` : ""}</td>
        <td class="sub">${data(r.creato)}</td>
        <td><strong>${esc(r.cognome)} ${esc(r.nome)}</strong>${r.giaPartecipato === "Sì" ? '<div class="sub">già partecipato</div>' : ""}${r.foto?.length ? `<div class="sub">📷 ${r.foto.length} foto</div>` : ""}</td>
        <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><div class="sub"><a href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a></div></td>
        <td><span class="tag t${r.tipo}">${r.tipo}) ${TIPI[r.tipo]}</span><div class="sub">${esc(r.descrizione.slice(0, 70))}${r.descrizione.length > 70 ? "…" : ""}</div></td>
        <td>${r.giorni.map((g) => `<span class="tag tg">${GIORNI[g]}</span>`).join("")}</td>
        <td class="sub">Gazebo: ${esc(r.gazebo)}<br>Corrente: ${esc(r.corrente)}<br>Asfalto: ${esc(r.asfalto)}</td>
        <td><strong>${euro(r.quotaStimata)}</strong></td>
        <td><select class="stato ${r.stato}" data-stato>${Object.entries(STATI).map(([k, v]) => `<option value="${k}" ${k === r.stato ? "selected" : ""}>${v}</option>`).join("")}</select>${r.stato === "accettato" ? `<div>${r.confermaInviata ? `<span class="tag ok" title="Pre-conferma inviata">✉ ${new Date(r.confermaInviata).toLocaleDateString("it-IT")}</span>` : ""}<button class="btn-pay" data-pay title="Registra il pagamento e conferma la postazione">€ Pagato?</button></div>` : ""}${r.stato === "confermato" && r.pagamento ? `<div><span class="tag paid" title="${esc(r.pagamento.metodo)}">€ ${esc(String(r.pagamento.importo))} · ${new Date(r.pagamento.data).toLocaleDateString("it-IT")}</span></div>` : ""}${r.stato === "rifiutato" && r.rifiutoInviato ? `<div><span class="tag no" title="Email di non selezione inviata">✉ ${new Date(r.rifiutoInviato).toLocaleDateString("it-IT")}</span></div>` : ""}</td>
        <td><button class="btn small ghost" data-open>Dettagli</button></td>
      </tr>`
      )
      .join("");
  }

  $("#rows").addEventListener("change", async (e) => {
    if (!e.target.matches("[data-stato]")) return;
    const id = e.target.closest("tr").dataset.id;
    const stato = e.target.value;
    if (stato === "accettato" || stato === "rifiutato" || stato === "confermato") {
      // Prima di cambiare stato apriamo il pannello della comunicazione (con o senza email)
      render();
      apri(id, stato);
      return;
    }
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ stato }) });
      Object.assign(dati.find((r) => r.id === id), iscritto);
      render();
    } catch (err) { alert(err.message); render(); }
  });
  $("#rows").addEventListener("click", (e) => {
    if (e.target.matches("[data-open]")) apri(e.target.closest("tr").dataset.id);
    if (e.target.matches("[data-pay]")) apri(e.target.closest("tr").dataset.id, "confermato");
  });

  /* ---------- Dettaglio ---------- */
  const dlg = $("#dlg");
  $("#dClose").onclick = () => dlg.close();
  dlg.addEventListener("close", () => document.querySelectorAll("#dFoto img").forEach((i) => URL.revokeObjectURL(i.src)));

  async function apri(id, focus) {
    const r = dati.find((x) => x.id === id);
    corrente = r;
    preparaConferma(r);
    preparaRifiuto(r);
    preparaPagamento(r);
    // Mostra solo il pannello pertinente; dai "Dettagli" quelli utili per lo stato attuale
    if (focus) {
      $("#conf").hidden = focus !== "accettato";
      $("#rif").hidden = focus !== "rifiutato";
      $("#pag").hidden = focus !== "confermato";
    } else {
      $("#conf").hidden = r.stato === "confermato";
      $("#rif").hidden = r.stato === "confermato";
      $("#pag").hidden = !["accettato", "confermato"].includes(r.stato);
    }
    $("#dTitle").textContent = `n. ${r.numero}${r.codice ? " · " + r.codice : ""} · ${r.nome} ${r.cognome}`;
    const righe = [
      ["Ricevuta il", data(r.creato)],
      ["Email", r.email + (r.emailInviata ? "  ✓ conferma inviata" : "  ⚠ email di conferma NON inviata")],
      ["Telefono", r.telefono],
      ["Già partecipato", r.giaPartecipato],
      ["Tipo di merce", TIPI_CSV[r.tipo]],
      ["Giorni", r.giorni.map((g) => (g === "sab" ? "Sabato 5 dicembre" : "Domenica 6 dicembre")).join(", ")],
      ["Descrizione", r.descrizione],
      ["Gazebo", r.gazebo],
      ["Corrente supplementare", r.corrente],
      ["Necessità asfalto", r.asfalto + (r.motivoAsfalto ? " – " + r.motivoAsfalto : "")],
      ["Vicino a", r.vicinoA || "—"],
      ["Quota indicativa", euro(r.quotaStimata)],
      ["Stato", STATI[r.stato]],
      ["Pagamento", r.pagamento ? `${euro(r.pagamento.importo)} · ${r.pagamento.metodo} · ${new Date(r.pagamento.data).toLocaleDateString("it-IT")}` : "—"],
    ];
    $("#dList").innerHTML = righe.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
    $("#dNote").value = r.note || "";
    const gal = $("#dFoto");
    gal.innerHTML = "";
    dlg.showModal();
    if (focus) $({ rifiutato: "#rif", confermato: "#pag" }[focus] || "#conf").scrollIntoView({ block: "start" });
    for (const key of r.foto || []) {
      try {
        const res = await fetch(`/api/admin/foto?key=${encodeURIComponent(key)}`, { headers: { "x-admin-password": pwd } });
        if (!res.ok) continue;
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url; a.target = "_blank";
        a.innerHTML = `<img alt="Foto banco">`;
        a.querySelector("img").src = url;
        gal.appendChild(a);
      } catch {}
    }
  }

  /* ---------- Pre-conferma ---------- */
  const quotaSpazio = (tipo, giorni) => (!giorni.length ? 0 : tipo === "3" ? 50 * giorni.length : giorni.length >= 2 ? 30 : 20);
  const giorniSel = () => [...document.querySelectorAll('input[name="cGiorni"]:checked')].map((c) => c.value);
  let quotaToccata = false;

  function preparaConferma(r) {
    const giorni = r.giorniConfermati || r.giorni;
    document.querySelectorAll('input[name="cGiorni"]').forEach((c) => (c.checked = giorni.includes(c.value)));
    $("#cQuota").value = r.quotaConfermata ?? quotaSpazio(r.tipo, giorni);
    quotaToccata = r.quotaConfermata != null;
    aggiornaHint();
    const st = $("#cStato");
    if (r.confermaInviata) {
      st.textContent = `✓ Pre-conferma inviata il ${data(r.confermaInviata)} · ${r.giorniConfermati.map((g) => GIORNI[g]).join(" + ")} · ${euro(r.quotaConfermata)}. Puoi reinviarla se cambi giorni o quota.`;
      st.className = "conf-stato sent";
      $("#cSend").textContent = "✉ Reinvia pre-conferma";
    } else {
      st.textContent = "Scegli i giorni assegnati e la quota: l'espositore riceverà l'email con le istruzioni di pagamento e verrà segnato come pre-confermato (da pagare).";
      st.className = "conf-stato";
      $("#cSend").textContent = "✉ Invia pre-conferma";
    }
    $("#cErr").classList.remove("show");
    $("#cFrame").hidden = true;
  }
  function aggiornaHint() {
    const r = corrente, g = giorniSel();
    const richiesti = r.giorni.map((x) => GIORNI[x]).join(" + ");
    $("#cQuotaHint").textContent = `Richiesti: ${richiesti} · tariffa standard ${euro(quotaSpazio(r.tipo, g))}` + (r.corrente === "Sì" ? " (+ corrente in loco)" : "");
  }
  document.querySelectorAll('input[name="cGiorni"]').forEach((c) =>
    c.addEventListener("change", () => {
      if (!quotaToccata) $("#cQuota").value = quotaSpazio(corrente.tipo, giorniSel());
      aggiornaHint();
      $("#cFrame").hidden = true;
    })
  );
  $("#cQuota").addEventListener("input", () => { quotaToccata = true; $("#cFrame").hidden = true; });

  function erroreConf(msg) { const b = $("#cErr"); b.textContent = msg; b.classList.add("show"); }
  function payloadConf(anteprima) {
    const giorni = giorniSel();
    const quota = Number($("#cQuota").value);
    if (!giorni.length) { erroreConf("Seleziona almeno un giorno."); return null; }
    if ($("#cQuota").value === "" || !(quota >= 0)) { erroreConf("Inserisci una quota valida."); return null; }
    $("#cErr").classList.remove("show");
    return { giorni, quota, anteprima };
  }

  $("#cPreview").onclick = async () => {
    const body = payloadConf(true);
    if (!body) return;
    try {
      const r = await api(`/api/admin/conferma?id=${encodeURIComponent(corrente.id)}`, { method: "POST", body: JSON.stringify(body) });
      const f = $("#cFrame");
      f.srcdoc = r.html;
      f.hidden = false;
      f.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) { erroreConf(err.message); }
  };

  $("#cSend").onclick = async () => {
    const body = payloadConf(false);
    if (!body) return;
    const testo = `Inviare l'email di pre-conferma a ${corrente.email}?\n\nGiorni: ${body.giorni.map((g) => GIORNI[g]).join(" + ")}\nQuota: ${euro(body.quota)}`;
    if (!confirm(testo)) return;
    const btn = $("#cSend");
    btn.disabled = true; const t = btn.textContent; btn.textContent = "Invio…";
    try {
      const { iscritto } = await api(`/api/admin/conferma?id=${encodeURIComponent(corrente.id)}`, { method: "POST", body: JSON.stringify(body) });
      Object.assign(corrente, iscritto);
      render();
      preparaConferma(corrente);
    } catch (err) { erroreConf(err.message); }
    finally { btn.disabled = false; if (btn.textContent === "Invio…") btn.textContent = t; }
  };

  $("#cNoMail").onclick = async () => {
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, { method: "PATCH", body: JSON.stringify({ stato: "accettato" }) });
      Object.assign(corrente, iscritto);
      dlg.close(); render();
    } catch (err) { erroreConf(err.message); }
  };

  /* ---------- Pagamento / conferma definitiva ---------- */
  const oggi = () => new Date().toISOString().slice(0, 10);
  function preparaPagamento(r) {
    const p = r.pagamento;
    $("#pImporto").value = p?.importo ?? r.quotaConfermata ?? r.quotaStimata;
    $("#pMetodo").value = p?.metodo || "Bonifico";
    $("#pData").value = p?.data || oggi();
    $("#pErr").classList.remove("show");
    const st = $("#pStato");
    $("#pag").classList.toggle("done", !!p);
    $("#pAnnulla").hidden = !p;
    if (p) {
      st.textContent = `✓ Postazione confermata: ricevuti ${euro(p.importo)} (${p.metodo}) il ${new Date(p.data).toLocaleDateString("it-IT")}.`;
      st.className = "conf-stato sent";
      $("#pSave").textContent = "✓ Aggiorna dati pagamento";
    } else {
      const dovuto = r.quotaConfermata != null ? `Quota richiesta nella pre-conferma: ${euro(r.quotaConfermata)}. ` : "";
      st.textContent = dovuto + "Quando ricevi il pagamento registralo qui: la postazione diventa confermata in via definitiva.";
      st.className = "conf-stato";
      $("#pSave").textContent = "✓ Pagamento ricevuto · conferma postazione";
    }
  }
  const errorePag = (msg) => { const b = $("#pErr"); b.textContent = msg; b.classList.add("show"); };
  $("#pSave").onclick = async () => {
    const importo = Number($("#pImporto").value);
    if ($("#pImporto").value === "" || !(importo >= 0)) return errorePag("Inserisci l'importo ricevuto.");
    if (corrente.quotaConfermata != null && importo < corrente.quotaConfermata &&
        !confirm(`L'importo (${euro(importo)}) è inferiore alla quota richiesta (${euro(corrente.quotaConfermata)}). Confermare comunque?`)) return;
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ stato: "confermato", pagamento: { importo, metodo: $("#pMetodo").value, data: $("#pData").value } }),
      });
      Object.assign(corrente, iscritto);
      dlg.close(); render();
    } catch (err) { errorePag(err.message); }
  };
  $("#pAnnulla").onclick = async () => {
    if (!confirm("Annullare il pagamento registrato? L'espositore tornerà pre-confermato (da pagare).")) return;
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, { method: "PATCH", body: JSON.stringify({ stato: "accettato", pagamento: null }) });
      delete corrente.pagamento;
      Object.assign(corrente, iscritto);
      dlg.close(); render();
    } catch (err) { errorePag(err.message); }
  };

  /* ---------- Non selezione ---------- */
  function preparaRifiuto(r) {
    $("#rMsg").value = "";
    $("#rErr").classList.remove("show");
    $("#rFrame").hidden = true;
    const st = $("#rStato");
    if (r.rifiutoInviato) {
      st.textContent = `✓ Email di non selezione inviata il ${data(r.rifiutoInviato)}.`;
      st.className = "conf-stato sent";
      $("#rSend").textContent = "✉ Reinvia email di non selezione";
    } else {
      st.textContent = "L'espositore riceverà un'email di ringraziamento in cui si spiega che non è stato selezionato e che terremo conto della candidatura per le prossime edizioni.";
      st.className = "conf-stato";
      $("#rSend").textContent = "✉ Invia email di non selezione";
    }
  }
  const erroreRif = (msg) => { const b = $("#rErr"); b.textContent = msg; b.classList.add("show"); };
  $("#rMsg").addEventListener("input", () => ($("#rFrame").hidden = true));

  $("#rPreview").onclick = async () => {
    try {
      const r = await api(`/api/admin/rifiuto?id=${encodeURIComponent(corrente.id)}`, { method: "POST", body: JSON.stringify({ messaggio: $("#rMsg").value, anteprima: true }) });
      const f = $("#rFrame");
      f.srcdoc = r.html; f.hidden = false;
      f.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) { erroreRif(err.message); }
  };
  $("#rSend").onclick = async () => {
    if (!confirm(`Inviare l'email di non selezione a ${corrente.email}?`)) return;
    const btn = $("#rSend");
    btn.disabled = true; const t = btn.textContent; btn.textContent = "Invio…";
    try {
      const { iscritto } = await api(`/api/admin/rifiuto?id=${encodeURIComponent(corrente.id)}`, { method: "POST", body: JSON.stringify({ messaggio: $("#rMsg").value }) });
      Object.assign(corrente, iscritto);
      render(); preparaRifiuto(corrente);
    } catch (err) { erroreRif(err.message); }
    finally { btn.disabled = false; if (btn.textContent === "Invio…") btn.textContent = t; }
  };
  $("#rNoMail").onclick = async () => {
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, { method: "PATCH", body: JSON.stringify({ stato: "rifiutato" }) });
      Object.assign(corrente, iscritto);
      dlg.close(); render();
    } catch (err) { erroreRif(err.message); }
  };

  $("#dSave").onclick = async () => {
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, { method: "PATCH", body: JSON.stringify({ note: $("#dNote").value }) });
      Object.assign(corrente, iscritto);
      dlg.close(); render();
    } catch (err) { alert(err.message); }
  };
  $("#dDel").onclick = async () => {
    if (!confirm(`Eliminare definitivamente l'iscrizione di ${corrente.nome} ${corrente.cognome}? L'operazione non si può annullare.`)) return;
    try {
      await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, { method: "DELETE" });
      dati = dati.filter((r) => r.id !== corrente.id);
      dlg.close(); render();
    } catch (err) { alert(err.message); }
  };

  /* ---------- CSV ---------- */
  $("#csv").onclick = () => {
    const cols = [
      ["N.", (r) => r.numero],
      ["Codice", (r) => r.codice || ""],
      ["Data iscrizione", (r) => data(r.creato)],
      ["Stato", (r) => STATI[r.stato]],
      ["Nome", (r) => r.nome],
      ["Cognome", (r) => r.cognome],
      ["Telefono", (r) => r.telefono],
      ["Email", (r) => r.email],
      ["Già partecipato", (r) => r.giaPartecipato],
      ["Tipo merce", (r) => TIPI_CSV[r.tipo]],
      ["Sabato 5", (r) => (r.giorni.includes("sab") ? "Sì" : "No")],
      ["Domenica 6", (r) => (r.giorni.includes("dom") ? "Sì" : "No")],
      ["Descrizione merce", (r) => r.descrizione],
      ["Gazebo", (r) => r.gazebo],
      ["Corrente supplementare", (r) => r.corrente],
      ["Necessità asfalto", (r) => r.asfalto],
      ["Motivazione asfalto", (r) => r.motivoAsfalto],
      ["Vicino a", (r) => r.vicinoA],
      ["Quota indicativa (€)", (r) => Number(r.quotaStimata).toFixed(2).replace(".", ",")],
      ["N. foto", (r) => r.foto?.length || 0],
      ["Email conferma inviata", (r) => (r.emailInviata ? "Sì" : "No")],
      ["Giorni confermati", (r) => (r.giorniConfermati || []).map((g) => GIORNI[g]).join(" + ")],
      ["Quota confermata (€)", (r) => (r.quotaConfermata != null ? Number(r.quotaConfermata).toFixed(2).replace(".", ",") : "")],
      ["Pre-conferma inviata", (r) => (r.confermaInviata ? data(r.confermaInviata) : "")],
      ["Pagato", (r) => (r.pagamento ? "Sì" : "No")],
      ["Importo pagato (€)", (r) => (r.pagamento ? Number(r.pagamento.importo).toFixed(2).replace(".", ",") : "")],
      ["Metodo pagamento", (r) => r.pagamento?.metodo || ""],
      ["Data pagamento", (r) => (r.pagamento ? new Date(r.pagamento.data).toLocaleDateString("it-IT") : "")],
      ["Email non selezione inviata", (r) => (r.rifiutoInviato ? data(r.rifiutoInviato) : "")],
      ["Note interne", (r) => r.note],
    ];
    const cell = (v) => {
      const s = String(v ?? "");
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => cell(c[0])).join(";"), ...filtrati().map((r) => cols.map((c) => cell(c[1](r))).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `iscritti-mercatini-spinone-2026-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (pwd) carica();
})();
