/* Выбор акцентного цвета + панорама-фон. Поддержка своих тем. Сохраняется в state. */
const Theme = (() => {
  const PALETTE = [
    { id:"green",  accent:"#4caf50", dark:"#1b5e20" },
    { id:"blue",   accent:"#3b82f6", dark:"#1e3a8a" },
    { id:"purple", accent:"#8b5cf6", dark:"#4c1d95" },
    { id:"orange", accent:"#f59e0b", dark:"#92400e" },
    { id:"pink",   accent:"#ec4899", dark:"#831843" },
    { id:"cyan",   accent:"#06b6d4", dark:"#164e63" },
    { id:"red",    accent:"#ef4444", dark:"#7f1d1d" },
    { id:"warden", accent:"#20b6b6", dark:"#0a3d3d" },
    { id:"fox",    accent:"#e8823a", dark:"#7a3d12" },
    { id:"cat",         accent:"#b98a5e", dark:"#5c4326" },
    { id:"sunset",      accent:"#ff6b4a", dark:"#7c2d12" },
    { id:"cat_diamond", accent:"#4dd0e1", dark:"#155e6b" },
    { id:"nissan", accent:"#ff9dc4", dark:"#3a4048" },
    { id:"bmw_m4",     accent:"#34763b", dark:"#012d54" },
    { id:"porsche",    accent:"#3f008c", dark:"#6b000e" },
    { id:"redbull",    accent:"#7d0e0e", dark:"#0e1836" },
  ];

  let stateReady = false;
  const WITH_PANORAMA = ["green", "blue", "purple", "orange", "cyan", "pink", "red", "warden", "fox", "cat", "sunset", "cat_diamond", "nissan", "bmw_m4", "porsche", "redbull"];
  const PANORAMA_EXT = { green:"jpg", blue:"png", purple:"png", orange:"png", cyan:"png", pink:"png", red:"png", warden:"jpg", fox:"jpg", cat:"jpg", sunset:"jpg", cat_diamond:"jpg", nissan:"png", bmw_m4:"jpg", porsche:"jpg", redbull:"jpg" };

  function customThemes() {
    return (App.state && Array.isArray(App.state.customThemes)) ? App.state.customThemes : [];
  }

  function findTheme(id) {
    return PALETTE.find(x => x.id === id) || customThemes().find(x => x.id === id) || null;
  }

  function panoramaUrl(id) {
    const custom = customThemes().find(x => x.id === id);
    if (custom) return custom.img;           // data-URL
    const pick = WITH_PANORAMA.includes(id) ? id : "green";
    return `Panoramas/${pick}_panorama.${PANORAMA_EXT[pick] || "jpg"}`;
  }

  function hasPanorama(id) {
    return WITH_PANORAMA.includes(id) || customThemes().some(x => x.id === id);
  }

  function cacheBgThumb(url) {
    try {
      if (!url.startsWith("data:")) { localStorage.setItem("mc_bg", JSON.stringify(url)); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const maxW = 640;
          const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
          const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || maxW) * scale));
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          localStorage.setItem("mc_bg", JSON.stringify(c.toDataURL("image/jpeg", 0.6)));
        } catch (e) { try { localStorage.removeItem("mc_bg"); } catch (_) {} }
      };
      img.onerror = () => {};
      img.src = url;
    } catch (e) {}
  }

     function applyBackground(id) {
    if (!stateReady) return;
    const enabled = !(App.state && App.state.panorama === false);
    const appBg = document.getElementById("appBg");
    const url = hasPanorama(id) ? panoramaUrl(id) : panoramaUrl("green");
    if (appBg) appBg.style.backgroundImage = `url("${url}")`;
    document.body.classList.toggle("show-panorama", enabled);
    const bg = document.getElementById("splashBg");
    if (bg) {
      if (enabled) { bg.style.backgroundImage = `url("${url}")`; bg.style.display = ""; }
      else { bg.style.display = "none"; }
    }
    if (!enabled) {
      try { localStorage.setItem("mc_bg", JSON.stringify("")); } catch (e) {}
    } else {
      cacheBgThumb(url);
    }
  }


  function apply(id) {
    const p = findTheme(id) || PALETTE[0];
    document.documentElement.style.setProperty("--accent", p.accent);
    document.documentElement.style.setProperty("--accent-dark", p.dark);
    document.querySelectorAll("#themeRow .theme-dot, #customThemeRow .theme-dot")
      .forEach(d => d.classList.toggle("active", d.dataset.id === p.id));
    applyBackground(p.id);
  }

  function pick(id) {
    if (App.state) { App.state.theme = id; persist(); }
    apply(id);
    if (typeof Achievements !== "undefined") Achievements.unlock("theme_change");
  }

  function makeDot(p, removable) {
    const d = document.createElement("div");
    d.className = "theme-dot";
    d.dataset.id = p.id;
    d.style.background = p.accent;
    d.title = p.name || p.id;
    d.addEventListener("click", () => pick(p.id));
    if (removable) {
      const x = document.createElement("span");
      x.className = "theme-dot-x";
      x.textContent = "×";
      x.addEventListener("click", (e) => { e.stopPropagation(); removeCustom(p.id); });
      d.appendChild(x);
    }
    return d;
  }

  function render() {
    const row = document.getElementById("themeRow");
    if (row) {
      row.innerHTML = "";
      PALETTE.forEach(p => row.appendChild(makeDot(p, false)));
    }
    renderCustom();
    apply((App.state && App.state.theme) || "green");
  }

  function renderCustom() {
    const row = document.getElementById("customThemeRow");
    if (!row) return;
    row.innerHTML = "";
    customThemes().forEach(p => row.appendChild(makeDot(p, true)));
  }

  // средний цвет картинки -> акцент
  function accentFromImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = 24; c.height = 24;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, 24, 24);
          const px = ctx.getImageData(0, 0, 24, 24).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < px.length; i += 4) {
            r += px[i]; g += px[i+1]; b += px[i+2]; n++;
          }
          r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
          const hex = (v) => v.toString(16).padStart(2, "0");
          const accent = `#${hex(r)}${hex(g)}${hex(b)}`;
          const dr = Math.round(r*0.4), dg = Math.round(g*0.4), db = Math.round(b*0.4);
          const dark = `#${hex(dr)}${hex(dg)}${hex(db)}`;
          resolve({ accent, dark });
        } catch (e) {
          resolve({ accent:"#6b7280", dark:"#374151" });
        }
      };
      img.onerror = () => resolve({ accent:"#6b7280", dark:"#374151" });
      img.src = dataUrl;
    });
  }

    function addCustom() {
    return (async () => {
      const res = await window.pywebview.api.pick_image();
      if (!res || !res.ok) return;
      const { accent, dark } = await accentFromImage(res.url);
      openNameModal(res.url, accent, dark);
    })();
  }

    function openNameModal(imgUrl, accent, dark) {
    const overlay = document.getElementById("themeNameModal");
    const preview = document.getElementById("tnPreview");
    const input = document.getElementById("tnName");
    const color = document.getElementById("tnColor");
    if (!overlay) return;
    preview.src = imgUrl;
    input.value = "Моя тема";
    color.value = accent;                    // авто-цвет из картинки как старт
    overlay.classList.add("show");
    setTimeout(() => { input.focus(); input.select(); }, 50);

    // живой предпросмотр акцента при выборе цвета
    const preview_accent = () => {
      document.documentElement.style.setProperty("--accent", color.value);
    };
    color.addEventListener("input", preview_accent);

    const darken = (hex) => {
      const n = hex.replace("#", "");
      const r = Math.round(parseInt(n.slice(0,2),16)*0.4);
      const g = Math.round(parseInt(n.slice(2,4),16)*0.4);
      const b = Math.round(parseInt(n.slice(4,6),16)*0.4);
      const h = (v) => v.toString(16).padStart(2, "0");
      return `#${h(r)}${h(g)}${h(b)}`;
    };

    const save = () => {
      const name = (input.value || "").trim() || "Моя тема";
      const chosen = color.value;
      const id = "custom_" + Date.now();
      if (!App.state.customThemes) App.state.customThemes = [];
      App.state.customThemes.push({ id, name, img: imgUrl, accent: chosen, dark: darken(chosen) });
      persist();
      renderCustom();
      pick(id);
      close();
    };
    const close = () => {
      overlay.classList.remove("show");
      btnSave.removeEventListener("click", save);
      btnCancel.removeEventListener("click", close);
      input.removeEventListener("keydown", onKey);
      color.removeEventListener("input", preview_accent);
      apply((App.state && App.state.theme) || "green");  // вернуть акцент, если отменили
    };
    const onKey = (e) => {
      if (e.key === "Enter") save();
      if (e.key === "Escape") close();
    };
    const btnSave = document.getElementById("tnSave");
    const btnCancel = document.getElementById("tnCancel");
    btnSave.addEventListener("click", save);
    btnCancel.addEventListener("click", close);
    input.addEventListener("keydown", onKey);
  }



  function removeCustom(id) {
    if (!App.state.customThemes) return;
    App.state.customThemes = App.state.customThemes.filter(x => x.id !== id);
    if (App.state.theme === id) { App.state.theme = "green"; }
    persist();
    renderCustom();
    apply((App.state && App.state.theme) || "green");
  }

  function initPanoramaToggle() {
    const box = document.getElementById("panoramaCheck");
    if (!box) return;
    const enabled = !(App.state && App.state.panorama === false);
    box.classList.toggle("on", enabled);
    box.parentElement.addEventListener("click", () => {
      const next = !box.classList.contains("on");
      box.classList.toggle("on", next);
      if (App.state) { App.state.panorama = next; persist(); }
      apply((App.state && App.state.theme) || "green");
    });
  }
  function initBetaToggle() {
    const box = document.getElementById("betaCheck");
    if (!box) return;
    const enabled = !(App.state && App.state.showBeta === false);
    const applyBeta = (on) => {
      document.querySelectorAll(".beta-feature").forEach(el => {
        el.style.display = on ? "" : "none";
      });
      // если скрыли и сейчас открыта вкладка датапаков — вернуть на главную
      if (!on) {
        const dp = document.getElementById("page-datapacks");
        if (dp && dp.classList.contains("active")) {
          const home = document.querySelector('.tab[data-tab="home"]');
          if (home) home.click();
        }
      }
    };
    box.classList.toggle("on", enabled);
    applyBeta(enabled);
    box.parentElement.addEventListener("click", () => {
      const next = !box.classList.contains("on");
      box.classList.toggle("on", next);
      applyBeta(next);
      if (App.state) { App.state.showBeta = next; persist(); }
    });
  }



  function initAddBtn() {
    const btn = document.getElementById("addThemeBtn");
    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); addCustom(); });
  }

  function init() { render(); initPanoramaToggle(); initAddBtn(); initBetaToggle(); }

  function ready() {
    stateReady = true;
    apply((App.state && App.state.theme) || "green");
    // Фон применён — плавно убираем затемняющий слой (даём кадр на отрисовку фона).
    const fade = document.getElementById("bootFade");
    if (fade) requestAnimationFrame(() => requestAnimationFrame(() => fade.classList.add("gone")));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }

  return { init, apply, render, ready };
})();
