function boot(loaded) {
  App.state = loaded || { activeProfile: null, profiles: {} };
  if (!App.state.profiles) App.state.profiles = {};
  document.body.classList.add("tab-home");
  Theme.init();
    if (typeof Blocks !== "undefined") Blocks.initEdit();
  Theme.ready();
  ViewMode.init();
  if (hasProfile()) Profiles.load();
  else Welcome.show();
  hideSplash();
}


Profiles.initDropdowns && Profiles.initDropdowns();
ProfileModal.initDropdown();
Classic.initDropdown();

window.addEventListener("pywebviewready", () => {
  window.pywebview.api.get_system()
    .then((sys) => { App.SYS = Object.assign(App.SYS, sys || {}); })
    .then(() => window.pywebview.api.get_versions(false))
    .then((res) => { App.VERSIONS = (res && res.versions) || []; })
    .then(() => window.pywebview.api.load_state())
    .then(boot);
});

setTimeout(() => {
  if (!App.state) { App.VERSIONS = FALLBACK_VERSIONS.map(v => ({ id: v, type: "release" })); boot({ activeProfile: null, profiles: {} }); }
}, 600);

function hideSplash() {
  const sp = document.getElementById("splash");
  setTimeout(() => {
    document.body.classList.remove("loading");
    document.body.classList.add("app-enter");   // интерфейс проявляется снизу
    if (sp) sp.classList.add("hide");            // заставка уезжает вверх
  }, 1600);
  setTimeout(() => {
    if (sp) sp.style.display = "none";
    document.body.classList.remove("app-enter"); // чистим класс после анимации
  }, 2400);
}




setTimeout(() => {
  const sp = document.getElementById("splash");
  if (sp && !sp.classList.contains("hide")) hideSplash();
}, 3000);

window.addEventListener("wheel", (e) => {
  // разрешаем горизонтальный свайп внутри прокручиваемых блоков
  if (e.target.closest(".iv-gallery, .mi-gallery, .idea-gallery, .sort-bar, .mods-cats")) return;
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
}, { passive: false });

window.addEventListener("popstate", () => { history.pushState(null, "", location.href); });
history.pushState(null, "", location.href);

// Параллакс фона за мышью
(function () {
  let raf = null, tx = 0, ty = 0, cx = 0, cy = 0;
  const STRENGTH = 14; // сила смещения в px (больше = сильнее)

  function onMove(e) {
    // смещение от центра экрана, от -1 до 1
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    tx = -nx * STRENGTH;
    ty = -ny * STRENGTH;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    // плавное приближение к цели (инерция)
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    const bg = document.getElementById("appBg");
    if (bg) bg.style.transform = `scale(1.08) translate(${cx}px, ${cy}px)`;
    if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
    }
  }

  document.addEventListener("mousemove", onMove);
})();
