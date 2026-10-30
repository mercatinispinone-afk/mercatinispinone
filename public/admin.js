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
  const STATI = { in_attesa: "In attesa", lista: "Lista d'attesa", accettato: "Pre-confermato", confermato: "Confermato ✓", rifiutato: "Rifiutato", annullato: "Annullato" };

  /* Scadenze pagamento: 5 giorni lavorativi dalla pre-conferma, poi sollecito con 48 ore */
  const FESTIVI = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"];
  function scadenzaPagamento(iso, giorni = 5) {
    const d = new Date(iso); let n = 0;
    while (n < giorni) {
      d.setDate(d.getDate() + 1);
      const md = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (d.getDay() !== 0 && d.getDay() !== 6 && !FESTIVI.includes(md)) n++;
    }
    d.setHours(23, 59, 59, 0);
    return d;
  }
  /** Situazione pagamento di un pre-confermato: null | in_tempo | scaduto | sollecitato | sollecito_scaduto */
  function statoPagamento(r) {
    if (r.stato !== "accettato" || r.pagamento || !r.confermaInviata) return null;
    const ora = Date.now();
    if (r.sollecitoInviato) return { tipo: ora > new Date(r.sollecitoScadenza) ? "sollecito_scaduto" : "sollecitato", data: new Date(r.sollecitoScadenza) };
    const sc = scadenzaPagamento(r.confermaInviata);
    return { tipo: ora > sc ? "scaduto" : "in_tempo", data: sc };
  }
  const ggmm = (d) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
  const ggmmhh = (d) => d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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
      if (window.MA?.dopoCarica) window.MA.dopoCarica();
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
        if (s === "_scaduti") { if (statoPagamento(r)?.tipo !== "scaduto" && statoPagamento(r)?.tipo !== "sollecito_scaduto") return false; }
        else if (s && r.stato !== s) return false;
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
    renderInterno();
    if (window.MA?.dopoRender) window.MA.dopoRender();
  }
  function renderInterno() {
    const tot = dati.length;
    const sab = dati.filter((r) => r.giorni.includes("sab")).length;
    const dom = dati.filter((r) => r.giorni.includes("dom")).length;
    const per = (t) => dati.filter((r) => r.tipo === t).length;
    const acc = dati.filter((r) => r.stato === "accettato");
    const conf = dati.filter((r) => r.stato === "confermato");
    const att = dati.filter((r) => r.stato === "in_attesa").length;
    const nLista = dati.filter((r) => r.stato === "lista").length;
    const incassato = dati.reduce((s, r) => s + (r.pagamento?.importo || 0) + (r.correnteInLoco?.sab?.importo || 0) + (r.correnteInLoco?.dom?.importo || 0), 0);
    const daIncassare = acc.reduce((s, r) => s + (r.quotaConfermata ?? r.quotaStimata), 0);
    $("#stats").innerHTML = `
      <div class="stat"><div class="k">Iscritti</div><div class="v">${tot}</div><div class="s">${att} in attesa · ${acc.length} pre-conf. · ${conf.length} confermati${nLista ? ` · ${nLista} in lista` : ""}</div></div>
      <div class="stat"><div class="k">Sabato 5</div><div class="v">${sab}</div><div class="s">espositori</div></div>
      <div class="stat"><div class="k">Domenica 6</div><div class="v">${dom}</div><div class="s">espositori</div></div>
      <div class="stat"><div class="k">Per tipo</div><div class="v" style="font-size:22px">${per("1")} · ${per("2")} · ${per("3")}</div><div class="s">tipo 1 · 2 · 3</div></div>
      <div class="stat"><div class="k">Incassato</div><div class="v" style="font-size:24px">${euro(incassato)}</div><div class="s">${conf.length} ${conf.length === 1 ? "pagamento" : "pagamenti"} · da incassare ${euro(daIncassare)}</div></div>`;

    const nScaduti = dati.filter((r) => statoPagamento(r)?.tipo === "scaduto").length;
    $("#solTutti").hidden = !nScaduti;
    $("#solTutti").textContent = `⏰ Sollecita scaduti (${nScaduti})`;
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
        <td class="sub">Gazebo: ${esc(r.gazebo)}<br>Corrente: ${esc(r.corrente)}<br>Asfalto: ${esc(r.asfalto)}${window.MA?.labelPostazioni ? window.MA.labelPostazioni(r) : ""}</td>
        <td><strong>${euro(r.quotaStimata)}</strong></td>
        <td><select class="stato ${r.stato}" data-stato>${Object.entries(STATI).map(([k, v]) => `<option value="${k}" ${k === r.stato ? "selected" : ""}>${v}</option>`).join("")}</select>${r.stato === "accettato" ? `<div>${r.confermaInviata ? `<span class="tag ok" title="Pre-conferma inviata">✉ ${new Date(r.confermaInviata).toLocaleDateString("it-IT")}</span>` : ""}<button class="btn-pay" data-pay title="Registra il pagamento e conferma la postazione">€ Pagato?</button>${badgePagamento(r)}</div>` : ""}${r.stato === "confermato" && r.pagamento ? `<div><span class="tag paid" title="${esc(r.pagamento.metodo)}">€ ${esc(String(r.pagamento.importo))} · ${new Date(r.pagamento.data).toLocaleDateString("it-IT")}</span>${r.confermaDefinitivaInviata ? ` <span class="tag ok" title="Email di conferma definitiva inviata">✉</span>` : ""}</div>` : ""}${r.stato === "lista" ? `<div><span class="tag" style="background:#fde2bf;color:#7a4510" title="Posizione in lista d'attesa">#${posLista(r)} in lista</span></div>` : ""}${["sab", "dom"].filter((g) => r.checkin?.[g]).map((g) => `<div><span class="tag arr" title="Arrivato alle ${new Date(r.checkin[g].ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}">✓ arrivato ${g === "sab" ? "sab" : "dom"}</span></div>`).join("")}${r.stato === "rifiutato" && r.rifiutoInviato ? `<div><span class="tag no" title="Email di non selezione inviata">✉ ${new Date(r.rifiutoInviato).toLocaleDateString("it-IT")}</span></div>` : ""}</td>
        <td><button class="btn small ghost" data-open>Dettagli</button></td>
      </tr>`
      )
      .join("");
  }

  function badgePagamento(r) {
    const sp = statoPagamento(r);
    if (!sp) return "";
    if (sp.tipo === "in_tempo") return `<div><span class="tag" style="background:#efe2c2;color:#5b1f24" title="Scadenza pagamento (5 giorni lavorativi)">entro ${ggmm(sp.data)}</span></div>`;
    if (sp.tipo === "scaduto") return `<div><button class="btn-pay" data-sol style="border-color:var(--red);color:var(--red)" title="Scaduto il ${ggmm(sp.data)}">⏰ Sollecita</button></div>`;
    if (sp.tipo === "sollecitato") return `<div><span class="tag warn" title="Sollecito inviato">⏰ fino al ${ggmmhh(sp.data)}</span></div>`;
    return `<div><button class="btn-pay" data-sol style="border-color:var(--red);background:var(--red);color:#fff" title="Le 48 ore del sollecito sono passate">⛔ 48h scadute</button></div>`;
  }

  $("#rows").addEventListener("change", async (e) => {
    if (!e.target.matches("[data-stato]")) return;
    const id = e.target.closest("tr").dataset.id;
    const stato = e.target.value;
    if (stato === "accettato" || stato === "rifiutato" || stato === "confermato" || stato === "annullato") {
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
    if (e.target.matches("[data-sol]")) apri(e.target.closest("tr").dataset.id, "sollecito");
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
    preparaSollecito(r);
    const daPagare = r.stato === "accettato" && !r.pagamento && !!r.confermaInviata;
    // Mostra solo il pannello pertinente; dai "Dettagli" quelli utili per lo stato attuale
    if (focus) {
      $("#conf").hidden = focus !== "accettato";
      $("#rif").hidden = focus !== "rifiutato";
      $("#pag").hidden = focus !== "confermato";
      $("#sol").hidden = !(focus === "sollecito" || focus === "annullato");
    } else {
      $("#conf").hidden = ["confermato", "annullato"].includes(r.stato);
      $("#rif").hidden = ["confermato", "annullato"].includes(r.stato);
      $("#pag").hidden = !["accettato", "confermato"].includes(r.stato);
      $("#sol").hidden = !daPagare;
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
      ["Pagamento", r.pagamento ? `${euro(r.pagamento.importo)} · ${r.pagamento.metodo} · ${new Date(r.pagamento.data).toLocaleDateString("it-IT")}${r.pagamento.intestatario ? " · intestato a " + r.pagamento.intestatario : ""}` : "—"],
    ];
    $("#dList").innerHTML = righe.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
    $("#dNote").value = r.note || "";
    const gal = $("#dFoto");
    gal.innerHTML = "";
    dlg.showModal();
    if (focus) $({ rifiutato: "#rif", confermato: "#pag", sollecito: "#sol", annullato: "#sol" }[focus] || "#conf").scrollIntoView({ block: "start" });
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
    $("#pInt").value = p?.intestatario || "";
    $("#pFrame").hidden = true;
    $("#pEmail").checked = !r.confermaDefinitivaInviata;
    $("#pEmailLbl").textContent = r.confermaDefinitivaInviata
      ? `Reinvia l'email di conferma definitiva (già inviata il ${data(r.confermaDefinitivaInviata)})`
      : "Invia all'espositore l'email di conferma definitiva";
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
      const { iscritto, emailErrore } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ stato: "confermato", emailConfermaDefinitiva: $("#pEmail").checked, pagamento: { importo, metodo: $("#pMetodo").value, data: $("#pData").value, intestatario: $("#pInt").value } }),
      });
      Object.assign(corrente, iscritto);
      dlg.close(); render();
      if (emailErrore) alert("Pagamento registrato, ma l'email di conferma non è partita: " + emailErrore + "\nPuoi reinviarla dalla scheda.");
    } catch (err) { errorePag(err.message); }
  };
  $("#pPreview").onclick = async () => {
    try {
      const r = await api(`/api/admin/definitiva?id=${encodeURIComponent(corrente.id)}`, { method: "POST", body: JSON.stringify({ anteprima: true, importo: Number($("#pImporto").value) }) });
      const f = $("#pFrame"); f.srcdoc = r.html; f.hidden = false;
      f.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  /* ---------- Sollecito pagamento ---------- */
  function preparaSollecito(r) {
    $("#sErr").classList.remove("show");
    $("#sFrame").hidden = true;
    const st = $("#sStato");
    const sp = statoPagamento(r);
    st.className = "conf-stato";
    $("#sSend").hidden = false;
    if (!sp) {
      st.textContent = r.stato === "annullato" ? "Prenotazione annullata." : "Nessun pagamento in sospeso per questo espositore.";
      $("#sSend").hidden = true;
      return;
    }
    if (sp.tipo === "in_tempo") st.textContent = `Pre-conferma inviata il ${data(r.confermaInviata)}: c'è tempo per pagare fino a ${sp.data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} (5 giorni lavorativi). Puoi comunque inviare il sollecito.`;
    if (sp.tipo === "scaduto") st.innerHTML = `<strong style="color:var(--red)">Termine scaduto il ${sp.data.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}.</strong> Il sollecito chiede di pagare entro 48 ore (o di comunicare l'intestatario se ha già pagato); dopo puoi annullare la prenotazione e passare alla lista d'attesa.`;
    if (sp.tipo === "sollecitato") st.textContent = `Sollecito inviato il ${data(r.sollecitoInviato)}: le 48 ore scadono il ${ggmmhh(sp.data)}.`;
    if (sp.tipo === "sollecito_scaduto") st.innerHTML = `<strong style="color:var(--red)">Le 48 ore del sollecito sono scadute (${ggmmhh(sp.data)}).</strong> Se il pagamento non è arrivato puoi annullare la prenotazione.`;
    $("#sSend").textContent = r.sollecitoInviato ? "⏰ Reinvia sollecito (nuove 48 ore)" : "⏰ Invia sollecito (48 ore)";
  }
  const erroreSol = (msg) => { const b = $("#sErr"); b.textContent = msg; b.classList.add("show"); };
  $("#sPreview").onclick = async () => {
    try {
      const r = await api(`/api/admin/sollecito?id=${encodeURIComponent(corrente.id)}`, { method: "POST", body: JSON.stringify({ anteprima: true }) });
      const f = $("#sFrame"); f.srcdoc = r.html; f.hidden = false;
      f.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) { erroreSol(err.message); }
  };
  async function inviaSollecito(r) {
    const { iscritto } = await api(`/api/admin/sollecito?id=${encodeURIComponent(r.id)}`, { method: "POST", body: "{}" });
    Object.assign(r, iscritto);
  }
  $("#sSend").onclick = async () => {
    if (!confirm(`Inviare il sollecito di pagamento a ${corrente.email}?\nAvrà 48 ore per pagare o comunicare l'intestatario.`)) return;
    const btn = $("#sSend"); btn.disabled = true;
    try { await inviaSollecito(corrente); render(); preparaSollecito(corrente); }
    catch (err) { erroreSol(err.message); }
    finally { btn.disabled = false; }
  };
  /* ---------- Lista d'attesa ---------- */
  const inLista = () => dati.filter((r) => r.stato === "lista").sort((a, b) => a.creato.localeCompare(b.creato));
  function posLista(r) { return inLista().findIndex((x) => x.id === r.id) + 1; }
  /** Dopo che si è liberato un posto, propone il subentro al primo della lista che partecipa negli stessi giorni */
  function proponiSubentro(liberato) {
    const giorni = liberato.giorniConfermati || liberato.giorni;
    const lista = inLista();
    if (!lista.length) return;
    const primo = lista.find((r) => r.giorni.some((g) => giorni.includes(g))) || lista[0];
    const TIPI_BREVI = { "1": "non alimentari", "2": "alimentari confezionati", "3": "consumo in loco" };
    if (!confirm(`Si è liberato il posto di ${liberato.nome} ${liberato.cognome}.\n\nPrimo in lista d'attesa: ${primo.nome} ${primo.cognome}\n${TIPI_BREVI[primo.tipo]} · ${primo.descrizione.slice(0, 60)}\n\nVuoi proporgli il posto? (si apre la pre-conferma, con anteprima prima dell'invio)`)) return;
    setTimeout(() => apri(primo.id, "accettato"), 50);
  }

  $("#sAnnulla").onclick = async () => {
    const sp = statoPagamento(corrente);
    const avviso = sp?.tipo === "sollecitato" ? "\n\nAttenzione: le 48 ore del sollecito non sono ancora scadute." : "";
    if (!confirm(`Annullare la prenotazione di ${corrente.nome} ${corrente.cognome}? La postazione torna libera per la lista d'attesa.${avviso}`)) return;
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, { method: "PATCH", body: JSON.stringify({ stato: "annullato" }) });
      Object.assign(corrente, iscritto);
      dlg.close(); render();
      proponiSubentro(corrente);
    } catch (err) { erroreSol(err.message); }
  };
  // Sollecito a tutti i pagamenti scaduti (non ancora sollecitati)
  $("#solTutti").onclick = async () => {
    const lista = dati.filter((r) => statoPagamento(r)?.tipo === "scaduto");
    if (!lista.length) return;
    if (!confirm(`Inviare il sollecito di pagamento (48 ore) a ${lista.length} espositori con il termine scaduto?\n\n${lista.map((r) => "• " + r.nome + " " + r.cognome).join("\n")}`)) return;
    const btn = $("#solTutti"); btn.disabled = true;
    let ok = 0; const errori = [];
    for (const r of lista) {
      btn.textContent = `Invio ${ok + errori.length + 1} di ${lista.length}…`;
      try { await inviaSollecito(r); ok++; } catch (err) { errori.push(`${r.nome} ${r.cognome}: ${err.message}`); }
      await new Promise((res) => setTimeout(res, 1500));
    }
    btn.disabled = false; render();
    alert(`Solleciti inviati: ${ok}` + (errori.length ? `\nNon inviati:\n${errori.join("\n")}` : ""));
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
    const liberaPosto = ["accettato", "confermato"].includes(corrente.stato);
    const btn = $("#rSend");
    btn.disabled = true; const t = btn.textContent; btn.textContent = "Invio…";
    try {
      const { iscritto } = await api(`/api/admin/rifiuto?id=${encodeURIComponent(corrente.id)}`, { method: "POST", body: JSON.stringify({ messaggio: $("#rMsg").value }) });
      Object.assign(corrente, iscritto);
      render(); preparaRifiuto(corrente);
      if (liberaPosto) { dlg.close(); proponiSubentro(corrente); }
    } catch (err) { erroreRif(err.message); }
    finally { btn.disabled = false; if (btn.textContent === "Invio…") btn.textContent = t; }
  };
  $("#rNoMail").onclick = async () => {
    const liberaPosto = ["accettato", "confermato"].includes(corrente.stato);
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(corrente.id)}`, { method: "PATCH", body: JSON.stringify({ stato: "rifiutato" }) });
      Object.assign(corrente, iscritto);
      dlg.close(); render();
      if (liberaPosto) proponiSubentro(corrente);
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
      ["Intestatario pagamento", (r) => r.pagamento?.intestatario || ""],
      ["Scadenza pagamento", (r) => (r.confermaInviata && !r.pagamento && r.stato === "accettato" ? ggmm(scadenzaPagamento(r.confermaInviata)) : "")],
      ["Sollecito inviato", (r) => (r.sollecitoInviato ? data(r.sollecitoInviato) : "")],
      ["Data pagamento", (r) => (r.pagamento ? new Date(r.pagamento.data).toLocaleDateString("it-IT") : "")],
      ["Conferma definitiva inviata", (r) => (r.confermaDefinitivaInviata ? data(r.confermaDefinitivaInviata) : "")],
      ["Postazione sabato", (r) => window.MA?.labelPlain?.(r, "sab") || ""],
      ["Postazione domenica", (r) => window.MA?.labelPlain?.(r, "dom") || ""],
      ["Email non selezione inviata", (r) => (r.rifiutoInviato ? data(r.rifiutoInviato) : "")],
      ["Posizione lista d'attesa", (r) => (r.stato === "lista" ? posLista(r) : "")],
      ["Arrivato sabato", (r) => (r.checkin?.sab ? new Date(r.checkin.sab.ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "")],
      ["Arrivato domenica", (r) => (r.checkin?.dom ? new Date(r.checkin.dom.ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "")],
      ["Corrente incassata in loco (€)", (r) => { const t = ["sab", "dom"].reduce((s, g) => s + (r.correnteInLoco?.[g]?.importo || 0), 0); return t ? t.toFixed(2).replace(".", ",") : ""; }],
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

  /* ---------- Invito a una lista ---------- */
  const inv = $("#inv");
  const TESTO_INVITO = `Ciao {nome},

torna Natale a Spinone! Sabato 5 e domenica 6 dicembre 2026, dalle 10 alle 18, l'area Borgo del Cigno di Spinone al Lago ospiterà di nuovo i Mercatini di Natale in riva al lago, con street food, vin brulé e la pista di pattinaggio al parco.

Ci farebbe molto piacere averti di nuovo tra gli espositori. Le iscrizioni sono aperte: basta compilare il modulo online, ci vogliono pochi minuti.

[ISCRIVITI]

Le richieste vengono valutate in base alla tipologia merceologica e all'ordine di arrivo, quindi ti consigliamo di non aspettare troppo.

Per qualsiasi domanda puoi rispondere direttamente a questa email.

A presto!
Staff
Mercatini di Spinone al Lago`;
  const OGGETTO_INVITO = "Mercatini di Natale a Spinone al Lago · 5 e 6 dicembre 2026: iscrizioni aperte";
  const RE_MAIL = /[^\s@;,<>"'()]+@[^\s@;,<>"'()]+\.[a-z]{2,}/i;
  let registroInviti = {};
  let listaFile = []; // da Excel/CSV
  let destinatari = [];

  // La stessa finestra serve per due cose: "invito" (lista esterna) e "comunicazione" (iscritti)
  let modo = "invito";
  const testi = { invito: { oggetto: OGGETTO_INVITO, testo: TESTO_INVITO }, comunicazione: { oggetto: "Mercatini di Natale Spinone al Lago – ", testo: "Ciao {nome},\n\n\n\nA presto!\nStaff\nMercatini di Spinone al Lago" } };
  function apriInvio(m) {
    testi[modo] = { oggetto: $("#iOgg").value || testi[modo].oggetto, testo: $("#iTxt").value || testi[modo].testo };
    modo = m;
    $("#iOgg").value = testi[m].oggetto; $("#iTxt").value = testi[m].testo;
    $("#iTitle").textContent = m === "invito" ? "Invia invito a una lista" : "Scrivi agli espositori";
    $("#iSrcInv").hidden = m !== "invito"; $("#iSrcCom").hidden = m === "invito"; $("#iHintIscr").hidden = m !== "invito";
    $("#iFrame").hidden = true; $("#iLog").innerHTML = ""; $("#iProg").hidden = true; $("#iErr").classList.remove("show");
    calcolaDestinatari();
    inv.showModal();
  }
  $("#openInv").onclick = async () => {
    try { registroInviti = (await api("/api/admin/invito")).inviati || {}; } catch {}
    apriInvio("invito");
  };
  $("#openCom").onclick = () => apriInvio("comunicazione");
  document.querySelectorAll(".cStati").forEach((c) => c.addEventListener("change", calcolaDestinatari));
  $("#cGiorno").addEventListener("change", calcolaDestinatari);
  $("#iClose").onclick = () => inv.close();

  const pulisciNome = (s) => String(s || "").replace(RE_MAIL, "").replace(/[;,<>"\t]+/g, " ").replace(/\s+/g, " ").trim();

  function righeDaTesto(txt) {
    return txt.split(/\r?\n/).map((riga) => {
      const m = riga.match(RE_MAIL);
      return m ? { email: m[0].toLowerCase(), nome: pulisciNome(riga).split(" ")[0] } : null;
    }).filter(Boolean);
  }

  function righeDaTabella(rows) {
    if (!rows.length) return [];
    const head = rows[0].map((h) => String(h || "").toLowerCase().trim());
    const hasHead = head.some((h) => /mail|nome|name/.test(h)) && !head.some((h) => RE_MAIL.test(h));
    let iMail = head.findIndex((h) => /mail/.test(h));
    let iNome = head.findIndex((h) => /^(nome|name|first)/.test(h) || (h.includes("nome") && !h.includes("cognome")));
    const corpo = hasHead ? rows.slice(1) : rows;
    return corpo.map((r) => {
      let email = iMail >= 0 && hasHead ? String(r[iMail] || "") : "";
      if (!RE_MAIL.test(email)) email = (r.map(String).find((c) => RE_MAIL.test(c)) || "");
      const m = email.match(RE_MAIL);
      if (!m) return null;
      const nome = iNome >= 0 && hasHead ? String(r[iNome] || "").trim().split(/\s+/)[0] : "";
      return { email: m[0].toLowerCase(), nome };
    }).filter(Boolean);
  }

  function parseCSV(txt) {
    const sep = (txt.split("\n")[0].match(/;/g) || []).length >= (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
    return txt.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
  }

  function caricaSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "/vendor/xlsx.full.min.js";
      s.onload = res; s.onerror = () => rej(new Error("Impossibile leggere il file Excel: salvalo come CSV e riprova."));
      document.head.appendChild(s);
    });
  }

  $("#iFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      let rows;
      if (/\.xlsx?$/i.test(f.name)) {
        await caricaSheetJS();
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      } else {
        rows = parseCSV(await f.text());
      }
      listaFile = righeDaTabella(rows);
      $("#iFileName").textContent = `${f.name} · ${listaFile.length} indirizzi trovati`;
    } catch (err) { erroreInv(err.message); }
    e.target.value = "";
    calcolaDestinatari();
  });
  ["#iList"].forEach((s) => $(s).addEventListener("input", calcolaDestinatari));
  ["#iSkipIscritti", "#iSkipInviati"].forEach((s) => $(s).addEventListener("change", calcolaDestinatari));

  function calcolaDestinatari() {
    if (modo === "comunicazione") {
      const stati = [...document.querySelectorAll(".cStati:checked")].map((c) => c.value);
      const g = $("#cGiorno").value;
      destinatari = dati
        .filter((r) => stati.includes(r.stato) && (!g || (r.giorniConfermati || r.giorni).includes(g)))
        .map((r) => ({ email: r.email, nome: r.nome }));
      $("#iSum").innerHTML = destinatari.length ? `${destinatari.length} destinatari` : "Nessun destinatario con questi filtri.";
      $("#iSend").textContent = destinatari.length ? `✉ Invia a ${destinatari.length}` : "✉ Invia";
      return;
    }
    const tutti = [...listaFile, ...righeDaTesto($("#iList").value)];
    const visti = new Map();
    for (const d of tutti) if (!visti.has(d.email) || (!visti.get(d.email).nome && d.nome)) visti.set(d.email, d);
    const iscritti = new Set(dati.map((r) => r.email.toLowerCase()));
    let escIscr = 0, escInv = 0;
    destinatari = [...visti.values()].filter((d) => {
      if ($("#iSkipIscritti").checked && iscritti.has(d.email)) { escIscr++; return false; }
      if ($("#iSkipInviati").checked && registroInviti[d.email]) { escInv++; return false; }
      return true;
    });
    const doppi = tutti.length - visti.size;
    const note = [doppi && `${doppi} doppioni rimossi`, escIscr && `${escIscr} già iscritti esclusi`, escInv && `${escInv} già invitati esclusi`].filter(Boolean).join(" · ");
    $("#iSum").innerHTML = destinatari.length
      ? `${destinatari.length} destinatari` + (note ? `<small>${note}</small>` : "")
      : "Nessun destinatario." + (note ? `<small>${note}</small>` : "");
    $("#iSend").textContent = destinatari.length ? `📣 Invia a ${destinatari.length}` : "📣 Invia a tutti";
  }

  const erroreInv = (msg) => { const b = $("#iErr"); b.textContent = msg; b.classList.add("show"); };
  const msgInv = () => ({ oggetto: $("#iOgg").value, testo: $("#iTxt").value, tipo: modo });

  $("#iPreview").onclick = async () => {
    $("#iErr").classList.remove("show");
    try {
      const esempio = destinatari[0] || { email: "esempio@example.com", nome: "Mario" };
      const r = await api("/api/admin/invito", { method: "POST", body: JSON.stringify({ ...msgInv(), destinatari: [esempio], anteprima: true }) });
      const f = $("#iFrame");
      f.srcdoc = `<div style="font:13px Arial;color:#6b4a3a;padding:10px 14px">Oggetto: <b>${esc(r.subject)}</b> · esempio per ${esc(esempio.nome || esempio.email)}</div>` + r.html;
      f.hidden = false;
    } catch (err) { erroreInv(err.message); }
  };

  let fermato = false;
  async function inviaLista(lista, { registra = true } = {}) {
    const log = $("#iLog"), bar = $("#iBar");
    $("#iProg").hidden = false; log.innerHTML = ""; bar.style.width = "0";
    $("#iErr").classList.remove("show");
    ["#iSend", "#iTest", "#iClose"].forEach((s) => ($(s).disabled = true));
    // Invio lento e regolare per non far scattare i limiti di Gmail:
    // blocchi da 6 email (una sola connessione/login per blocco) e pausa tra un blocco e l'altro.
    const BLOCCO = 6, PAUSA_MS = 12000, PAUSE_LIMITE = [120, 300, 600]; // secondi di attesa se Gmail frena
    const stato = (t) => { $("#iStato").textContent = t; };
    const attendi = async (sec, msg) => {
      for (let s = sec; s > 0 && !fermato; s--) { stato(`${msg} · riprendo tra ${s >= 60 ? Math.ceil(s / 60) + " min" : s + " s"}`); await new Promise((r) => setTimeout(r, 1000)); }
    };
    let ok = 0, ko = 0, tentativiLimite = 0;
    fermato = false;
    $("#iStop").hidden = false;
    const coda = [...lista];
    const totale = coda.length;
    try {
      while (coda.length && !fermato) {
        const blocco = coda.slice(0, BLOCCO);
        stato(`Invio in corso… ${ok} di ${totale}`);
        let res;
        try {
          res = await api("/api/admin/invito", { method: "POST", body: JSON.stringify({ ...msgInv(), destinatari: blocco, prova: !registra }) });
        } catch (err) {
          res = { bloccato: true, risultati: blocco.map((d) => ({ email: d.email, ok: false, rinviato: true, errore: err.message })) };
        }
        for (const r of res.risultati) {
          if (r.ok) {
            ok++;
            coda.splice(coda.findIndex((d) => d.email === r.email), 1);
            if (registra) registroInviti[r.email] = { ultimo: new Date().toISOString() };
            log.insertAdjacentHTML("afterbegin", `<div>✓ ${esc(r.email)}</div>`);
          } else if (!r.rinviato) {
            ko++;
            coda.splice(coda.findIndex((d) => d.email === r.email), 1);
            log.insertAdjacentHTML("afterbegin", `<div class="ko">✗ ${esc(r.email)} – ${esc(r.errore)}</div>`);
          }
        }
        bar.style.width = Math.round(((totale - coda.length) / totale) * 100) + "%";
        if (!coda.length) break;
        if (res.bloccato) {
          if (tentativiLimite >= PAUSE_LIMITE.length) {
            log.insertAdjacentHTML("afterbegin", `<div class="ko">Gmail continua a chiedere di rallentare: invio sospeso. Riprova tra qualche ora (o domani): chi ha già ricevuto l'invito verrà saltato.</div>`);
            break;
          }
          const sec = PAUSE_LIMITE[tentativiLimite++];
          log.insertAdjacentHTML("afterbegin", `<div style="color:var(--orange);font-weight:700">⏸ Gmail chiede una pausa: attendo ${Math.round(sec / 60)} minuti e riprendo da solo.</div>`);
          await attendi(sec, "In pausa per Gmail");
        } else {
          tentativiLimite = 0;
          await attendi(PAUSA_MS / 1000, `Inviate ${ok} di ${totale}`);
        }
      }
    } finally {
      ["#iSend", "#iTest", "#iClose"].forEach((s) => ($(s).disabled = false));
      $("#iStop").hidden = true;
    }
    stato("");
    const rimasti = coda.length;
    log.insertAdjacentHTML("afterbegin", `<div style="font-weight:800;color:var(--maroon)">${fermato ? "Interrotto" : "Finito"}: ${ok} inviate${ko ? `, ${ko} non riuscite` : ""}${rimasti ? `, ${rimasti} da inviare (premi di nuovo "Invia" per continuare)` : ""}.</div>`);
    calcolaDestinatari();
  }

  $("#iStop").onclick = () => { fermato = true; $("#iStato").textContent = "Mi fermo dopo il blocco in corso…"; };

  $("#iTest").onclick = async () => {
    const me = prompt("A quale indirizzo invio la prova?", "");
    if (!me || !RE_MAIL.test(me)) return;
    await inviaLista([{ email: me.trim().toLowerCase(), nome: "Mario" }], { registra: false });
  };
  $("#iSend").onclick = async () => {
    if (!destinatari.length) return erroreInv("Aggiungi almeno un destinatario.");
    if (!$("#iOgg").value.trim() || !$("#iTxt").value.trim()) return erroreInv("Scrivi oggetto e testo.");
    if (!confirm(modo === "invito" ? `Inviare l'invito a ${destinatari.length} destinatari?` : `Inviare questa comunicazione a ${destinatari.length} espositori?`)) return;
    await inviaLista([...destinatari], { registra: modo === "invito" });
  };

  /* ---------- Impostazioni: chiusura iscrizioni e check-in ---------- */
  const setDlg = $("#set");
  const pad = (n) => String(n).padStart(2, "0");
  const perInput = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function statoAttuale(c) {
    const attive = dati.filter((r) => !["rifiutato", "annullato", "lista"].includes(r.stato)).length;
    const scaduta = c.chiusura && Date.now() > new Date(c.chiusura).getTime();
    const piena = c.maxCandidature > 0 && attive >= c.maxCandidature;
    const conteggio = c.maxCandidature > 0 ? ` (${attive} su ${c.maxCandidature} candidature)` : ` (${attive} candidature attive)`;
    if (!(c.forzaChiusura || scaduta || piena)) return ["aperte", "● Iscrizioni APERTE" + conteggio + (c.chiusura ? ` · chiusura prevista ${new Date(c.chiusura).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}` : "")];
    return c.dopoChiusura === "lista" ? ["lista", "● Iscrizioni chiuse: le nuove richieste vanno in LISTA D'ATTESA" + conteggio] : ["chiuse", "● Iscrizioni CHIUSE: il modulo non accetta richieste" + conteggio];
  }
  function mostraStato(c) { const [cl, t] = statoAttuale(c); $("#setStato").className = "set-stato " + cl; $("#setStato").textContent = t; }
  $("#openSet").onclick = async () => {
    $("#setErr").classList.remove("show"); $("#setOk").textContent = "";
    try {
      const { config: c } = await api("/api/admin/config");
      $("#setData").value = perInput(c.chiusura);
      $("#setMax").value = c.maxCandidature || "";
      $("#setDopo").value = c.dopoChiusura;
      $("#setForza").checked = !!c.forzaChiusura;
      $("#setPin").value = c.pinStaff || "";
      $("#setLink").value = location.origin + "/checkin";
      mostraStato(c);
      setDlg.showModal();
    } catch (err) { alert(err.message); }
  };
  $("#setClose").onclick = () => setDlg.close();
  $("#setSave").onclick = async () => {
    const pin = $("#setPin").value.trim();
    if (pin && pin.length < 4) { const b = $("#setErr"); b.textContent = "Il PIN deve avere almeno 4 caratteri."; b.classList.add("show"); return; }
    try {
      const { config: c } = await api("/api/admin/config", { method: "PUT", body: JSON.stringify({
        chiusura: $("#setData").value ? new Date($("#setData").value).toISOString() : null,
        maxCandidature: $("#setMax").value, dopoChiusura: $("#setDopo").value, forzaChiusura: $("#setForza").checked, pinStaff: pin,
      }) });
      mostraStato(c); $("#setErr").classList.remove("show");
      $("#setOk").textContent = "✓ Salvato";
    } catch (err) { const b = $("#setErr"); b.textContent = err.message; b.classList.add("show"); }
  };

  // Interfaccia per il modulo postazioni (postazioni.js)
  window.MA = {
    api, esc, euro,
    get dati() { return dati; },
    password: () => pwd,
    renderElenco: renderInterno,
  };

  if (pwd) carica();
})();
