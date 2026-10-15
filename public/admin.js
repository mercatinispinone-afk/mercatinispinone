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
  const STATI = { in_attesa: "In attesa", accettato: "Accettato", rifiutato: "Rifiutato" };
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
          const txt = [r.numero, r.nome, r.cognome, r.email, r.telefono, r.descrizione, r.vicinoA, r.note].join(" ").toLowerCase();
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
    const att = dati.filter((r) => r.stato === "in_attesa").length;
    $("#stats").innerHTML = `
      <div class="stat"><div class="k">Iscritti</div><div class="v">${tot}</div><div class="s">${att} in attesa · ${acc.length} accettati</div></div>
      <div class="stat"><div class="k">Sabato 5</div><div class="v">${sab}</div><div class="s">espositori</div></div>
      <div class="stat"><div class="k">Domenica 6</div><div class="v">${dom}</div><div class="s">espositori</div></div>
      <div class="stat"><div class="k">Per tipo</div><div class="v" style="font-size:22px">${per("1")} · ${per("2")} · ${per("3")}</div><div class="s">tipo 1 · 2 · 3</div></div>
      <div class="stat"><div class="k">Quote accettati</div><div class="v" style="font-size:24px">${euro(acc.reduce((s, r) => s + r.quotaStimata, 0))}</div><div class="s">stima su ${euro(dati.reduce((s, r) => s + r.quotaStimata, 0))} totali</div></div>`;

    const lista = filtrati();
    $("#empty").hidden = lista.length > 0;
    $("#rows").innerHTML = lista
      .map(
        (r) => `<tr data-id="${esc(r.id)}">
        <td><strong>${esc(r.numero)}</strong></td>
        <td class="sub">${data(r.creato)}</td>
        <td><strong>${esc(r.cognome)} ${esc(r.nome)}</strong>${r.giaPartecipato === "Sì" ? '<div class="sub">già partecipato</div>' : ""}${r.foto?.length ? `<div class="sub">📷 ${r.foto.length} foto</div>` : ""}</td>
        <td><a href="mailto:${esc(r.email)}">${esc(r.email)}</a><div class="sub"><a href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a></div></td>
        <td><span class="tag t${r.tipo}">${r.tipo}) ${TIPI[r.tipo]}</span><div class="sub">${esc(r.descrizione.slice(0, 70))}${r.descrizione.length > 70 ? "…" : ""}</div></td>
        <td>${r.giorni.map((g) => `<span class="tag tg">${GIORNI[g]}</span>`).join("")}</td>
        <td class="sub">Gazebo: ${esc(r.gazebo)}<br>Corrente: ${esc(r.corrente)}<br>Asfalto: ${esc(r.asfalto)}</td>
        <td><strong>${euro(r.quotaStimata)}</strong></td>
        <td><select class="stato ${r.stato}" data-stato>${Object.entries(STATI).map(([k, v]) => `<option value="${k}" ${k === r.stato ? "selected" : ""}>${v}</option>`).join("")}</select></td>
        <td><button class="btn small ghost" data-open>Dettagli</button></td>
      </tr>`
      )
      .join("");
  }

  $("#rows").addEventListener("change", async (e) => {
    if (!e.target.matches("[data-stato]")) return;
    const id = e.target.closest("tr").dataset.id;
    const stato = e.target.value;
    try {
      const { iscritto } = await api(`/api/admin/iscritti?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ stato }) });
      Object.assign(dati.find((r) => r.id === id), iscritto);
      render();
    } catch (err) { alert(err.message); render(); }
  });
  $("#rows").addEventListener("click", (e) => {
    if (e.target.matches("[data-open]")) apri(e.target.closest("tr").dataset.id);
  });

  /* ---------- Dettaglio ---------- */
  const dlg = $("#dlg");
  $("#dClose").onclick = () => dlg.close();
  dlg.addEventListener("close", () => document.querySelectorAll("#dFoto img").forEach((i) => URL.revokeObjectURL(i.src)));

  async function apri(id) {
    const r = dati.find((x) => x.id === id);
    corrente = r;
    $("#dTitle").textContent = `n. ${r.numero} · ${r.nome} ${r.cognome}`;
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
    ];
    $("#dList").innerHTML = righe.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
    $("#dNote").value = r.note || "";
    const gal = $("#dFoto");
    gal.innerHTML = "";
    dlg.showModal();
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
