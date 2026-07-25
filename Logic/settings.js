/* Выпадающая панель настроек (как меню профиля). */
const Settings = (() => {
  const wrap = document.getElementById("settingsWrap");
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

  function close() { wrap.classList.remove("open"); }
  function toggle() { wrap.classList.contains("open") ? close() : open(); }

  btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });

  return { open, close };
})();
