const Profiles = (() => {
  const profileWrap = document.getElementById("profileWrap");
  const setName = document.getElementById("setName");
  const setMemory = document.getElementById("setMemory");
  const memVal = document.getElementById("memVal");
  const ramHint = document.getElementById("ramHint");
  const memStatus = document.getElementById("memStatus");

  document.getElementById("profileBtn").addEventListener("click", (e) => { e.stopPropagation(); if (typeof Settings !== "undefined") Settings.close(); if (hasProfile()) profileWrap.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!profileWrap.contains(e.target)) profileWrap.classList.remove("open"); });

  function render() {
    const list = document.getElementById("pmList");
    list.innerHTML = "";
    for (const [id, p] of Object.entries(App.state.profiles)) {
      const row = document.createElement("div");
      row.className = "pm-item" + (id === App.state.activeProfile ? " active" : "");
      const avaImg = p.avatar ? `style="background-image:url('${p.avatar}');background-size:cover;background-position:center;"` : "";
      const avaTxt = p.avatar ? "" : (p.name || "?")[0].toUpperCase();
      row.innerHTML = `<span class="pm-ava" ${avaImg}>${avaTxt}</span><span class="pm-nm">${esc(p.name)}</span>${id === App.state.activeProfile ? '<span class="pm-check">✓</span>' : ''}<button class="pm-del" title="Удалить профиль">🗑</button>`;
      row.addEventListener("click", (e) => { if (e.target.closest(".pm-del")) return; switchTo(id); });
      row.querySelector(".pm-del").addEventListener("click", (e) => { e.stopPropagation(); askDelete(id); });
      list.appendChild(row);
    }
    if (hasProfile()) {
      const p = activeProfile();
      const name = p.name || "?";
      const topAva = document.getElementById("profileAvatar");
      if (p.avatar) { topAva.style.backgroundImage = `url("${p.avatar}")`; topAva.style.backgroundSize = "cover"; topAva.style.backgroundPosition = "center"; topAva.textContent = ""; }
      else { topAva.style.backgroundImage = ""; topAva.textContent = name[0].toUpperCase(); }
      document.getElementById("profileNameTop").textContent = name;
    }
  }

  function switchTo(id) {
    if (id === App.state.activeProfile) { profileWrap.classList.remove("open"); return; }
    App.state.activeProfile = id;
    profileWrap.classList.remove("open");
    load();
    setTimeout(persist, 0);
  }

  function askDelete(id) {
    const p = App.state.profiles[id]; if (!p) return;
    profileWrap.classList.remove("open");
    askConfirm({ icon:"🗑", title:"Удалить профиль?", text:`Профиль <b>«${esc(p.name)}»</b> и все его моды будут удалены безвозвратно.`, okText:"Удалить", okClass:"btn-danger" }, () => {
      if (api()) api().delete_profile_data(id);
      delete App.state.profiles[id];
      const rest = Object.keys(App.state.profiles);
      if (id === App.state.activeProfile) App.state.activeProfile = rest.length ? rest[0] : null;
      persist();
      if (!hasProfile()) Welcome.show(); else load();
    });
  }

  function updateMemUI() {
    const s = activeProfile().settings;
    const mb = parseInt(setMemory.value, 10);
    memVal.textContent = mb + " МБ";
    const a = memAssessment(mb, s.loader);
    memStatus.className = "pm-mem-status " + a.level;
    memStatus.textContent = a.text;
  }

  function fill() {
    const s = activeProfile().settings;
    setName.value = activeProfile().name;
    setMemory.max = maxMem();
    const gbCount = Math.max(1, Math.round(maxMem() / 1024));
    setMemory.style.setProperty("--gb-step", (100 / gbCount) + "%");

    setMemory.value = Math.min(s.memory, maxMem());
    updateMemUI();
    ramHint.textContent = "Всего на ПК: " + App.SYS.ram + " МБ (" + (App.SYS.ram / 1024).toFixed(1) + " ГБ)";
  }

  function saveSilent() { render(); Blocks.refresh(); updateMemUI(); persist(); if (typeof Classic !== "undefined") Classic.render(); }
  function save() {
    const p = activeProfile();
    p.name = setName.value.trim() || "Игрок";
    p.settings.memory = parseInt(setMemory.value, 10);
    saveSilent();
  }
  setName.addEventListener("change", save);
  setMemory.addEventListener("input", updateMemUI);
  setMemory.addEventListener("change", save);

  function load() {
    if (!hasProfile()) { Welcome.show(); return; }
    Welcome.hide();
    Blocks.renderAll();
    fill();
    render();
    if (typeof Classic !== "undefined") Classic.render();
  }

  return { render, fill, load, closeMenu: () => profileWrap.classList.remove("open") };
})();
