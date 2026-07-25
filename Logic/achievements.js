/* Достижения в стиле Minecraft — общие на лаунчер (App.state.achievements). */
const Achievements = (() => {
  const ALL = [
    { id:"first_profile", ic:"🧑", name:"Начало пути", desc:"Создай первый профиль" },
    { id:"five_profiles", ic:"👥", name:"Коллекционер", desc:"Создай 5 профилей" },
    { id:"first_launch",  ic:"▶", name:"Поехали!", desc:"Запусти игру впервые" },
    { id:"launch_5",      ic:"🎮", name:"Завсегдатай", desc:"Запусти игру 5 раз" },
    { id:"launch_25",     ic:"🔥", name:"Ветеран", desc:"Запусти игру 25 раз" },
    { id:"first_mod",     ic:"🧩", name:"Модификатор", desc:"Установи первый мод" },
    { id:"mods_10",       ic:"📦", name:"Сборщик", desc:"Установи 10 модов" },
    { id:"mods_50",       ic:"🏗", name:"Мастер сборок", desc:"Установи 50 модов" },
    { id:"first_modpack", ic:"🎁", name:"Всё в одном", desc:"Установи модпак" },
    { id:"first_server",  ic:"🌐", name:"Онлайн", desc:"Добавь сервер" },
    { id:"first_idea",    ic:"💡", name:"Архитектор", desc:"Создай идею постройки" },
    { id:"ideas_10",      ic:"📐", name:"Визионер", desc:"Создай 10 идей" },
    { id:"theme_change",  ic:"🎨", name:"Стиль", desc:"Смени тему оформления" },
    { id:"fav_mod",       ic:"♥", name:"Избранное", desc:"Добавь мод в избранное" },
  ];

  function got() {
    if (!App.state) return {};
    if (!App.state.achievements) App.state.achievements = {};
    return App.state.achievements;
  }

  function unlock(id) {
    const a = ALL.find(x => x.id === id);
    if (!a) return;
    const g = got();
    if (g[id]) return;
    g[id] = Date.now();
    if (App.state) persist();
    toast(a);
    renderTab();
  }

  function toast(a) {
    let wrap = document.getElementById("achToasts");
    if (!wrap) { wrap = document.createElement("div"); wrap.id = "achToasts"; document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "ach-toast";
    t.innerHTML = `<div class="ach-toast-ic">${a.ic}</div><div class="ach-toast-txt"><div class="ach-toast-head">Достижение получено!</div><div class="ach-toast-name">${esc(a.name)}</div></div>`;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 500); }, 4000);
  }

  function renderTab() {
    const box = document.getElementById("achGrid");
    if (!box) return;
    const g = got();
    const total = ALL.length, done = ALL.filter(a => g[a.id]).length;
    const prog = document.getElementById("achProgress");
    if (prog) prog.textContent = `${done} / ${total}`;
    box.innerHTML = "";
    ALL.forEach(a => {
      const has = !!g[a.id];
      const card = document.createElement("div");
      card.className = "ach-card" + (has ? " done" : "");
      card.innerHTML = `<div class="ach-ic">${has ? a.ic : "🔒"}</div><div class="ach-info"><div class="ach-name">${has ? esc(a.name) : "???"}</div><div class="ach-desc">${esc(a.desc)}</div></div>`;
      box.appendChild(card);
    });
  }

  function onOpen() { renderTab(); }

  return { unlock, onOpen, renderTab };
})();
