(() => {
  const form = document.getElementById("form");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const MAX_FOTO = 5;
  const foto = []; // { data: dataURL }

  /* ---------- Motivazione asfalto ---------- */
  const motivoWrap = $("#motivoWrap");
  $$('input[name="asfalto"]').forEach((r) =>
    r.addEventListener("change", () => (motivoWrap.hidden = r.value !== "Sì" || !r.checked))
  );

  /* ---------- Quota indicativa ---------- */
  const euro = (n) => "€ " + n.toFixed(2).replace(".", ",");
  function aggiornaQuota() {
    const tipo = $('input[name="tipo"]:checked')?.value;
    const giorni = $$('input[name="giorni"]:checked').length;
    const corrente = $('input[name="corrente"]:checked')?.value === "Sì";
    if (!tipo || !giorni) {
      $("#quotaVal").textContent = "€ —";
      $("#quotaDett").textContent = "Seleziona tipo di merce e giorni";
      return;
    }
    const base = tipo === "3" ? 50 * giorni : giorni >= 2 ? 30 : 20;
    const extra = corrente ? (tipo === "3" ? 20 : 5) * giorni : 0;
    $("#quotaVal").textContent = euro(base + extra);
    $("#quotaDett").textContent =
      `Spazio ${euro(base)}` + (extra ? ` + corrente ${euro(extra)}` : "") + ` · ${giorni} ${giorni > 1 ? "giorni" : "giorno"}`;
  }
  form.addEventListener("change", aggiornaQuota);

  /* ---------- Foto: ridimensionamento nel browser ---------- */
  const input = $("#foto");
  const drop = $("#drop");
  const thumbs = $("#thumbs");

  function ridimensiona(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        let { width: w, height: h } = img;
        const k = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * k); h = Math.round(h * k);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("formato")); };
      img.src = url;
    });
  }

  function disegnaThumbs() {
    thumbs.innerHTML = "";
    foto.forEach((f, i) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.innerHTML = `<img alt="Foto ${i + 1}"><button type="button" aria-label="Rimuovi foto">×</button>`;
      d.querySelector("img").src = f.data;
      d.querySelector("button").onclick = () => { foto.splice(i, 1); disegnaThumbs(); };
      thumbs.appendChild(d);
    });
    drop.style.display = foto.length >= MAX_FOTO ? "none" : "";
  }

  async function aggiungiFile(files) {
    let scartate = 0;
    for (const file of files) {
      if (foto.length >= MAX_FOTO) break;
      if (!file.type.startsWith("image/") && !/\.hei[cf]$/i.test(file.name)) continue;
      try { foto.push({ data: await ridimensiona(file) }); }
      catch { scartate++; }
    }
    disegnaThumbs();
    if (scartate) alertBox(`${scartate} foto non leggibili dal browser (es. formato HEIC): prova a caricarle in JPG.`);
  }

  input.addEventListener("change", () => { aggiungiFile([...input.files]); input.value = ""; });
  ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.borderColor = "var(--olive)"; }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => (drop.style.borderColor = "")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); aggiungiFile([...e.dataTransfer.files]); });

  /* ---------- Validazione ---------- */
  const errBox = $("#formError");
  function alertBox(msg) { errBox.textContent = msg; errBox.classList.add("show"); }

  const checks = {
    nome: () => form.nome.value.trim(),
    cognome: () => form.cognome.value.trim(),
    telefono: () => /^[+\d][\d\s./-]{5,}$/.test(form.telefono.value.trim()),
    email: () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim()),
    giaPartecipato: () => $('input[name="giaPartecipato"]:checked'),
    tipo: () => $('input[name="tipo"]:checked'),
    giorni: () => $('input[name="giorni"]:checked'),
    descrizione: () => form.descrizione.value.trim(),
    gazebo: () => $('input[name="gazebo"]:checked'),
    corrente: () => $('input[name="corrente"]:checked'),
    asfalto: () => $('input[name="asfalto"]:checked'),
    accettaRegolamento: () => form.accettaRegolamento.checked,
    accettaPrezzoPosizione: () => form.accettaPrezzoPosizione.checked,
    accettaPrivacy: () => form.accettaPrivacy.checked,
  };

  function valida() {
    let primo = null;
    for (const [k, fn] of Object.entries(checks)) {
      const el = $(`[data-field="${k}"]`);
      const ok = !!fn();
      el.classList.toggle("invalid", !ok);
      if (!ok && !primo) primo = el;
    }
    return primo;
  }
  form.addEventListener("input", (e) => {
    const f = e.target.closest("[data-field]");
    if (f && f.classList.contains("invalid") && checks[f.dataset.field]()) f.classList.remove("invalid");
  });
  form.addEventListener("change", (e) => {
    const f = e.target.closest("[data-field]");
    if (f && f.classList.contains("invalid") && checks[f.dataset.field]()) f.classList.remove("invalid");
  });

  /* ---------- Invio ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.remove("show");
    const primo = valida();
    if (primo) {
      primo.scrollIntoView({ behavior: "smooth", block: "center" });
      alertBox("Alcuni campi obbligatori non sono compilati correttamente.");
      return;
    }
    const val = (n) => $(`input[name="${n}"]:checked`)?.value;
    const payload = {
      sito_web: form.sito_web.value,
      nome: form.nome.value,
      cognome: form.cognome.value,
      telefono: form.telefono.value,
      email: form.email.value,
      giaPartecipato: val("giaPartecipato"),
      tipo: val("tipo"),
      giorni: $$('input[name="giorni"]:checked').map((c) => c.value),
      descrizione: form.descrizione.value,
      gazebo: val("gazebo"),
      corrente: val("corrente"),
      asfalto: val("asfalto"),
      motivoAsfalto: val("asfalto") === "Sì" ? form.motivoAsfalto.value : "",
      vicinoA: form.vicinoA.value,
      accettaRegolamento: form.accettaRegolamento.checked,
      accettaPrezzoPosizione: form.accettaPrezzoPosizione.checked,
      accettaPrivacy: form.accettaPrivacy.checked,
      foto,
    };

    const btn = $("#submitBtn");
    btn.disabled = true;
    btn.textContent = "Invio in corso…";
    try {
      const res = await fetch("/api/iscrizione", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Si è verificato un errore. Riprova tra qualche minuto.");
      form.hidden = true;
      $("#intro").hidden = true;
      $("#successNum").textContent = "Richiesta n. " + data.numero;
      if (data.emailInviata === false)
        $("#successMsg").textContent = "La richiesta è stata registrata, ma non siamo riusciti a inviarti l'email di riepilogo. Non preoccuparti: ti contatteremo noi.";
      $("#success").classList.add("show");
      $("#success").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      alertBox(err.message);
      btn.disabled = false;
      btn.textContent = "Invia la richiesta";
    }
  });
})();
