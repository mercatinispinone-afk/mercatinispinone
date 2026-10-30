/* Postazioni e planimetria (area riservata)
 * - assegnazione per giorno (clic o trascinamento)
 * - configuratore planimetria in scala reale: taratura, postazioni in metri ruotabili,
 *   controllo sovrapposizioni/passaggio, file dritte e ad arco, selezione multipla,
 *   tastiera, annulla, zoom e spostamento, planimetria da immagine o PDF
 */
(() => {
  const MA = window.MA;
  const $ = (s) => document.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const GIORNO_LBL = { sab: "Sabato 5 dicembre", dom: "Domenica 6 dicembre" };
  const COL_TIPO = { "1": "#6b6a2c", "2": "#f09a2e", "3": "#a3222f" };
  const SCALA_SCHEMA = 8.5;
  const esc = MA.esc;

  /* ---------- Stato ---------- */
  let layout = null;
  let bgUrl = location.origin + "/mappa-base.svg";
  let giorno = "sab";
  let modifica = false;
  let selIscritto = null;     // assegnazione: espositore scelto
  let selPost = null;         // assegnazione: postazione evidenziata
  const sel = new Set();      // modifica: postazioni selezionate
  let view = null;            // viewBox corrente
  let strumento = null;       // { tipo: "scala"|"fila"|"arco", punti: [] }
  let storia = [];
  let salvaTimer = null;
  let sovrapposte = new Set();
  let dimNuove = { w: 4, h: 4 };

  const W = () => layout?.sfondo?.w || 1000;
  const H = () => layout?.sfondo?.h || 736;
  const scala = () => layout?.scala || (W() / 1000) * SCALA_SCHEMA; // unità immagine per metro
  const dati = () => MA.dati;
  const partecipa = (r, g) => (r.giorniConfermati || r.giorni).includes(g);
  const assegnabili = () => dati().filter((r) => r.stato === "confermato" || ($("#mPre").checked && r.stato === "accettato"));
  const occupante = (pid, g = giorno) => dati().find((r) => r.postazioni?.[g] === pid && !["rifiutato", "annullato"].includes(r.stato));
  const postById = (pid) => layout?.postazioni.find((p) => p.id === pid);
  const ordineLabel = (a, b) => String(a.label).localeCompare(String(b.label), "it", { numeric: true });
  const fmt = (n, d = 1) => Number(n).toLocaleString("it-IT", { maximumFractionDigits: d });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const normDeg = (d) => { d = ((d % 360) + 360) % 360; return d > 180 ? d - 360 : d; };

  /* ---------- Integrazione con l'elenco ---------- */
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
    view = { x: 0, y: 0, w: W(), h: H() };
    storia = [];
  }
  async function caricaSfondo() {
    if (bgUrl.startsWith("blob:")) URL.revokeObjectURL(bgUrl);
    bgUrl = location.origin + "/mappa-base.svg";
    if (layout.sfondo) {
      try {
        const res = await fetch("/api/admin/mappa/sfondo", { headers: { "x-admin-password": MA.password() } });
        if (res.ok) bgUrl = URL.createObjectURL(await res.blob());
      } catch {}
    }
    costruisciBase();
  }

  /* ---------- Vista elenco / mappa ---------- */
  async function mostra(vista) {
    $("#vistaElenco").hidden = vista !== "elenco";
    $("#vistaMappa").hidden = vista !== "mappa";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.vista === vista));
    try { localStorage.setItem("mercatini-vista", vista); } catch {}
    if (vista === "mappa") {
      if (!layout) { try { await caricaLayout(); } catch (e) { alert(e.message); return; } }
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
  document.querySelectorAll(".mGiorno").forEach((b) => (b.onclick = () => { giorno = b.dataset.g; selPost = null; selIscritto = null; disegna(); }));
  $("#mPre").onchange = () => disegna();

  /* ---------- Geometria ---------- */
  function angoli(p, extraM = 0) {
    const s = scala();
    const hw = ((p.w || 4) / 2 + extraM) * s, hh = ((p.h || 4) / 2 + extraM) * s;
    const c = Math.cos(rad(p.rot || 0)), si = Math.sin(rad(p.rot || 0));
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [p.x + x * c - y * si, p.y + x * si + y * c]);
  }
  function siToccano(A, B) {
    for (const poly of [A, B]) {
      for (let i = 0; i < 4; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4];
        const nx = y2 - y1, ny = x1 - x2;
        let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
        for (const [x, y] of A) { const d = x * nx + y * ny; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
        for (const [x, y] of B) { const d = x * nx + y * ny; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
        if (maxA <= minB || maxB <= minA) return false;
      }
    }
    return true;
  }
  /** Postazioni che si sovrappongono o non lasciano il passaggio minimo */
  function calcolaSovrapposte() {
    const meta = (layout.corridoio || 0) / 2 - 0.001;
    const poli = layout.postazioni.map((p) => ({ p, c: angoli(p, Math.max(0, meta)) }));
    const box = poli.map(({ c }) => [Math.min(...c.map((v) => v[0])), Math.min(...c.map((v) => v[1])), Math.max(...c.map((v) => v[0])), Math.max(...c.map((v) => v[1]))]);
    const out = new Set();
    for (let i = 0; i < poli.length; i++) {
      for (let j = i + 1; j < poli.length; j++) {
        const a = box[i], b = box[j];
        if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
        if (siToccano(poli[i].c, poli[j].c)) { out.add(poli[i].p.id); out.add(poli[j].p.id); }
      }
    }
    sovrapposte = out;
  }

  /* ---------- Disegno ---------- */
  const svgEl = $("#mSvg");
  function costruisciBase() {
    svgEl.innerHTML = `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#fff" fill-opacity=".15"/><line x1="0" y1="0" x2="0" y2="6" stroke="#d00" stroke-width="3"/></pattern></defs>
      <image id="mBg" href="${bgUrl}" x="0" y="0" width="${W()}" height="${H()}" preserveAspectRatio="none"/>
      <g id="gP"></g><g id="gT"></g>`;
    svgEl.style.aspectRatio = `${W()} / ${H()}`;
  }
  function applicaView() {
    if (!view) view = { x: 0, y: 0, w: W(), h: H() };
    svgEl.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  function avvisi(r, p) {
    const a = [];
    if (!r || !p) return a;
    if (r.asfalto === "Sì" && p.tipo !== "asfalto") a.push("ha chiesto l'asfalto");
    if (r.corrente === "Sì" && !p.corrente) a.push("ha chiesto la corrente");
    return a;
  }

  function htmlPostazione(p) {
    const s = scala();
    const w = (p.w || 4) * s, h = (p.h || 4) * s;
    const r = modifica ? null : occupante(p.id);
    const lato = Math.min(w, h);
    const fL = clamp(lato * 0.42, 5, 60), fN = clamp(lato * 0.27, 4, 30);
    const ext = Math.max(w, h) / 2;
    const fill = r ? COL_TIPO[r.tipo] : "#fffaf0";
    const bordo = p.tipo === "asfalto" ? "#5a5650" : "#4f6b2c";
    const cls = ["pst", r ? "occ" : "lib",
      (modifica ? sel.has(p.id) : p.id === selPost) ? "sel" : "",
      avvisi(r, p).length ? "warn" : "",
      !r && selIscritto && !modifica ? "target" : ""].join(" ");
    const sw = clamp(lato * 0.07, 1, 8);
    return `<g class="${cls}" data-id="${esc(p.id)}" transform="translate(${p.x} ${p.y}) rotate(${p.rot || 0})">
      <rect class="box" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${lato * 0.1}" fill="${fill}" fill-opacity="${r ? 1 : 0.92}" stroke="${bordo}" stroke-width="${sw}" ${p.tipo === "asfalto" ? `stroke-dasharray="${sw * 2} ${sw * 1.2}"` : ""}/>
      ${sovrapposte.has(p.id) ? `<rect class="ovl" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${lato * 0.1}"/>` : ""}
      <g transform="rotate(${-(p.rot || 0)})">
        <text class="lbl" y="${fL * 0.36}" text-anchor="middle" style="font-size:${fL}px" fill="${r ? "#fff" : "#3a1a1c"}">${esc(p.label)}</text>
        ${p.corrente ? `<text class="pow" x="${lato * 0.36}" y="${-lato * 0.2}" text-anchor="middle" style="font-size:${fN}px">⚡</text>` : ""}
        ${r ? `<text class="nome" y="${ext + fN * 1.05}" text-anchor="middle" style="font-size:${fN}px;stroke-width:${fN * 0.3}px">${esc(r.cognome.slice(0, 14))}</text>` : ""}
      </g>
      <title>${esc(p.label)} · ${p.tipo} · ${fmt(p.w)}×${fmt(p.h)} m${p.corrente ? " · corrente" : ""}${r ? " · " + esc(r.nome + " " + r.cognome) : " · libera"}${sovrapposte.has(p.id) ? " · ⚠ sovrapposta o senza passaggio" : ""}</title>
    </g>`;
  }

  function disegna() {
    if (!layout) return;
    if (!svgEl.querySelector("#gP")) costruisciBase();
    applicaView();
    calcolaSovrapposte();
    svgEl.classList.toggle("edit", modifica);
    $("#gP").innerHTML = layout.postazioni.map(htmlPostazione).join("");
    disegnaStrumento();

    const tot = layout.postazioni.length;
    const occ = layout.postazioni.filter((p) => occupante(p.id)).length;
    $("#mConta").textContent = modifica ? `${tot} postazioni` : `${GIORNO_LBL[giorno]} · ${occ} occupate su ${tot}`;
    $("#mSegGiorno").style.visibility = modifica ? "hidden" : "";
    document.querySelectorAll(".mGiorno").forEach((b) => b.classList.toggle("on", b.dataset.g === giorno));
    $("#mEditBar").hidden = !modifica;
    $("#mModifica").textContent = modifica ? "✓ Fine modifica" : "✏️ Modifica planimetria";
    $("#mListaBox").hidden = modifica;
    $("#mCorr").value = layout.corridoio ?? 1;
    $("#mUndo").disabled = !storia.length;
    disegnaScalaInfo();
    if (!modifica) disegnaLista();
    disegnaInfo();
  }

  function disegnaScalaInfo() {
    const n = sovrapposte.size;
    const ov = n ? ` · <b style="color:#a3222f">⚠ ${n} postazioni sovrapposte o senza passaggio di ${fmt(layout.corridoio)} m</b>` : "";
    let html;
    if (!layout.scala) html = `<span class="err">Scala non impostata: le misure delle postazioni non sono reali. Apri «Modifica planimetria» e usa 📏 Imposta scala.</span>`;
    else if (!layout.scalaVerificata) html = `<span class="warn">Scala indicativa (stimata): per misure affidabili usa 📏 Imposta scala su due punti di distanza nota.</span>${ov}`;
    else html = `Scala tarata: 1 m = ${fmt(layout.scala, 1)} px · postazioni in misura reale · passaggio minimo ${fmt(layout.corridoio)} m${ov}`;
    $("#mScalaInfo").innerHTML = html;
  }

  function cardIscritto(r, conTrascina = true) {
    const flags = [
      r.asfalto === "Sì" ? `<span class="fl warn" title="${esc(r.motivoAsfalto || "")}">asfalto</span>` : "",
      r.corrente === "Sì" ? '<span class="fl">⚡ corrente</span>' : "",
      r.gazebo === "Sì" ? '<span class="fl">gazebo</span>' : "",
      r.stato === "accettato" ? '<span class="fl">da pagare</span>' : "",
    ].join("");
    const altro = giorno === "sab" ? "dom" : "sab";
    const altroLbl = r.postazioni?.[altro] ? `<div class="sub">${altro === "sab" ? "Sab" : "Dom"}: postazione ${esc(postById(r.postazioni[altro])?.label || "?")}</div>` : "";
    return `<div class="mcard${r.id === selIscritto ? " on" : ""}" ${conTrascina ? 'draggable="true"' : 'style="cursor:default"'} data-iscr="${esc(r.id)}">
      <div><span class="dot" style="background:${COL_TIPO[r.tipo]}"></span><strong>${esc(r.cognome)} ${esc(r.nome)}</strong></div>
      <div class="sub">${esc(r.descrizione.slice(0, 60))}</div>
      ${r.vicinoA ? `<div class="sub">vicino a: ${esc(r.vicinoA)}</div>` : ""}${altroLbl}
      <div>${flags}</div></div>`;
  }

  function disegnaLista() {
    const lista = assegnabili().filter((r) => partecipa(r, giorno) && !(r.postazioni?.[giorno] && postById(r.postazioni[giorno])));
    $("#mDaAss").textContent = lista.length;
    $("#mLista").innerHTML = lista.length ? lista.map((r) => cardIscritto(r)).join("") : '<p class="hint">Tutti gli espositori di questo giorno hanno una postazione.</p>';
    const altro = giorno === "sab" ? "dom" : "sab";
    const copiabili = assegnabili().filter((r) => partecipa(r, giorno) && !r.postazioni?.[giorno] && r.postazioni?.[altro]);
    $("#mCopia").hidden = !copiabili.length || modifica;
    $("#mCopia").textContent = `↔ Stessa postazione di ${altro === "sab" ? "sabato" : "domenica"} (${copiabili.length})`;
  }

  /* ---------- Pannello laterale ---------- */
  function disegnaInfo() {
    const box = $("#mInfo");
    if (modifica) return disegnaInfoModifica(box);
    const p = postById(selPost);
    if (selIscritto && !p) {
      const r = dati().find((x) => x.id === selIscritto);
      box.innerHTML = `<div class="minfo-sel">Clicca una postazione libera per assegnarla a <strong>${esc(r.nome)} ${esc(r.cognome)}</strong>. <button class="btn-pay" id="mAnn" type="button">annulla</button></div>`;
      $("#mAnn").onclick = () => { selIscritto = null; disegna(); };
      return;
    }
    if (!p) { box.innerHTML = '<p class="hint">Seleziona un espositore dall\'elenco (o trascinalo) e poi clicca una postazione libera.</p>'; return; }
    const r = occupante(p.id);
    const caratt = `${p.tipo === "asfalto" ? "Asfalto" : "Prato"} · ${fmt(p.w)}×${fmt(p.h)} m${p.corrente ? " · ⚡ corrente" : ""}`;
    if (!r) { box.innerHTML = `<h4>Postazione ${esc(p.label)} <small>libera</small></h4><p class="sub">${caratt}</p>`; return; }
    const av = avvisi(r, p);
    box.innerHTML = `<h4>Postazione ${esc(p.label)}</h4><p class="sub">${caratt}</p>
      ${cardIscritto(r, false).replace("</div></div>", `</div><div class="sub">📞 ${esc(r.telefono)}</div></div>`)}
      ${av.length ? `<p class="mwarn">⚠ L'espositore ${av.join(" e ")}.</p>` : ""}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn small ghost" id="mSposta" type="button">Sposta</button>
        <button class="btn small danger" id="mLibera" type="button">Libera</button>
      </div>`;
    $("#mSposta").onclick = () => { selIscritto = r.id; selPost = null; disegna(); };
    $("#mLibera").onclick = () => assegna(r.id, null);
  }

  const DIMENSIONI = [["4x4", "4 × 4 m (standard)"], ["6x4", "6 × 4 m (spazio doppio)"], ["3x3", "3 × 3 m"], ["custom", "personalizzata…"]];
  function disegnaInfoModifica(box) {
    const lista = layout.postazioni.filter((p) => sel.has(p.id));
    const tasti = `<p class="mkeys"><kbd>Clic</kbd> seleziona · <kbd>Shift</kbd>+clic selezione multipla · trascina per spostare<br>
      <kbd>←↑→↓</kbd> sposta 10 cm (<kbd>Shift</kbd> 1 m) · <kbd>R</kbd> ruota 15° (<kbd>Shift+R</kbd> indietro)<br>
      <kbd>Ctrl+D</kbd> duplica · <kbd>Canc</kbd> elimina · <kbd>Ctrl+Z</kbd> annulla · <kbd>Esc</kbd> deseleziona</p>`;
    if (!lista.length) {
      box.innerHTML = `<h4>Planimetria</h4><p class="hint">Seleziona una o più postazioni per modificarle, oppure usa gli strumenti in alto per aggiungerne.</p>
        <label class="mfld">Dimensione delle nuove postazioni <select id="eDimNuove">${DIMENSIONI.slice(0, 3).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
        <label class="mfld">Tipo delle nuove file <select id="eTipoNuove"><option value="prato">Prato</option><option value="asfalto">Asfalto</option></select></label>
        ${tasti}`;
      $("#eDimNuove").value = `${dimNuove.w}x${dimNuove.h}`;
      $("#eDimNuove").onchange = (e) => { const [w, h] = e.target.value.split("x").map(Number); dimNuove = { w, h }; };
      $("#eTipoNuove").value = dimNuove.tipo || "prato";
      $("#eTipoNuove").onchange = (e) => (dimNuove.tipo = e.target.value);
      return;
    }
    const uno = lista.length === 1 ? lista[0] : null;
    const tutti = (f) => lista.every((p) => p[f] === lista[0][f]);
    const usate = lista.filter((p) => occupante(p.id, "sab") || occupante(p.id, "dom"));
    const dimVal = tutti("w") && tutti("h") ? (DIMENSIONI.find(([v]) => v === `${lista[0].w}x${lista[0].h}`)?.[0] || "custom") : "";
    box.innerHTML = `<h4>${uno ? `Postazione ${esc(uno.label)}` : `${lista.length} postazioni selezionate`}</h4>
      ${uno ? `<label class="mfld">Numero / nome <input id="eLabel" value="${esc(uno.label)}" maxlength="8"></label>`
            : `<div class="mrow"><label class="mfld">Numera da <input id="eDa" placeholder="es. 10 o A1"></label><button class="btn small ghost" id="eNumera" type="button">Numera</button></div>`}
      <div class="mrow">
        <label class="mfld">Tipo <select id="eTipo">${tutti("tipo") ? "" : '<option value="">— misto —</option>'}<option value="prato">Prato</option><option value="asfalto">Asfalto</option></select></label>
        <label class="mfld">Dimensione <select id="eDim">${dimVal ? "" : '<option value="">— misto —</option>'}${DIMENSIONI.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
      </div>
      <div class="mrow" id="eCustom" ${dimVal === "custom" ? "" : "hidden"}>
        <label class="mfld">Larghezza (m) <input type="number" id="eW" min="0.5" max="30" step="0.5" value="${lista[0].w}"></label>
        <label class="mfld">Profondità (m) <input type="number" id="eH" min="0.5" max="30" step="0.5" value="${lista[0].h}"></label>
      </div>
      <label class="mfld">Rotazione <span id="eRotV">${tutti("rot") ? Math.round(lista[0].rot) + "°" : "mista"}</span>
        <input type="range" id="eRot" min="-180" max="180" step="1" value="${Math.round(lista[0].rot || 0)}" style="padding:0"></label>
      <div class="mrow" style="margin-bottom:6px"><button class="mt" data-rot="-15" type="button">↺ 15°</button><button class="mt" data-rot="-90" type="button">↺ 90°</button><button class="mt" data-rot="90" type="button">↻ 90°</button><button class="mt" data-rot="15" type="button">↻ 15°</button>${lista.length > 1 ? '<button class="mt" id="eAllinea" type="button" title="Ruota tutte come la prima selezionata">Allinea</button>' : ""}</div>
      <label class="conf-chk"><input type="checkbox" id="eCorr"> Presa di corrente disponibile</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn small ghost" id="eDup" type="button">Duplica</button>
        <button class="btn small danger" id="eDel" type="button" ${usate.length ? "disabled" : ""}>Elimina</button>
      </div>
      ${usate.length ? `<p class="hint">${usate.length === 1 && uno ? "Postazione assegnata" : `${usate.length} postazioni assegnate`}: per eliminarle libera prima le assegnazioni.</p>` : ""}
      ${sovrapposte.size && lista.some((p) => sovrapposte.has(p.id)) ? `<p class="mwarn">⚠ Sovrapposta a un'altra postazione o con meno di ${fmt(layout.corridoio)} m di passaggio.</p>` : ""}
      ${tasti}`;
    const eTipo = $("#eTipo"); eTipo.value = tutti("tipo") ? lista[0].tipo : "";
    const eDim = $("#eDim"); eDim.value = dimVal;
    const eCorr = $("#eCorr"); eCorr.checked = lista.every((p) => p.corrente); eCorr.indeterminate = !tutti("corrente");
    if (uno) {
      $("#eLabel").onfocus = () => snapshot();
      $("#eLabel").oninput = (e) => { uno.label = e.target.value.trim() || uno.id; modificato(false); };
    }
    else $("#eNumera").onclick = () => numeraSelezione($("#eDa").value);
    $("#eRot").onpointerdown = () => snapshot();
    eTipo.onchange = () => { if (!eTipo.value) return; snapshot(); lista.forEach((p) => (p.tipo = eTipo.value)); modificato(); };
    eDim.onchange = () => {
      if (eDim.value === "custom") { $("#eCustom").hidden = false; return; }
      if (!eDim.value) return;
      const [w, h] = eDim.value.split("x").map(Number); snapshot(); lista.forEach((p) => { p.w = w; p.h = h; }); modificato();
    };
    ["#eW", "#eH"].forEach((s) => ($(s).onchange = () => {
      snapshot(); const w = clamp(Number($("#eW").value) || 4, 0.5, 30), h = clamp(Number($("#eH").value) || 4, 0.5, 30);
      lista.forEach((p) => { p.w = w; p.h = h; }); modificato();
    }));
    $("#eRot").oninput = (e) => { lista.forEach((p) => (p.rot = Number(e.target.value))); $("#eRotV").textContent = e.target.value + "°"; aggiornaGrafica(); };
    $("#eRot").onchange = () => modificato();
    box.querySelectorAll("[data-rot]").forEach((b) => (b.onclick = () => ruota(Number(b.dataset.rot))));
    if ($("#eAllinea")) $("#eAllinea").onclick = () => { snapshot(); lista.forEach((p) => (p.rot = lista[0].rot)); modificato(); };
    eCorr.onchange = () => { snapshot(); lista.forEach((p) => (p.corrente = eCorr.checked)); modificato(); };
    $("#eDup").onclick = duplica;
    $("#eDel").onclick = elimina;
  }

  /* ---------- Modifiche al layout ---------- */
  function snapshot() {
    storia.push(JSON.stringify({ postazioni: layout.postazioni, scala: layout.scala, scalaVerificata: layout.scalaVerificata, corridoio: layout.corridoio }));
    if (storia.length > 60) storia.shift();
    $("#mUndo").disabled = false;
  }
  function annulla() {
    const s = storia.pop();
    if (!s) return;
    Object.assign(layout, JSON.parse(s));
    for (const id of [...sel]) if (!postById(id)) sel.delete(id);
    modificato();
  }
  /** Ridisegno leggero (durante trascinamenti e slider) */
  function aggiornaGrafica() {
    calcolaSovrapposte();
    $("#gP").innerHTML = layout.postazioni.map(htmlPostazione).join("");
    disegnaScalaInfo();
  }
  function modificato(ridisegnaPannello = true) {
    if (ridisegnaPannello) disegna(); else aggiornaGrafica();
    clearTimeout(salvaTimer);
    $("#mSalvato").textContent = "salvataggio…";
    salvaTimer = setTimeout(salva, 700);
  }
  async function salva() {
    try {
      await MA.api("/api/admin/mappa", { method: "PUT", body: JSON.stringify({ postazioni: layout.postazioni, scala: layout.scala, scalaVerificata: layout.scalaVerificata, corridoio: layout.corridoio }) });
      $("#mSalvato").textContent = "✓ salvato " + new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { $("#mSalvato").textContent = "⚠ non salvato: " + e.message; }
  }
  function prossimaLabel(tipo, offset = 0) {
    const nums = layout.postazioni.filter((p) => p.tipo === tipo).map((p) => parseInt(String(p.label).replace(/\D/g, ""), 10) || 0);
    return (tipo === "asfalto" ? "A" : "") + (Math.max(0, ...nums) + 1 + offset);
  }
  const nuovoId = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function aggiungi(tipo, x, y, rot = 0) {
    const p = { id: nuovoId(), label: prossimaLabel(tipo), x: Math.round(x), y: Math.round(y), w: dimNuove.w, h: dimNuove.h, rot: Math.round(rot), tipo, corrente: tipo === "asfalto" };
    layout.postazioni.push(p);
    return p;
  }
  function ruota(d) {
    if (!sel.size) return;
    snapshot();
    layout.postazioni.filter((p) => sel.has(p.id)).forEach((p) => (p.rot = normDeg((p.rot || 0) + d)));
    modificato();
  }
  function sposta(dxM, dyM) {
    if (!sel.size) return;
    snapshot();
    const s = scala();
    layout.postazioni.filter((p) => sel.has(p.id)).forEach((p) => { p.x = clamp(p.x + dxM * s, 0, W()); p.y = clamp(p.y + dyM * s, 0, H()); });
    modificato(false);
  }
  function duplica() {
    if (!sel.size) return;
    snapshot();
    const s = scala(), copie = [];
    layout.postazioni.filter((p) => sel.has(p.id)).forEach((p, i) => {
      const n = { ...p, id: nuovoId() + i, label: prossimaLabel(p.tipo), x: clamp(p.x + (p.w + (layout.corridoio || 1)) * s, 0, W()), y: p.y };
      layout.postazioni.push(n); copie.push(n.id);
    });
    sel.clear(); copie.forEach((id) => sel.add(id));
    modificato();
  }
  function elimina() {
    const lista = layout.postazioni.filter((p) => sel.has(p.id));
    if (!lista.length) return;
    if (lista.some((p) => occupante(p.id, "sab") || occupante(p.id, "dom"))) return alert("Alcune postazioni sono assegnate: liberale prima di eliminarle.");
    if (!confirm(lista.length === 1 ? `Eliminare la postazione ${lista[0].label}?` : `Eliminare ${lista.length} postazioni?`)) return;
    snapshot();
    layout.postazioni = layout.postazioni.filter((p) => !sel.has(p.id));
    sel.clear();
    modificato();
  }
  function numeraSelezione(da) {
    const m = String(da || "").trim().match(/^([A-Za-z]*)(\d+)$/);
    if (!m) return alert("Scrivi il numero di partenza, ad esempio 10 oppure A1.");
    snapshot();
    const lista = layout.postazioni.filter((p) => sel.has(p.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    lista.forEach((p, i) => (p.label = m[1].toUpperCase() + (Number(m[2]) + i)));
    modificato();
  }

  $("#mModifica").onclick = () => {
    modifica = !modifica;
    sel.clear(); selPost = null; selIscritto = null; impostaStrumento(null);
    $("#mSalvato").textContent = "";
    disegna();
  };
  $("#mUndo").onclick = annulla;
  $("#mCorr").onchange = (e) => { snapshot(); layout.corridoio = clamp(Number(e.target.value) || 0, 0, 10); modificato(); };
  document.querySelectorAll(".mAdd").forEach((b) => (b.onclick = () => {
    snapshot();
    const p = aggiungi(b.dataset.tipo, view.x + view.w / 2, view.y + view.h / 2);
    sel.clear(); sel.add(p.id); modificato();
  }));
  $("#mRinumera").onclick = () => {
    if (!confirm("Rinumerare tutte le postazioni? Prato 1, 2, 3… e asfalto A1, A2… dall'alto verso il basso. Le assegnazioni restano.")) return;
    snapshot();
    const ord = (t) => layout.postazioni.filter((p) => p.tipo === t).sort((a, b) => a.y - b.y || a.x - b.x);
    ord("prato").forEach((p, i) => (p.label = String(i + 1)));
    ord("asfalto").forEach((p, i) => (p.label = "A" + (i + 1)));
    modificato();
  };

  /* ---------- Strumenti: scala, fila, arco ---------- */
  const ISTR = {
    scala: ["Clicca il PRIMO punto di una distanza che conosci (es. un lato del vialetto o la barra della scala)", "Clicca il SECONDO punto"],
    fila: ["Clicca dove INIZIA la fila", "Clicca dove FINISCE la fila"],
    arco: ["Clicca dove INIZIA la curva", "Clicca un punto a METÀ della curva", "Clicca dove FINISCE la curva"],
  };
  function impostaStrumento(tipo) {
    strumento = tipo ? { tipo, punti: [], cursore: null } : null;
    ["#tScala", "#tFila", "#tArco"].forEach((s) => $(s).classList.toggle("on", !!tipo && s === "#t" + tipo[0].toUpperCase() + tipo.slice(1)));
    svgEl.classList.toggle("tool", !!tipo);
    aggiornaIstruzioni();
    disegnaStrumento();
  }
  function aggiornaIstruzioni() {
    $("#mTool").textContent = strumento ? `${ISTR[strumento.tipo][strumento.punti.length] || ""} · Esc per annullare` : "";
  }
  $("#tScala").onclick = () => impostaStrumento(strumento?.tipo === "scala" ? null : "scala");
  $("#tFila").onclick = () => impostaStrumento(strumento?.tipo === "fila" ? null : "fila");
  $("#tArco").onclick = () => impostaStrumento(strumento?.tipo === "arco" ? null : "arco");

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  function cerchio(a, b, c) {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-6) return null;
    const ux = ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / d;
    const uy = ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / d;
    const r = Math.hypot(a.x - ux, a.y - uy);
    const a1 = Math.atan2(a.y - uy, a.x - ux), a2 = Math.atan2(b.y - uy, b.x - ux), a3 = Math.atan2(c.y - uy, c.x - ux);
    const norm = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let delta = norm(a3 - a1);
    if (norm(a2 - a1) > delta) delta -= 2 * Math.PI; // il punto medio sta dall'altra parte
    return { cx: ux, cy: uy, r, a1, delta, lung: Math.abs(delta) * r };
  }
  const quanteCi = (lungUnita) => {
    const s = scala(), g = layout.corridoio || 0;
    return Math.max(1, Math.floor((lungUnita / s + g) / (dimNuove.w + g)));
  };
  function disegnaStrumento() {
    const gT = $("#gT");
    if (!gT) return;
    if (!strumento) { gT.innerHTML = ""; return; }
    const pts = [...strumento.punti, ...(strumento.cursore ? [strumento.cursore] : [])];
    const k = view.w / 1000;
    let h = pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${5 * k}" fill="#a3222f" stroke="#fff" stroke-width="${1.5 * k}"/>`).join("");
    let testo = "";
    if (pts.length >= 2) {
      if (strumento.tipo === "arco" && pts.length >= 3) {
        const c = cerchio(pts[0], pts[1], pts[2]);
        if (c) {
          const fine = { x: c.cx + c.r * Math.cos(c.a1 + c.delta), y: c.cy + c.r * Math.sin(c.a1 + c.delta) };
          h += `<path d="M${pts[0].x},${pts[0].y} A${c.r},${c.r} 0 ${Math.abs(c.delta) > Math.PI ? 1 : 0} ${c.delta > 0 ? 1 : 0} ${fine.x},${fine.y}" fill="none" stroke="#a3222f" stroke-width="${2.5 * k}" stroke-dasharray="${8 * k} ${5 * k}"/>`;
          testo = `${fmt(c.lung / scala())} m · circa ${quanteCi(c.lung)} postazioni ${dimNuove.w}×${dimNuove.h}`;
        }
      } else {
        h += `<line x1="${pts[0].x}" y1="${pts[0].y}" x2="${pts[1].x}" y2="${pts[1].y}" stroke="#a3222f" stroke-width="${2.5 * k}" stroke-dasharray="${8 * k} ${5 * k}"/>`;
        const L = dist(pts[0], pts[1]);
        testo = strumento.tipo === "scala" ? (layout.scala ? `${fmt(L / scala())} m con la scala attuale` : "") : strumento.tipo === "fila" ? `${fmt(L / scala())} m · circa ${quanteCi(L)} postazioni ${dimNuove.w}×${dimNuove.h}` : "";
      }
      const u = pts[pts.length - 1];
      const destra = u.x > view.x + view.w * 0.55;
      if (testo) h += `<text x="${u.x + (destra ? -10 : 10) * k}" y="${u.y - 10 * k}" text-anchor="${destra ? "end" : "start"}" style="font:800 ${14 * k}px Nunito,Arial;fill:#a3222f;paint-order:stroke;stroke:#fff;stroke-width:${4 * k}px">${esc(testo)}</text>`;
    }
    gT.innerHTML = h;
  }
  function puntoStrumento(pt) {
    strumento.punti.push(pt);
    const { tipo, punti } = strumento;
    if (tipo === "scala" && punti.length === 2) {
      const L = dist(punti[0], punti[1]);
      const m = parseFloat(String(prompt("Quanti metri reali ci sono tra i due punti?", "10") || "").replace(",", "."));
      if (m > 0 && L > 0) {
        snapshot();
        layout.scala = L / m; layout.scalaVerificata = true;
        impostaStrumento(null); modificato();
        $("#mSalvato").textContent = `✓ scala impostata: 1 m = ${fmt(layout.scala)} px`;
      } else impostaStrumento(null);
      return;
    }
    if (tipo === "fila" && punti.length === 2) return creaFila(punti[0], punti[1]);
    if (tipo === "arco" && punti.length === 3) return creaArco(punti[0], punti[1], punti[2]);
    aggiornaIstruzioni(); disegnaStrumento();
  }
  function chiediQuante(lung) {
    const proposta = quanteCi(lung);
    const n = parseInt(prompt(`Lunghezza ${fmt(lung / scala())} m: ci stanno ${proposta} postazioni ${dimNuove.w}×${dimNuove.h} m con ${fmt(layout.corridoio)} m di passaggio.\nQuante ne creo?`, String(proposta)) || "", 10);
    return n > 0 && n <= 200 ? n : 0;
  }
  function creaFila(a, b) {
    const L = dist(a, b), n = chiediQuante(L);
    impostaStrumento(null);
    if (!n) return;
    snapshot(); sel.clear();
    const ang = deg(Math.atan2(b.y - a.y, b.x - a.x));
    const tipo = dimNuove.tipo || "prato";
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      sel.add(aggiungi(tipo, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, normDeg(ang)).id);
    }
    modificato();
  }
  function creaArco(a, m, b) {
    const c = cerchio(a, m, b);
    if (!c) return creaFila(a, b);
    const n = chiediQuante(c.lung);
    impostaStrumento(null);
    if (!n) return;
    snapshot(); sel.clear();
    const tipo = dimNuove.tipo || "prato";
    for (let i = 0; i < n; i++) {
      const t = c.a1 + (c.delta * (i + 0.5)) / n;
      sel.add(aggiungi(tipo, c.cx + c.r * Math.cos(t), c.cy + c.r * Math.sin(t), normDeg(deg(t) + 90)).id);
    }
    modificato();
  }

  /* ---------- Zoom e spostamento ---------- */
  function puntoSvg(e) {
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: q.x, y: q.y };
  }
  function zoom(f, c) {
    const nw = clamp(view.w / f, W() / 25, W() * 1.5);
    const k = nw / view.w;
    c = c || { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    view = { x: c.x - (c.x - view.x) * k, y: c.y - (c.y - view.y) * k, w: nw, h: view.h * k };
    applicaView(); disegnaStrumento();
  }
  svgEl.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, puntoSvg(e)); }, { passive: false });
  $("#zIn").onclick = () => zoom(1.4);
  $("#zOut").onclick = () => zoom(1 / 1.4);
  $("#zFit").onclick = () => { view = { x: 0, y: 0, w: W(), h: H() }; applicaView(); disegnaStrumento(); };

  /* ---------- Puntatore: selezione, trascinamento, pan ---------- */
  let azione = null; // { tipo: "pan"|"move", ... }
  svgEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const pt = puntoSvg(e);
    if (modifica && strumento) return; // i punti dello strumento si prendono al rilascio
    const g = e.target.closest(".pst");
    if (modifica && g) {
      const id = g.dataset.id;
      if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); disegna(); return; }
      if (!sel.has(id)) { sel.clear(); sel.add(id); }
      const orig = layout.postazioni.filter((p) => sel.has(p.id)).map((p) => ({ p, x: p.x, y: p.y }));
      azione = { tipo: "move", start: pt, orig, mosso: false, snap: false };
    } else {
      azione = { tipo: "pan", startClient: { x: e.clientX, y: e.clientY }, view0: { ...view }, mosso: false, suPst: g?.dataset.id || null };
    }
    svgEl.setPointerCapture(e.pointerId);
  });
  svgEl.addEventListener("pointermove", (e) => {
    if (modifica && strumento) { strumento.cursore = puntoSvg(e); disegnaStrumento(); return; }
    if (!azione) return;
    if (azione.tipo === "pan") {
      const r = svgEl.getBoundingClientRect();
      const dx = ((e.clientX - azione.startClient.x) / r.width) * azione.view0.w;
      const dy = ((e.clientY - azione.startClient.y) / r.height) * azione.view0.h;
      if (Math.abs(e.clientX - azione.startClient.x) + Math.abs(e.clientY - azione.startClient.y) > 4) { azione.mosso = true; svgEl.classList.add("panning"); }
      if (azione.mosso) { view = { ...azione.view0, x: azione.view0.x - dx, y: azione.view0.y - dy }; applicaView(); }
      return;
    }
    const q = puntoSvg(e);
    const dx = q.x - azione.start.x, dy = q.y - azione.start.y;
    if (!azione.mosso && Math.hypot(dx, dy) < view.w / 300) return;
    if (!azione.snap) { snapshot(); azione.snap = true; }
    azione.mosso = true;
    for (const o of azione.orig) { o.p.x = clamp(Math.round(o.x + dx), 0, W()); o.p.y = clamp(Math.round(o.y + dy), 0, H()); }
    aggiornaGrafica();
  });
  svgEl.addEventListener("pointerup", (e) => {
    svgEl.classList.remove("panning");
    if (modifica && strumento) { puntoStrumento(puntoSvg(e)); return; }
    const a = azione; azione = null;
    if (!a) return;
    if (a.tipo === "move") { if (a.mosso) modificato(); else disegna(); return; }
    if (a.mosso) return; // era uno spostamento della vista
    // clic semplice
    if (modifica) { if (!e.shiftKey) { sel.clear(); disegna(); } return; }
    const pid = a.suPst;
    if (!pid) { selPost = null; disegna(); return; }
    if (selIscritto && !occupante(pid)) return assegna(selIscritto, pid);
    selPost = pid; disegna();
  });

  /* ---------- Tastiera (modifica) ---------- */
  document.addEventListener("keydown", (e) => {
    if ($("#vistaMappa").hidden || !modifica || document.querySelector("dialog[open]")) return;
    if (e.target.matches("input, textarea, select")) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (k === "Escape") { if (strumento) impostaStrumento(null); else { sel.clear(); disegna(); } return; }
    if (mod && k.toLowerCase() === "z") { e.preventDefault(); annulla(); return; }
    if (mod && k.toLowerCase() === "d") { e.preventDefault(); duplica(); return; }
    if (mod && k.toLowerCase() === "a") { e.preventDefault(); layout.postazioni.forEach((p) => sel.add(p.id)); disegna(); return; }
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); elimina(); return; }
    if (k.toLowerCase() === "r") { ruota(e.shiftKey ? -15 : 15); return; }
    if (k.toLowerCase() === "s" && !mod) { impostaStrumento("scala"); return; }
    if (k.toLowerCase() === "f" && !mod) { impostaStrumento("fila"); return; }
    const passo = e.shiftKey ? 1 : 0.1;
    const freccia = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[k];
    if (freccia && sel.size) { e.preventDefault(); sposta(...freccia); }
  });

  /* ---------- Assegnazione ---------- */
  async function assegna(iscrId, pid, g = giorno) {
    const r = dati().find((x) => x.id === iscrId);
    try {
      const { iscritto } = await MA.api(`/api/admin/iscritti?id=${encodeURIComponent(iscrId)}`, { method: "PATCH", body: JSON.stringify({ postazione: { giorno: g, id: pid } }) });
      Object.assign(r, iscritto);
      if (pid === null) delete r.postazioni?.[g];
      selIscritto = null; selPost = pid;
      MA.renderElenco(); disegna();
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
  svgEl.addEventListener("dragover", (e) => { if (!modifica && e.target.closest(".pst.lib")) e.preventDefault(); });
  svgEl.addEventListener("drop", (e) => {
    const g = e.target.closest(".pst.lib"), id = e.dataTransfer.getData("text/plain");
    if (g && id) { e.preventDefault(); assegna(id, g.dataset.id); }
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

  /* ---------- Planimetria: immagine o PDF ---------- */
  async function immagineDaPdf(file) {
    const pdfjs = await import(location.origin + "/vendor/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = location.origin + "/vendor/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let num = 1;
    if (doc.numPages > 1) num = clamp(parseInt(prompt(`Il PDF ha ${doc.numPages} pagine: quale contiene la planimetria?`, "1") || "1", 10) || 1, 1, doc.numPages);
    const page = await doc.getPage(num);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 2400 / Math.max(v1.width, v1.height) });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }
  async function immagineDaFile(file) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("immagine non leggibile")); i.src = URL.createObjectURL(file); });
    const k = Math.min(1, 2400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  $("#mFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    $("#mSalvato").textContent = "caricamento planimetria…";
    try {
      const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (!pdf && !f.type.startsWith("image/")) throw new Error("usa un'immagine (JPG, PNG) o un PDF");
      const c = pdf ? await immagineDaPdf(f) : await immagineDaFile(f);
      let data = c.toDataURL("image/jpeg", 0.85);
      if (data.length > 5.5e6) data = c.toDataURL("image/jpeg", 0.7);
      const r = await MA.api("/api/admin/mappa/sfondo", { method: "PUT", body: JSON.stringify({ data, w: c.width, h: c.height }) });
      layout = r.layout; storia = [];
      view = { x: 0, y: 0, w: W(), h: H() };
      await caricaSfondo(); sel.clear(); disegna();
      $("#mSalvato").textContent = "✓ planimetria caricata";
      alert("Planimetria caricata.\n\nOra imposta la scala: clicca 📏 Imposta scala e poi due punti di cui conosci la distanza (es. la barra della scala o un lato di un edificio). Dopo sposta le postazioni nei punti giusti.");
      impostaStrumento("scala");
    } catch (err) { $("#mSalvato").textContent = ""; alert("Caricamento non riuscito: " + (err.message || err)); }
  });
  $("#mSchema").onclick = async () => {
    if (!layout.sfondo) return alert("Stai già usando la mappa schematica.");
    if (!confirm("Tornare alla mappa schematica? La planimetria caricata verrà rimossa.")) return;
    const r = await MA.api("/api/admin/mappa/sfondo", { method: "DELETE" });
    layout = r.layout; storia = [];
    view = { x: 0, y: 0, w: W(), h: H() };
    await caricaSfondo(); disegna();
  };

  /* ---------- Stampa ---------- */
  $("#mStampa").onclick = () => {
    const vecchio = { modifica, sel: [...sel], selPost, selIscritto, view };
    modifica = false; sel.clear(); selPost = null; selIscritto = null; view = { x: 0, y: 0, w: W(), h: H() };
    disegna();
    const svg = svgEl.cloneNode(true);
    svg.querySelector("#gT")?.remove();
    svg.removeAttribute("class"); svg.removeAttribute("style");
    modifica = vecchio.modifica; vecchio.sel.forEach((id) => sel.add(id)); selPost = vecchio.selPost; selIscritto = vecchio.selIscritto; view = vecchio.view;
    disegna();
    const righe = layout.postazioni.slice().sort(ordineLabel).map((p) => {
      const r = occupante(p.id);
      const caratt = `${p.tipo === "asfalto" ? "Asfalto" : "Prato"} ${fmt(p.w)}×${fmt(p.h)}${p.corrente ? " ⚡" : ""}`;
      if (!r) return `<tr class="vuota"><td><b>${esc(p.label)}</b></td><td>${caratt}</td><td colspan="5">— libera —</td></tr>`;
      return `<tr><td><b>${esc(p.label)}</b></td><td>${caratt}</td><td><b>${esc(r.cognome)} ${esc(r.nome)}</b></td><td>${esc(r.descrizione.slice(0, 70))}</td><td>${esc(r.telefono)}</td>
        <td>${r.gazebo === "Sì" ? "Gazebo" : ""}${r.corrente === "Sì" ? " · Corrente" : ""}</td><td>${r.pagamento ? "Pagato" : "<b>DA PAGARE</b>"}</td></tr>`;
    }).join("");
    const senza = assegnabili().filter((r) => partecipa(r, giorno) && !r.postazioni?.[giorno]);
    const w = window.open("", "_blank");
    if (!w) return alert("Il browser ha bloccato la finestra di stampa: consenti i pop-up per questo sito.");
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Postazioni ${GIORNO_LBL[giorno]}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#222;margin:0;padding:12mm}
        h1{font-size:19px;margin:0 0 2px;color:#5b1f24} .sub{color:#666;font-size:12px;margin-bottom:8px}
        svg{width:100%;height:auto;border:1px solid #ccc;display:block}
        .pst .lbl{font-family:Arial;font-weight:bold} .pst .nome{font-family:Arial;font-weight:bold;fill:#222;paint-order:stroke;stroke:#fff}
        .pst.warn .box{stroke:#d00!important} .pst .ovl{fill:url(#hatch)}
        table{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px} th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
        th{background:#eee} tr.vuota td{color:#999} .pag{page-break-before:always}
        @page{size:A4;margin:0}
      </style></head><body>
      <h1>Natale a Spinone · Postazioni ${GIORNO_LBL[giorno]}</h1>
      <div class="sub">Stampato il ${new Date().toLocaleString("it-IT")} · ${layout.postazioni.filter((p) => occupante(p.id)).length} occupate su ${layout.postazioni.length} · allestimento 8.00–9.30, apertura 10.00${layout.scalaVerificata ? " · mappa in scala" : ""}</div>
      ${svg.outerHTML}
      <div class="pag"></div>
      <h1>Elenco postazioni · ${GIORNO_LBL[giorno]}</h1>
      <table><thead><tr><th>Post.</th><th>Tipo</th><th>Espositore</th><th>Merce</th><th>Telefono</th><th>Note</th><th>Quota</th></tr></thead><tbody>${righe}</tbody></table>
      ${senza.length ? `<p style="font-size:12px;color:#a3222f"><b>Ancora senza postazione:</b> ${senza.map((r) => esc(r.nome + " " + r.cognome)).join(", ")}</p>` : ""}
      <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };
})();
