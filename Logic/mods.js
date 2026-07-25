const Mods = (() => {
  const modQuery = document.getElementById("modQuery");
  const modsList = document.getElementById("modsList");
  const modsCats = document.getElementById("modsCats");
  const searchWrap = document.getElementById("searchWrap");
  const typebar = document.getElementById("modsTypebar");

  let selectedCats = [], mode = "search", ptype = "mod", currentSort = "relevance";
  let searchTimer = null, offset = 0, total = 0, loading = false;
  const RESOLUTIONS = ["8x-","16x","32x","64x","128x","256x","512x+"];
  const CONTENT_TYPES = ["audio","fonts","models","gui","blocks","items","environment","equipment","locale","modded"];
  const collapsedGroups = {};

  const CAT_RU = {
    technology:"Технологии", adventure:"Приключения", magic:"Магия", utility:"Утилиты",
    optimization:"Оптимизация", decoration:"Декор", realistic:"Реализм", "vanilla-like":"Ванильные",
    themed:"Тематические", fantasy:"Фэнтези", food:"Еда", equipment:"Снаряжение",
    storage:"Хранение", mobs:"Мобы", worldgen:"Генерация мира", transportation:"Транспорт",
    economy:"Экономика", social:"Социальное", "game-mechanics":"Механики", library:"Библиотеки",
    management:"Управление", minigame:"Мини-игры", multiplayer:"Мультиплеер", cursed:"Странное",
    "quality-of-life":"Удобства", combat:"Бой", "8x-":"8x", "16x":"16x", "32x":"32x",
    "64x":"64x", "128x":"128x", "256x":"256x", "512x+":"512x+", blocks:"Блоки", entities:"Существа",
    items:"Предметы", gui:"Интерфейс", locale:"Локали", modded:"Для модов",
    simplistic:"Минимализм", tweaks:"Твики", atmosphere:"Атмосфера", bloom:"Свечение",
    colored:"Цветное", pbr:"PBR", reflections:"Отражения", shadows:"Тени",
    "path-tracing":"Трассировка", cartoon:"Мультяшное", high:"Высокое",
    medium:"Среднее", low:"Низкое", potato:"Слабый ПК", screenshot:"Скриншоты",
    audio:"Аудио", fonts:"Шрифты", models:"Модели", environment:"Окружение",
  };
  const catRu = (c) => CAT_RU[c] || c;

  function viewMode() { return (App.state && App.state.modsView) || "list"; }
  function applyView() { modsList.className = "mods-list " + (viewMode() === "grid" ? "as-grid" : "as-list"); }

  function bookmarks() {
    if (!hasProfile()) return [];
    const s = activeProfile().settings;
    if (!Array.isArray(s.bookmarks)) s.bookmarks = [];
    return s.bookmarks;
  }
  function isBookmarked(id) { return bookmarks().some(b => b.project_id === id); }
  function toggleBookmark(m) {
    const s = activeProfile().settings;
    if (!Array.isArray(s.bookmarks)) s.bookmarks = [];
    const i = s.bookmarks.findIndex(b => b.project_id === m.project_id);
    if (i >= 0) s.bookmarks.splice(i, 1);
    else {
      s.bookmarks.push({ project_id: m.project_id, title: m.title, icon_url: m.icon_url, author: m.author, ptype: ptype });
      if (typeof Achievements !== "undefined") Achievements.unlock("fav_mod");
    }
    persist();
  }

  document.getElementById("swSearch").addEventListener("click", () => switchMode("search"));
  document.getElementById("swInstalled").addEventListener("click", () => switchMode("installed"));
  document.getElementById("swFav").addEventListener("click", () => switchMode("fav"));
  modQuery.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(true), 400); });

  const importBtn = document.getElementById("modImport");
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      if (!api() || !hasProfile()) return;
      api().import_mod_file(App.state.activeProfile, ptype).then((r) => {
        if (r && r.ok) switchMode("installed");
        else if (r && r.error) askConfirm({ icon:"⚠️", title:"Не удалось", text: esc(r.error), okText:"Ок" }, null);
      });
    });
  }

  const sortBar = document.getElementById("sortBar");
  if (sortBar) {
    sortBar.querySelectorAll(".sort-chip").forEach((b) => {
      b.addEventListener("click", () => {
        sortBar.querySelectorAll(".sort-chip").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        currentSort = b.dataset.sort;
        doSearch(true);
      });
    });
  }

  const viewSwitch = document.getElementById("viewSwitch");
  if (viewSwitch) {
    viewSwitch.querySelectorAll(".vs-btn").forEach((b) => {
      b.addEventListener("click", () => {
        viewSwitch.querySelectorAll(".vs-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        if (App.state) { App.state.modsView = b.dataset.vw; persist(); }
        applyView();
      });
    });
  }

  typebar.querySelectorAll(".mtype").forEach((b) => {
    b.addEventListener("click", () => {
      typebar.querySelectorAll(".mtype").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      ptype = b.dataset.type;
      selectedCats = [];
      const isPack = ptype === "modpack";
      document.getElementById("swInstalled").style.display = isPack ? "none" : "";
      document.getElementById("swFav").style.display = isPack ? "none" : "";
      modsCats.style.display = isPack ? "none" : "";
      if (importBtn) importBtn.style.display = isPack ? "none" : "";
      if (isPack) { mode = "search"; document.getElementById("swSearch").classList.add("active"); document.getElementById("swInstalled").classList.remove("active"); document.getElementById("swFav").classList.remove("active"); }
      else loadCategories();
      if (mode === "search") doSearch(true); else if (mode === "installed") showInstalled(); else showFavorites();
    });
  });

  function switchMode(m) {
    if (ptype === "modpack") m = "search";
    mode = m;
    document.getElementById("swSearch").classList.toggle("active", m === "search");
    document.getElementById("swInstalled").classList.toggle("active", m === "installed");
    document.getElementById("swFav").classList.toggle("active", m === "fav");
    searchWrap.style.visibility = (m === "search") ? "visible" : "hidden";
    if (m === "search") doSearch(true); else if (m === "installed") showInstalled(); else showFavorites();
  }

  function onOpen() {
    if (!api()) { modsList.innerHTML = '<div class="mods-status error">Modrinth работает только через python3 main.py</div>'; return; }
    if (!hasProfile()) { modsList.innerHTML = '<div class="mods-status">Сначала создай профиль</div>'; return; }
    applyView();
    if (viewSwitch) viewSwitch.querySelectorAll(".vs-btn").forEach(b => b.classList.toggle("active", b.dataset.vw === viewMode()));
    if (ptype !== "modpack") loadCategories();
    if (mode === "search") doSearch(true); else if (mode === "installed") showInstalled(); else showFavorites();
  }

  function orderPopular(listArr) {
    const pop = ["technology","adventure","magic","utility","optimization","decoration","realistic","vanilla-like","themed","fantasy"];
    return [...listArr.filter(c => pop.includes(c)), ...listArr.filter(c => !pop.includes(c))];
  }

  function loadCategories() {
    api().get_categories(ptype).then((res) => {
      if (res.error) return;
      const all = res.categories;
      modsCats.innerHTML = "";
      const reset = document.createElement("button");
      reset.className = "cat-reset";
      reset.textContent = "Сбросить всё";
      reset.style.display = selectedCats.length ? "block" : "none";
      reset.onclick = () => { selectedCats = []; loadCategories(); doSearch(true); };
      if (ptype === "resourcepack") {
        const resList = RESOLUTIONS.filter(r => all.includes(r));
        const content = CONTENT_TYPES.filter(c => all.includes(c));
        const rest = all.filter(c => !RESOLUTIONS.includes(c) && !CONTENT_TYPES.includes(c));
        if (resList.length) renderGroup("Разрешение", resList, reset);
        if (content.length) renderGroup("Содержимое", content, reset);
        renderGroup("Категории", orderPopular(rest), reset);
      } else {
        renderGroup("Категории", orderPopular(all), reset);
      }
      modsCats.appendChild(reset);
    });
  }

  function renderGroup(title, cats, reset) {
    const h = document.createElement("h4");
    h.className = "cat-group-head" + (collapsedGroups[title] ? " collapsed" : "");
    h.innerHTML = `<span class="cat-arrow">▾</span><span>${esc(title)}</span>`;
    const body = document.createElement("div");
    body.className = "cat-group-body";
    body.style.display = collapsedGroups[title] ? "none" : "";
    h.onclick = () => { collapsedGroups[title] = !collapsedGroups[title]; body.style.display = collapsedGroups[title] ? "none" : ""; h.classList.toggle("collapsed", collapsedGroups[title]); };
    modsCats.appendChild(h);
    cats.forEach((c) => {
      const b = document.createElement("button");
      const on = selectedCats.includes(c);
      b.className = "cat-chip" + (on ? " active" : "");
      b.dataset.cat = c;
      b.innerHTML = (on ? '<span class="cat-check">✓</span>' : '') + esc(catRu(c));
      b.onclick = () => {
        const i = selectedCats.indexOf(c);
        if (i >= 0) selectedCats.splice(i, 1); else selectedCats.push(c);
        loadCategories(); doSearch(true);
      };
      body.appendChild(b);
    });
    modsCats.appendChild(body);
  }

  function doSearch(reset) {
    if (!api() || !hasProfile() || loading) return;
    const s = activeProfile().settings;
    if (reset) { offset = 0; total = 0; modsList.innerHTML = '<div class="mods-status">Загрузка…</div>'; }
    loading = true;
    const done = (res, isPack) => {
      loading = false;
      if (res.error) { modsList.innerHTML = '<div class="mods-status error">Ошибка сети: ' + res.error + '</div>'; return; }
      total = res.total || 0;
      if (reset) modsList.innerHTML = "";
      const oldMore = document.getElementById("moreBtn"); if (oldMore) oldMore.remove();
      if (!res.hits.length && reset) { modsList.innerHTML = '<div class="mods-status">Ничего не найдено</div>'; return; }
      res.hits.forEach((m) => modsList.appendChild(isPack ? packCard(m) : searchCard(m)));
      offset += res.hits.length;
      if (offset < total && res.hits.length) {
        const more = document.createElement("button");
        more.id = "moreBtn"; more.className = "more-btn";
        more.textContent = `Показать ещё (${offset} из ${total})`;
        more.onclick = () => { more.textContent = "Загрузка…"; more.disabled = true; doSearch(false); };
        modsList.appendChild(more);
      }
    };
    if (ptype === "modpack") api().search_modpacks(modQuery.value.trim(), s.version, offset, currentSort).then((res) => done(res, true));
    else api().search_mods(modQuery.value.trim(), s.loader, s.version, selectedCats, ptype, offset, currentSort).then((res) => done(res, false));
  }

  function doInstall(projectId, btn) {
    const s = activeProfile().settings;
    if (btn) { btn.disabled = true; btn.textContent = "Установка…"; }
    return api().install_mod(App.state.activeProfile, projectId, s.loader, s.version, ptype).then((r) => {
      if (btn) {
        if (r.ok) btn.textContent = "✓";
        else { btn.disabled = false; btn.textContent = "Ошибка"; askConfirm({ icon:"⚠️", title:"Не удалось", text: esc(r.error), okText:"Ок" }, null); }
      }
      if (r.ok && typeof Achievements !== "undefined") {
        Achievements.unlock("first_mod");
        App.state.modInstalls = (App.state.modInstalls || 0) + 1; persist();
        if (App.state.modInstalls >= 10) Achievements.unlock("mods_10");
        if (App.state.modInstalls >= 50) Achievements.unlock("mods_50");
      }
      return r;
    });
  }

  function searchCard(m) {
    const card = document.createElement("div"); card.className = "mod-card";
    const dl = (m.downloads || 0).toLocaleString("ru-RU");
    const fav = isBookmarked(m.project_id);
    card.innerHTML = `<img class="mod-icon" src="${m.icon_url || ''}" onerror="this.style.visibility='hidden'"><div class="mod-info"><div class="mod-title">${esc(m.title)}</div><div class="mod-desc">${esc(m.description || '')}</div><div class="mod-meta">▼ ${dl} · ${esc(m.author || '')}</div></div><div class="mod-actions"><button class="fav-btn ${fav ? 'on' : ''}" title="В избранное">♥</button><button class="mod-btn install">Установить</button></div>`;
    card.addEventListener("click", (e) => { if (e.target.closest(".install") || e.target.closest(".fav-btn")) return; openInfo(m.project_id); });
    card.querySelector(".install").addEventListener("click", (e) => { e.stopPropagation(); doInstall(m.project_id, e.target); });
    card.querySelector(".fav-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleBookmark(m); e.target.classList.toggle("on"); });
    return card;
  }

  function packCard(m) {
    const card = document.createElement("div"); card.className = "mod-card";
    const dl = (m.downloads || 0).toLocaleString("ru-RU");
    card.innerHTML = `<img class="mod-icon" src="${m.icon_url || ''}" onerror="this.style.visibility='hidden'"><div class="mod-info"><div class="mod-title">${esc(m.title)}</div><div class="mod-desc">${esc(m.description || '')}</div><div class="mod-meta">▼ ${dl} · ${esc(m.author || '')}</div></div><div class="mod-actions"><button class="mod-btn install">Установить сборку</button></div>`;
    card.addEventListener("click", (e) => { if (e.target.closest(".install")) return; openInfo(m.project_id); });
    const btn = card.querySelector(".install");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn.disabled = true; btn.textContent = "Установка…";
      askConfirm({ icon:"📦", title:"Установить модпак?", text:`<b>${esc(m.title)}</b> поставит свою версию игры, загрузчик и все моды в текущий профиль.`, okText:"Установить", okClass:"btn-save" }, () => {
        api().install_modpack(App.state.activeProfile, m.project_id);
        if (typeof Achievements !== "undefined") Achievements.unlock("first_modpack");
      });
      setTimeout(() => { if (!document.getElementById("launchOverlay").classList.contains("show")) { btn.disabled = false; btn.textContent = "Установить сборку"; } }, 400);
    });
    return card;
  }

  function openInfo(projectId) {
    const modal = document.getElementById("modInfoModal");
    document.getElementById("miTitle").textContent = "Загрузка…";
    document.getElementById("miMeta").textContent = "";
    document.getElementById("miCats").innerHTML = "";
    document.getElementById("miGallery").innerHTML = "";
    document.getElementById("miDesc").textContent = "";
    document.getElementById("miVersions").innerHTML = "";
    document.getElementById("miLinks").innerHTML = "";
    document.getElementById("miIcon").src = "";
    modal.classList.add("show");
    api().mod_info(projectId).then((r) => {
      if (!r || !r.ok) { document.getElementById("miTitle").textContent = "Не удалось загрузить"; return; }
      document.getElementById("miIcon").src = r.icon_url || "";
      document.getElementById("miTitle").textContent = r.title || "";
      document.getElementById("miMeta").textContent = `▼ ${(r.downloads||0).toLocaleString("ru-RU")} загрузок · ♥ ${(r.followers||0).toLocaleString("ru-RU")}`;
      document.getElementById("miDesc").textContent = r.description || "";
      const cats = document.getElementById("miCats");
      (r.categories || []).forEach(c => { const s = document.createElement("span"); s.className = "mi-cat"; s.textContent = catRu(c); cats.appendChild(s); });
      const gal = document.getElementById("miGallery");
      (r.gallery || []).forEach(url => { const img = document.createElement("img"); img.src = url; img.className = "mi-shot"; img.addEventListener("click", () => window.open(url, "_blank")); gal.appendChild(img); });
      const vers = document.getElementById("miVersions");
      const gv = (r.game_versions || []).slice(-8).reverse().join(", ");
      const ld = (r.loaders || []).join(", ");
      vers.innerHTML = `<div class="mi-row"><b>Версии:</b> ${esc(gv || "—")}</div><div class="mi-row"><b>Загрузчики:</b> ${esc(ld || "—")}</div>`;
      const links = document.getElementById("miLinks");
      links.innerHTML = "";
      const add = (label, url) => { if (url) { const a = document.createElement("a"); a.className = "mi-link"; a.textContent = label; a.href = "#"; a.addEventListener("click", (e)=>{e.preventDefault(); window.open(url,"_blank");}); links.appendChild(a); } };
      if (r.slug) add("Открыть на Modrinth", `https://modrinth.com/${ptype}/${r.slug}`);
      add("Исходники", r.source_url);
      add("Wiki", r.wiki_url);
      const favBtn = document.getElementById("miFav");
      if (favBtn) {
        if (ptype === "modpack") { favBtn.style.display = "none"; }
        else {
          favBtn.style.display = "";
          favBtn.classList.toggle("on", isBookmarked(projectId));
          favBtn.onclick = () => { toggleBookmark({ project_id: projectId, title: r.title, icon_url: r.icon_url, author: "" }); favBtn.classList.toggle("on"); };
        }
      }
      const installBtn = document.getElementById("miInstall");
      installBtn.disabled = false;
      if (ptype === "modpack") {
        installBtn.textContent = "Установить сборку";
        installBtn.onclick = () => {
          document.getElementById("modInfoModal").classList.remove("show");
          askConfirm({ icon:"📦", title:"Установить модпак?", text:`<b>${esc(r.title)}</b> поставит свою версию игры, загрузчик и все моды.`, okText:"Установить", okClass:"btn-save" }, () => {
            api().install_modpack(App.state.activeProfile, projectId);
            if (typeof Achievements !== "undefined") Achievements.unlock("first_modpack");
          });
        };
      } else {
        installBtn.textContent = "Установить";
        installBtn.onclick = () => doInstall(projectId, installBtn);
      }
    });
  }
  document.getElementById("miClose").addEventListener("click", () => document.getElementById("modInfoModal").classList.remove("show"));
  document.getElementById("miCancel").addEventListener("click", () => document.getElementById("modInfoModal").classList.remove("show"));
  document.getElementById("modInfoModal").addEventListener("click", (e) => { if (e.target.id === "modInfoModal") e.currentTarget.classList.remove("show"); });

  function showInstalled() {
    if (!api() || !hasProfile()) return;
    modsList.innerHTML = '<div class="mods-status">Загрузка…</div>';
    api().list_installed(App.state.activeProfile, ptype).then((files) => {
      if (!files.length) { modsList.innerHTML = '<div class="mods-status">Здесь пока пусто</div>'; return; }
      modsList.innerHTML = "";
      files.forEach((f) => {
        const card = document.createElement("div"); card.className = "mod-card";
        card.innerHTML = `<div class="mod-icon" style="display:flex;align-items:center;justify-content:center;font-size:22px;">📦</div><div class="mod-info"><div class="mod-title">${esc(f)}</div><div class="mod-meta">Установлен</div></div><div class="mod-actions"><button class="mod-btn remove">Удалить</button></div>`;
        card.querySelector(".remove").addEventListener("click", () => {
          askConfirm({ icon:"🗑", title:"Удалить?", text: esc(f), okText:"Удалить", okClass:"btn-danger" }, () => {
            api().delete_mod(App.state.activeProfile, f, ptype).then((r) => { if (r.ok) card.remove(); });
          });
        });
        modsList.appendChild(card);
      });
    });
  }

  function showFavorites() {
    if (!hasProfile()) return;
    const favs = bookmarks().filter(b => b.ptype === ptype);
    if (!favs.length) { modsList.innerHTML = '<div class="mods-status">В избранном пока пусто. Нажми ♥ на моде.</div>'; return; }
    modsList.innerHTML = "";
    favs.forEach((m) => {
      const card = document.createElement("div"); card.className = "mod-card";
      card.innerHTML = `<img class="mod-icon" src="${m.icon_url || ''}" onerror="this.style.visibility='hidden'"><div class="mod-info"><div class="mod-title">${esc(m.title)}</div><div class="mod-meta">${esc(m.author || '')}</div></div><div class="mod-actions"><button class="fav-btn on" title="Убрать">♥</button><button class="mod-btn install">Установить</button></div>`;
      card.addEventListener("click", (e) => { if (e.target.closest(".install") || e.target.closest(".fav-btn")) return; openInfo(m.project_id); });
      card.querySelector(".install").addEventListener("click", (e) => { e.stopPropagation(); doInstall(m.project_id, e.target); });
      card.querySelector(".fav-btn").addEventListener("click", (e) => {
        e.stopPropagation(); toggleBookmark(m); card.remove();
        if (!bookmarks().filter(b => b.ptype === ptype).length) modsList.innerHTML = '<div class="mods-status">В избранном пока пусто. Нажми ♥ на моде.</div>';
      });
      modsList.appendChild(card);
    });
  }

  return { onOpen };
})();
