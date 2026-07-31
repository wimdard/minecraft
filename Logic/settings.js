/* Панель настроек. */
const Settings = (() => {
  const wrap = document.getElementById("settingsWrap");
  const wrap2 = document.getElementById("settings2Wrap");
  const btn = document.getElementById("topSettings");

  document.getElementById("reloadBtn").addEventListener("click", () => {
    if (window.pywebview && window.pywebview.api) window.pywebview.api.reload_now();
    else location.reload();
  });

  const folderBtn = document.getElementById("openFolderBtn");
  if (folderBtn) {
    folderBtn.addEventListener("click", () => {
      if (api() && hasProfile()) api().open_game_folder(App.state.activeProfile);
    });
  }

  function open() {
    if (!hasProfile()) return;
    Profiles.closeMenu();
    Profiles.fill();
    loadVersions();
    wrap.classList.add("open");
  }

  function loadVersions() {
    const box = document.getElementById("verList");
    if (!api()) { box.innerHTML = '<div class="ver-empty">Доступно только через python3 main.py</div>'; return; }
    box.innerHTML = '<div class="ver-empty">Загрузка…</div>';
    api().list_versions(App.state.activeProfile).then((res) => {
      const vers = (res && res.versions) || [];
      if (!vers.length) { box.innerHTML = '<div class="ver-empty">Нет установленных версий</div>'; return; }
      box.innerHTML = "";
      vers.forEach((v) => {
        const row = document.createElement("div");
        row.className = "ver-row";
        row.title = "Открыть папку версии";
        row.innerHTML = `<span class="ver-name" title="${esc(v.id)}">${esc(v.id)}</span><span class="ver-size">${v.mb} МБ</span><button class="ver-del" title="Удалить">🗑</button>`;

        row.addEventListener("click", () => {
          if (api()) api().open_version_folder(App.state.activeProfile, v.id);
        });

        row.querySelector(".ver-del").addEventListener("click", (e) => {
          e.stopPropagation();
          askConfirm({ icon:"🗑", title:"Удалить версию?", text:`<b>${esc(v.id)}</b> (${v.mb} МБ) будет удалена.`, okText:"Удалить", okClass:"btn-danger" }, () => {
            api().delete_version(App.state.activeProfile, v.id).then((r) => { if (r.ok) { row.remove(); if (typeof Classic !== "undefined") Classic.render(); } });
          });
        });
        box.appendChild(row);
      });
    });
  }

  function closeP2() { if (wrap2) wrap2.classList.remove("reveal2"); }
  function close() { wrap.classList.remove("open"); closeP2(); }
  function toggle() { wrap.classList.contains("open") ? close() : open(); }

  btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  const overlay = document.getElementById("settingsOverlay");
  if (overlay) overlay.addEventListener("click", close);

  function initBgControls() {
    const dim = document.getElementById("bgDim");
    const blur = document.getElementById("bgBlur");
    if (!dim || !blur) return;
    const dimVal = document.getElementById("bgDimVal");
    const blurVal = document.getElementById("bgBlurVal");
    const applyDim = (v) => {
      document.documentElement.style.setProperty("--bg-bright", (1 - v / 100).toString());
      if (dimVal) dimVal.textContent = v + "%";
    };
    const applyBlur = (v) => {
      document.documentElement.style.setProperty("--bg-blur", v + "px");
      if (blurVal) blurVal.textContent = v + "px";
    };
    const d = (App.state && App.state.bgDim != null) ? App.state.bgDim : 78;
    const b = (App.state && App.state.bgBlur) || 0;
    dim.value = d; applyDim(d);
    blur.value = b; applyBlur(b);
    dim.addEventListener("input", () => { applyDim(dim.value); if (App.state) { App.state.bgDim = +dim.value; persist(); } });
    blur.addEventListener("input", () => { applyBlur(blur.value); if (App.state) { App.state.bgBlur = +blur.value; persist(); } });
    const dimReset = document.getElementById("bgDimReset");
    const blurReset = document.getElementById("bgBlurReset");
    if (dimReset) dimReset.addEventListener("click", () => {
      dim.value = 78; applyDim(78);
      if (App.state) { App.state.bgDim = 78; persist(); }
    });
    if (blurReset) blurReset.addEventListener("click", () => {
      blur.value = 0; applyBlur(0);
      if (App.state) { App.state.bgBlur = 0; persist(); }
    });
  }
  initBgControls();

  const openP2 = document.getElementById("openPanel2Btn");
  if (openP2 && wrap2) {
    openP2.addEventListener("click", () => {
      wrap2.classList.toggle("reveal2");
      if (wrap2.classList.contains("reveal2")) loadVersions();
    });
  }
  const overlay2 = document.getElementById("settingsOverlay2");
  if (overlay2) overlay2.addEventListener("click", close);

  // Клик вне панелей настроек — закрыть всё одним кликом. Учитываем только сами
  // панели (не затемнения), поэтому клик по overlay второй панели тоже закрывает.
  const panel1 = document.getElementById("settingsPanel");
  const panel2 = document.getElementById("settingsPanel2");
  document.addEventListener("click", (e) => {
    if (!wrap.classList.contains("open")) return;
    if (btn.contains(e.target)) return;
    const inPanel1 = panel1 && panel1.contains(e.target);
    const inPanel2 = panel2 && panel2.contains(e.target);
    if (!inPanel1 && !inPanel2) close();
  });
  const _mo = new MutationObserver(() => {
    if (!wrap.classList.contains("open") && wrap2) wrap2.classList.remove("reveal2");
  });
  _mo.observe(wrap, { attributes: true, attributeFilter: ["class"] });


  return { open, close };
})();
