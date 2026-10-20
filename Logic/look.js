/* Вид: прозрачность и размытие верхней панели, логотип по центру классического экрана. */
const Look = (() => {
  const DEF_TRANS = 30, DEF_BLUR = 12;   // как в базовом стиле: rgba(…,0.7) + blur(12px)
  const root = document.documentElement;

  // переменные по умолчанию + правило без !important — темы со своим фоном панели перекроют его
  const st = document.createElement("style");
  st.id = "lookStyle";
  st.textContent = [
    ":root{ --tb-alpha:0.7; --tb-blur:12px; }",
    ".topbar{ background:rgba(15,17,20,var(--tb-alpha)); backdrop-filter:blur(var(--tb-blur)); -webkit-backdrop-filter:blur(var(--tb-blur)); }",
    "body.hide-center-logo .classic-center{ opacity:0; pointer-events:none; }",
    ".classic-center{ transition:opacity .2s; }"
  ].join("\n");
  document.head.appendChild(st);

  const $ = (id) => document.getElementById(id);

  function applyTrans(v) {
    root.style.setProperty("--tb-alpha", (1 - v / 100).toFixed(2));
    const el = $("tbTransVal"); if (el) el.textContent = v + "%";
  }
  function applyBlur(v) {
    root.style.setProperty("--tb-blur", v + "px");
    const el = $("tbBlurVal"); if (el) el.textContent = v + "px";
  }
  function applyLogo(show) {
    document.body.classList.toggle("hide-center-logo", !show);
    const box = $("logoCheck"); if (box) box.classList.toggle("on", show);
  }

  function slider(id, key, def, applyFn) {
    const el = $(id); if (!el) return;
    const v = (App.state && App.state[key] != null) ? App.state[key] : def;
    el.value = v; applyFn(v);
    el.addEventListener("input", () => { applyFn(+el.value); if (App.state) { App.state[key] = +el.value; persist(); } });
    const reset = $(id + "Reset");
    if (reset) reset.addEventListener("click", () => {
      el.value = def; applyFn(def);
      if (App.state) { App.state[key] = def; persist(); }
    });
  }

  function init() {
    slider("tbTrans", "tbTrans", DEF_TRANS, applyTrans);
    slider("tbBlur", "tbBlur", DEF_BLUR, applyBlur);
    applyLogo(!(App.state && App.state.hideLogo));
    const box = $("logoCheck");
    if (box) box.parentElement.addEventListener("click", () => {
      const show = !box.classList.contains("on");
      applyLogo(show);
      if (App.state) { App.state.hideLogo = !show; persist(); }
    });
  }

  // ждём загрузку состояния (оно приходит из Python после старта)
  let tries = 0;
  (function wait() {
    if (App.state || tries++ > 50) { init(); return; }
    setTimeout(wait, 100);
  })();

  return {};
})();
