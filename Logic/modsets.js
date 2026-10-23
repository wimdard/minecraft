/* Наборы модов внутри одной версии: «Основной», «Лёгкий», «Хардкор»… */
const ModSets = (() => {
  const bar = document.getElementById("modSetBar");
  const chips = document.getElementById("modSetChips");
  const addBtn = document.getElementById("modSetAdd");
  let active = "Основной";

  function vl() { const s = activeProfile().settings; return [s.version, s.loader || "vanilla"]; }
  function isModType() { return typeof Mods === "undefined" || !Mods.type || Mods.type() === "mod"; }

  function render() {
    if (!bar) return;
    // кнопки действий по типу контента: сборки и наборы — только для модов
    const t = (typeof Mods !== "undefined" && Mods.type) ? Mods.type() : "mod";
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? "" : "none"; };
    show("packExport", t === "mod");
    show("modCheck", t === "mod");
    show("modMigrate", t === "mod");
    show("modUpdateAll", t !== "modpack" && t !== "browse");
    if (!api() || !hasProfile() || !isModType()) { bar.style.display = "none"; return; }
    bar.style.display = "";
    const [v, l] = vl();
    api().list_mod_sets(App.state.activeProfile, v, l).then((r) => {
      if (!r || !r.ok) return;
      active = r.active;
      chips.innerHTML = "";
      r.sets.forEach((n) => {
        const c = document.createElement("button");
        c.className = "modset-chip" + (n === r.active ? " active" : "");
        c.innerHTML = `<span>${esc(n)}</span>` + (n !== "Основной" ? `<i class="modset-x" title="Удалить набор">×</i>` : "");
        c.addEventListener("click", (e) => {
          if (e.target.classList.contains("modset-x")) { e.stopPropagation(); remove(n); return; }
          if (n === active) return;
          const [vv, ll] = vl();
          api().switch_mod_set(App.state.activeProfile, vv, ll, n).then(after);
        });
        chips.appendChild(c);
      });
    });
  }

  function after(r) {
    if (r && !r.ok) askConfirm({ icon: "⚠️", title: "Не получилось", text: esc(r.error || "Ошибка"), okText: "Ок" }, null);
    render();
    if (typeof Mods !== "undefined" && Mods.refresh) Mods.refresh();
  }

  function remove(target) {
    askConfirm({ icon: "🗑", title: "Удалить набор?", text: `<b>${esc(target)}</b> и все его моды будут удалены. Основной набор останется.`, okText: "Удалить", okClass: "btn-danger" }, () => {
      const [v, l] = vl();
      api().delete_mod_set(App.state.activeProfile, v, l, target).then(after);
    });
  }

  if (addBtn) addBtn.addEventListener("click", () => {
    if (!api() || !hasProfile()) return;
    let name = "", copy = false;
    askConfirm({
      icon: "🧩", title: "Новый набор модов",
      text: `Для этой версии. Переключаться можно в любой момент — моды других наборов не теряются.
        <input type="text" id="msName" class="ms-input" placeholder="Например: Лёгкий" maxlength="40">
        <label class="ms-copy"><input type="checkbox" id="msCopy"> Скопировать моды из «${esc(active)}»</label>`,
      okText: "Создать", okClass: "btn-save"
    }, () => {
      if (!name.trim()) return;
      const [v, l] = vl();
      api().create_mod_set(App.state.activeProfile, v, l, name, copy).then(after);
    });
    setTimeout(() => {
      const n = document.getElementById("msName"), c = document.getElementById("msCopy");
      if (n) { n.focus(); n.addEventListener("input", () => { name = n.value; }); }
      if (c) c.addEventListener("change", () => { copy = c.checked; });
    }, 30);
  });

  const tab = document.querySelector('.tab[data-tab="mods"]');
  if (tab) tab.addEventListener("click", render);
  document.querySelectorAll("#modsTypebar .mtype").forEach(b => b.addEventListener("click", render));

  return { render };
})();
