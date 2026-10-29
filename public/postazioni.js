/* Mappa e assegnazione delle postazioni (area riservata) */
(() => {
  const MA = window.MA;
  const $ = (s) => document.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const GIORNO_LBL = { sab: "Sabato 5 dicembre", dom: "Domenica 6 dicembre" };
  const COL_TIPO = { "1": "#6b6a2c", "2": "#f09a2e", "3": "#a3222f" };

  let layout = null;          // { postazioni, sfondo }
  let bgUrl = location.origin + "/mappa-base.svg";
  let giorno = "sab";
  let modifica = false;
  let selIscritto = null;     // id espositore selezionato (da assegnare / da spostare)
  let selPost = null;         // id postazione selezionata
  let salvaTimer = null;

  const W = () => layout?.sfondo?.w || 1000;
  const H = () => layout?.sfondo?.h || 736;
  const esc = MA.esc;
  const dati = () => MA.dati;
  const partecipa = (r, g) => (r.giorniConfermati || r.giorni).includes(g);
  const assegnabili = () => dati().filter((r) => r.stato === "confermato" || ($("#mPre").checked && r.stato === "accettato"));
  const occupante = (pid, g = giorno) => dati().find((r) => r.postazioni?.[g] === pid && !["rifiutato", "annullato"].includes(r.stato));
  const postById = (pid) => layout?.postazioni.find((p) => p.id === pid);
  const ordineLabel = (a, b) => String(a.label).localeCompare(String(b.label), "it", { numeric: true });

  /* Etichetta postazioni per la tabella dell'elenco */
  MA.labelPostazioni = (r) => {
    if (!layout || !r.postazioni) return "";
    const parti = ["sab", "dom"].filter((g) => r.postazioni[g]).map((g) => `${g === "sab" ? "Sab" : "Dom"} ${esc(postById(r.postazioni[g])?.label || "?")}`);
    return parti.length ? `<div><span class="tag" style="background:#5b1f24;color:#f7c948">📍 ${parti.join(" · ")}</span></div>` : "";
  };

  MA.labelPlain = (r, g) => (layout && r.postazioni?.[g] ? postById(r.postazioni[g])?.label || "" : "");

  async function caricaLayout() {
    const r = await MA.api("/api/admin/mappa");
    layout = r.layout;
    await caricaSfondo();
  }
  async function caricaSfondo() {
    if (bgUrl.startsWith("blob:")) URL.revokeObjectURL(bgUrl);
    bgUrl = location.origin + "/mappa-base.svg";
    if (!layout.sfondo) return;
    try {
      const res = await fetch("/api/admin/mappa/sfondo", { headers: { "x-admin-password": MA.password() } });
      if (res.ok) bgUrl = URL.createObjectURL(await res.blob());
    } catch {}
  }

  /* ---------- Vista ---------- */
  async function mostra(vista) {
    $("#vistaElenco").hidden = vista !== "elenco";
    $("#vistaMappa").hidden = vista !== "mappa";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.vista === vista));
    try { localStorage.setItem("mercatini-vista", vista); } catch {}
    if (vista === "mappa") {
      if (!layout) {
        $("#mSvg").innerHTML = "";
        try { await caricaLayout(); } catch (e) { alert(e.message); return; }
      }
      disegna();
    }
  }
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => mostra(t.dataset.vista)));
  MA.dopoRender = () => { if (!$("#vistaMappa").hidden && layout) disegna(); };
  MA.dopoCarica = async () => {
    try { if (!layout) await caricaLayout(); } catch {}
    MA.renderElenco();
    let v = "elenco";
    try { v = localStorage.getItem("mercatini-vista") || "elenco"; } catch {}
    if (v === "mappa") mostra("mappa");
  };

  document.querySelectorAll(".mGiorno").forEach((b) => (b.onclick = () => {
    giorno = b.dataset.g; selPost = null; selIscritto = null; disegna();
  }));
  $("#mPre").onchange = () => disegna();

  /* ---------- Disegno ---------- */
  function avvisi(r, p) {
    const a = [];
    if (!r || !p) return a;
    if (r.asfalto === "Sì" && p.tipo !== "asfalto") a.push("ha chiesto l'asfalto");
    if (r.corrente === "Sì" && !p.corrente) a.push("ha chiesto la corrente");
    return a;
  }

  function disegna() {
    const svg = $("#mSvg");
    svg.setAttribute("viewBox", `0 0 ${W()} ${H()}`);
    svg.classList.toggle("edit", modifica);
    svg.innerHTML = "";
    const img = document.createElementNS(NS, "image");
    img.setAttribute("href", bgUrl); img.setAttribute("width", W()); img.setAttribute("height", H());
    img.setAttribute("preserveAspectRatio", "none");
    svg.appendChild(img);

    const s = Math.max(W(), H()) / 1000; // scala dei segnaposto rispetto all'immagine
    for (const p of layout.postazioni) {
      const r = modifica ? null : occupante(p.id);
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "pst" + (r ? " occ" : " lib") + (p.id === selPost ? " sel" : "") + (avvisi(r, p).length ? " warn" : "") + (!r && selIscritto && !modifica ? " target" : ""));
      g.dataset.id = p.id;
      g.setAttribute("transform", `translate(${p.x} ${p.y}) scale(${s})`);
      const fill = r ? COL_TIPO[r.tipo] : "#fffaf0";
      const bordo = p.tipo === "asfalto" ? "#5a5650" : "#4f6b2c";
      g.innerHTML = `
        <rect class="box" x="-15" y="-15" width="30" height="30" rx="5" fill="${fill}" stroke="${bordo}" stroke-width="2.5" ${p.tipo === "asfalto" ? 'stroke-dasharray="5 3"' : ""}/>
        <text class="lbl" y="5" text-anchor="middle" fill="${r ? "#fff" : "#3a1a1c"}">${esc(p.label)}</text>
        ${p.corrente ? '<text class="pow" x="13" y="-9" text-anchor="middle">⚡</text>' : ""}
        ${r ? `<text class="nome" y="28" text-anchor="middle">${esc(r.cognome.slice(0, 12))}</text>` : ""}
        <title>${esc(p.label)} · ${p.tipo}${p.corrente ? " · corrente" : ""}${r ? " · " + esc(r.nome + " " + r.cognome) : " · libera"}${avvisi(r, p).length ? " · ⚠ " + avvisi(r, p).join(", ") : ""}</title>`;
      svg.appendChild(g);
    }
    const tot = layout.postazioni.length;
    const occ = layout.postazioni.filter((p) => occupante(p.id)).length;
    $("#mConta").textContent = modifica ? `${tot} postazioni nel layout` : `${GIORNO_LBL[giorno]} · ${occ} occupate su ${tot}`;
    document.querySelectorAll(".mGiorno").forEach((b) => b.classList.toggle("on", b.dataset.g === giorno));
    $("#mEditBar").hidden = !modifica;
    $("#mModifica").textContent = modifica ? "✓ Fine modifica layout" : "✏️ Modifica layout";
    $("#mListaBox").hidden = modifica;
    disegnaLista();
    disegnaInfo();
  }

  function cardIscritto(r) {
    const flags = [
      r.asfalto === "Sì" ? `<span class="fl warn" title="${esc(r.motivoAsfalto || "")}">asfalto</span>` : "",
      r.corrente === "Sì" ? '<span class="fl">⚡ corrente</span>' : "",
      r.gazebo === "Sì" ? '<span class="fl">gazebo</span>' : "",
      r.stato === "accettato" ? '<span class="fl">da pagare</span>' : "",
    ].join("");
    const altro = giorno === "sab" ? "dom" : "sab";
    const altroLbl = r.postazioni?.[altro] ? `<div class="sub">${altro === "sab" ? "Sab" : "Dom"}: postazione ${esc(postById(r.postazioni[altro])?.label || "?")}</div>` : "";
    return `<div class="mcard${r.id === selIscritto ? " on" : ""}" draggable="true" data-iscr="${esc(r.id)}">
      <div><span class="dot" style="background:${COL_TIPO[r.tipo]}"></span><strong>${esc(r.cognome)} ${esc(r.nome)}</strong></div>
      <div class="sub">${esc(r.descrizione.slice(0, 60))}</div>
      ${r.vicinoA ? `<div class="sub">vicino a: ${esc(r.vicinoA)}</div>` : ""}${altroLbl}
      <div>${flags}</div></div>`;
  }

  function disegnaLista() {
    const lista = assegnabili().filter((r) => partecipa(r, giorno) && !(r.postazioni?.[giorno] && postById(r.postazioni[giorno])));
    $("#mDaAss").textContent = lista.length;
    $("#mLista").innerHTML = lista.length ? lista.map(cardIscritto).join("") : '<p class="hint">Tutti gli espositori di questo giorno hanno una postazione.</p>';
    const altro = giorno === "sab" ? "dom" : "sab";
    const copiabili = assegnabili().filter((r) => partecipa(r, giorno) && !r.postazioni?.[giorno] && r.postazioni?.[altro]);
    $("#mCopia").hidden = !copiabili.length;
    $("#mCopia").textContent = `↔ Stessa postazione di ${altro === "sab" ? "sabato" : "domenica"} (${copiabili.length})`;
  }

  function disegnaInfo() {
    const box = $("#mInfo");
    const p = postById(selPost);
    if (modifica) {
      if (!p) { box.innerHTML = '<p class="hint">Trascina le postazioni per spostarle. Clicca una postazione per cambiarne numero, tipo e corrente.</p>'; return; }
      const usata = ["sab", "dom"].map((g) => occupante(p.id, g)).filter(Boolean);
      box.innerHTML = `<h4>Postazione ${esc(p.label)}</h4>
        <label class="mfld">Numero / nome <input id="eLabel" value="${esc(p.label)}" maxlength="8"></label>
        <label class="mfld">Tipo <select id="eTipo"><option value="prato">Prato</option><option value="asfalto">Asfalto</option></select></label>
        <label class="conf-chk"><input type="checkbox" id="eCorr" ${p.corrente ? "checked" : ""}> Presa di corrente disponibile</label>
        <button class="btn small danger" id="eDel" type="button" ${usata.length ? "disabled title='Libera prima la postazione'" : ""}>Elimina postazione</button>
        ${usata.length ? `<p class="hint">Assegnata a ${usata.map((r) => esc(r.nome + " " + r.cognome)).join(", ")}: non si può eliminare.</p>` : ""}`;
      $("#eTipo").value = p.tipo;
      $("#eLabel").oninput = (e) => { p.label = e.target.value.trim() || p.id; aggiornaLayout(); };
      $("#eTipo").onchange = (e) => { p.tipo = e.target.value; aggiornaLayout(); };
      $("#eCorr").onchange = (e) => { p.corrente = e.target.checked; aggiornaLayout(); };
      $("#eDel").onclick = () => {
        if (!confirm(`Eliminare la postazione ${p.label}?`)) return;
        layout.postazioni = layout.postazioni.filter((x) => x !== p); selPost = null; aggiornaLayout();
      };
      return;
    }
    if (selIscritto && !p) {
      const r = dati().find((x) => x.id === selIscritto);
      box.innerHTML = `<div class="minfo-sel">Clicca una postazione libera per assegnarla a <strong>${esc(r.nome)} ${esc(r.cognome)}</strong>. <button class="btn-pay" id="mAnn" type="button">annulla</button></div>`;
      $("#mAnn").onclick = () => { selIscritto = null; disegna(); };
      return;
    }
    if (!p) { box.innerHTML = '<p class="hint">Seleziona un espositore dall\'elenco (o trascinalo) e poi clicca una postazione libera.</p>'; return; }
    const r = occupante(p.id);
    const caratt = `${p.tipo === "asfalto" ? "Asfalto" : "Prato"}${p.corrente ? " · ⚡ corrente" : ""}`;
    if (!r) { box.innerHTML = `<h4>Postazione ${esc(p.label)} <small>libera</small></h4><p class="sub">${caratt}</p>`; return; }
    const av = avvisi(r, p);
    box.innerHTML = `<h4>Postazione ${esc(p.label)}</h4><p class="sub">${caratt}</p>
      <div class="mcard on" style="cursor:default">${cardIscritto(r).replace(/^<div class="mcard[^"]*"[^>]*>/, "").replace(/<\/div>$/, "")}
      <div class="sub">📞 ${esc(r.telefono)}</div></div>
      ${av.length ? `<p class="mwarn">⚠ L'espositore ${av.join(" e ")}.</p>` : ""}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn small ghost" id="mSposta" type="button">Sposta</button>
        <button class="btn small danger" id="mLibera" type="button">Libera</button>
      </div>`;
    $("#mSposta").onclick = () => { selIscritto = r.id; selPost = null; disegna(); };
    $("#mLibera").onclick = () => assegna(r.id, null);
  }

  /* ---------- Assegnazione ---------- */
  async function assegna(iscrId, pid, g = giorno) {
    const r = dati().find((x) => x.id === iscrId);
    try {
      const { iscritto } = await MA.api(`/api/admin/iscritti?id=${encodeURIComponent(iscrId)}`, {
        method: "PATCH", body: JSON.stringify({ postazione: { giorno: g, id: pid } }),
      });
      Object.assign(r, iscritto);
      if (pid === null) delete r.postazioni?.[g];
      selIscritto = null; selPost = pid;
      MA.renderElenco();
      disegna();
    } catch (e) { alert(e.message); }
  }

  $("#mLista").addEventListener("click", (e) => {
    const c = e.target.closest("[data-iscr]");
    if (!c) return;
    selIscritto = selIscritto === c.dataset.iscr ? null : c.dataset.iscr;
    selPost = null; disegna();
  });
  $("#mLista").addEventListener("dragstart", (e) => {
    const c = e.target.closest("[data-iscr]");
    if (c) { e.dataTransfer.setData("text/plain", c.dataset.iscr); selIscritto = c.dataset.iscr; }
  });
  const svgEl = $("#mSvg");
  svgEl.addEventListener("dragover", (e) => { if (!modifica && e.target.closest(".pst.lib")) e.preventDefault(); });
  svgEl.addEventListener("drop", (e) => {
    const g = e.target.closest(".pst.lib");
    const id = e.dataTransfer.getData("text/plain");
    if (g && id) { e.preventDefault(); assegna(id, g.dataset.id); }
  });

  /* click e trascinamento sulla mappa */
  function puntoSvg(e) {
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }
  let trascina = null;
  svgEl.addEventListener("pointerdown", (e) => {
    const g = e.target.closest(".pst");
    if (!g) return;
    if (modifica) {
      const p = postById(g.dataset.id);
      trascina = { p, g, mosso: false, start: puntoSvg(e), ox: p.x, oy: p.y };
      g.setPointerCapture(e.pointerId);
    }
  });
  svgEl.addEventListener("pointermove", (e) => {
    if (!trascina) return;
    const q = puntoSvg(e);
    const dx = q.x - trascina.start.x, dy = q.y - trascina.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) trascina.mosso = true;
    trascina.p.x = Math.round(Math.max(0, Math.min(W(), trascina.ox + dx)));
    trascina.p.y = Math.round(Math.max(0, Math.min(H(), trascina.oy + dy)));
    const s = Math.max(W(), H()) / 1000;
    trascina.g.setAttribute("transform", `translate(${trascina.p.x} ${trascina.p.y}) scale(${s})`);
  });
  svgEl.addEventListener("pointerup", () => {
    if (!trascina) return;
    const { p, mosso } = trascina;
    trascina = null;
    if (mosso) aggiornaLayout(); else { selPost = p.id; disegna(); }
  });
  svgEl.addEventListener("click", (e) => {
    if (modifica) return;
    const g = e.target.closest(".pst");
    if (!g) { selPost = null; disegna(); return; }
    const pid = g.dataset.id;
    if (selIscritto && !occupante(pid)) return assegna(selIscritto, pid);
    selPost = pid; disegna();
  });

  $("#mCopia").onclick = async () => {
    const altro = giorno === "sab" ? "dom" : "sab";
    const lista = assegnabili().filter((r) => partecipa(r, giorno) && !r.postazioni?.[giorno] && r.postazioni?.[altro]);
    let ok = 0; const no = [];
    for (const r of lista) {
      const pid = r.postazioni[altro];
      if (occupante(pid)) { no.push(`${r.nome} ${r.cognome} (postazione ${postById(pid)?.label} occupata)`); continue; }
      try {
        const { iscritto } = await MA.api(`/api/admin/iscritti?id=${encodeURIComponent(r.id)}`, { method: "PATCH", body: JSON.stringify({ postazione: { giorno, id: pid } }) });
        Object.assign(r, iscritto); ok++;
      } catch (e) { no.push(`${r.nome} ${r.cognome}: ${e.message}`); }
    }
    MA.renderElenco(); disegna();
    alert(`Assegnate ${ok} postazioni.` + (no.length ? `\nNon assegnate:\n${no.join("\n")}` : ""));
  };

  /* ---------- Modifica layout ---------- */
  function aggiornaLayout() {
    disegna();
    clearTimeout(salvaTimer);
    $("#mSalvato").textContent = "salvataggio…";
    salvaTimer = setTimeout(async () => {
      try {
        const r = await MA.api("/api/admin/mappa", { method: "PUT", body: JSON.stringify({ postazioni: layout.postazioni }) });
        layout = { ...layout, ...r.layout, sfondo: layout.sfondo };
        $("#mSalvato").textContent = "✓ salvato";
      } catch (e) { $("#mSalvato").textContent = "⚠ non salvato: " + e.message; }
    }, 700);
  }
  $("#mModifica").onclick = () => { modifica = !modifica; selPost = null; selIscritto = null; $("#mSalvato").textContent = ""; disegna(); };
  document.querySelectorAll(".mAdd").forEach((b) => (b.onclick = () => {
    const tipo = b.dataset.tipo;
    const pref = tipo === "asfalto" ? "A" : "";
    const nums = layout.postazioni.filter((p) => p.tipo === tipo).map((p) => parseInt(String(p.label).replace(/\D/g, ""), 10) || 0);
    const label = pref + (Math.max(0, ...nums) + 1);
    const p = { id: "n" + Date.now().toString(36), label, x: Math.round(W() / 2), y: Math.round(H() / 2), tipo, corrente: tipo === "asfalto" };
    layout.postazioni.push(p); selPost = p.id; aggiornaLayout();
  }));
  $("#mRinumera").onclick = () => {
    if (!confirm("Rinumerare le postazioni? Prato 1, 2, 3… e asfalto A1, A2… nell'ordine attuale (dall'alto verso il basso). Le assegnazioni restano.")) return;
    const ord = (t) => layout.postazioni.filter((p) => p.tipo === t).sort((a, b) => a.y - b.y || a.x - b.x);
    ord("prato").forEach((p, i) => (p.label = String(i + 1)));
    ord("asfalto").forEach((p, i) => (p.label = "A" + (i + 1)));
    aggiornaLayout();
  };

  $("#mFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return alert("Carica un'immagine (JPG o PNG). Se hai un PDF, esportalo prima come immagine o fanne uno screenshot.");
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });
      const k = Math.min(1, 2200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const r = await MA.api("/api/admin/mappa/sfondo", { method: "PUT", body: JSON.stringify({ data: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height }) });
      layout = r.layout; await caricaSfondo(); disegna();
      $("#mSalvato").textContent = "✓ planimetria caricata: ora sposta le postazioni nei punti giusti";
    } catch (err) { alert("Caricamento non riuscito: " + (err.message || err)); }
  });
  $("#mSchema").onclick = async () => {
    if (!layout.sfondo) return alert("Stai già usando la mappa schematica.");
    if (!confirm("Tornare alla mappa schematica? La planimetria caricata verrà rimossa.")) return;
    const r = await MA.api("/api/admin/mappa/sfondo", { method: "DELETE" });
    layout = r.layout; await caricaSfondo(); disegna();
  };

  /* ---------- Stampa ---------- */
  $("#mStampa").onclick = () => {
    const svg = $("#mSvg").cloneNode(true);
    svg.querySelectorAll(".pst").forEach((g) => g.classList.remove("sel", "target"));
    const righe = layout.postazioni.slice().sort(ordineLabel).map((p) => {
      const r = occupante(p.id);
      const caratt = `${p.tipo === "asfalto" ? "Asfalto" : "Prato"}${p.corrente ? " ⚡" : ""}`;
      if (!r) return `<tr class="vuota"><td><b>${esc(p.label)}</b></td><td>${caratt}</td><td colspan="5">— libera —</td></tr>`;
      return `<tr><td><b>${esc(p.label)}</b></td><td>${caratt}</td><td><b>${esc(r.cognome)} ${esc(r.nome)}</b></td><td>${esc(r.descrizione.slice(0, 70))}</td><td>${esc(r.telefono)}</td>
        <td>${r.gazebo === "Sì" ? "Gazebo" : ""}${r.corrente === "Sì" ? " · Corrente" : ""}</td><td>${r.pagamento ? "Pagato" : "<b>DA PAGARE</b>"}</td></tr>`;
    }).join("");
    const senza = assegnabili().filter((r) => partecipa(r, giorno) && !r.postazioni?.[giorno]);
    const w = window.open("", "_blank");
    if (!w) return alert("Il browser ha bloccato la finestra di stampa: consenti i pop-up per questo sito.");
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Postazioni ${GIORNO_LBL[giorno]}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#222;margin:0;padding:14mm}
        h1{font-size:20px;margin:0 0 2px;color:#5b1f24} .sub{color:#666;font-size:12px;margin-bottom:10px}
        svg{width:100%;height:auto;border:1px solid #ccc;display:block}
        .pst .lbl{font:bold 13px Arial} .pst .pow{font-size:10px} .pst .nome{font:bold 10px Arial;fill:#222;paint-order:stroke;stroke:#fff;stroke-width:3px}
        .pst.warn .box{stroke:#d00!important;stroke-width:3.5}
        table{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
        th{background:#eee} tr.vuota td{color:#999} .pag{page-break-before:always}
        @page{size:A4;margin:0} @media print{body{padding:10mm}}
      </style></head><body>
      <h1>Natale a Spinone · Postazioni ${GIORNO_LBL[giorno]}</h1>
      <div class="sub">Stampato il ${new Date().toLocaleString("it-IT")} · ${layout.postazioni.filter((p) => occupante(p.id)).length} postazioni occupate su ${layout.postazioni.length} · allestimento 8.00–9.30, apertura 10.00</div>
      ${svg.outerHTML}
      <div class="pag"></div>
      <h1>Elenco postazioni · ${GIORNO_LBL[giorno]}</h1>
      <table><thead><tr><th>Post.</th><th>Tipo</th><th>Espositore</th><th>Merce</th><th>Telefono</th><th>Note</th><th>Quota</th></tr></thead><tbody>${righe}</tbody></table>
      ${senza.length ? `<p style="font-size:12px;color:#a3222f"><b>Ancora senza postazione:</b> ${senza.map((r) => esc(r.nome + " " + r.cognome)).join(", ")}</p>` : ""}
      <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };
})();
