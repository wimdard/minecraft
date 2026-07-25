const Welcome = (() => {
  const welcome = document.getElementById("welcome");
  function show() {
    welcome.classList.add("show");
    document.getElementById("addBtn").disabled = true;
    document.getElementById("profileNameTop").textContent = "—";
    document.getElementById("profileAvatar").textContent = "?";
  }
  function hide() { welcome.classList.remove("show"); document.getElementById("addBtn").disabled = false; }
  return { show, hide };
})();

const ProfileModal = (() => {
  const modal = document.getElementById("profileModal");
  const npName = document.getElementById("npName");
  const npUser = document.getElementById("npUser");
  const npLoaderGrid = document.getElementById("npLoaderGrid");
  let npLoader = "vanilla";
  let npAvatar = "";
  let npVersionDD;

  function initDropdown() {
    npVersionDD = setupDropdown("ddNpVersion", "ddNpVersionTrigger", "ddNpVersionMenu", "ddNpVersionVal", () => versionOptions(), () => {});
  }
  function buildLoaderGrid() {
    npLoaderGrid.innerHTML = "";
    LOADERS.forEach((l) => {
      const d = document.createElement("div");
      d.className = "loader-opt" + (l.id === npLoader ? " active" : "");
      d.textContent = l.nm;
      d.addEventListener("click", () => { npLoader = l.id; buildLoaderGrid(); });
      npLoaderGrid.appendChild(d);
    });
  }
  function updateAvatarPreview() {
    const prev = document.getElementById("npAvatarPreview");
    if (npAvatar) { prev.style.backgroundImage = `url("${npAvatar}")`; prev.textContent = ""; }
    else { prev.style.backgroundImage = ""; prev.textContent = (npName.value.trim()[0] || "?").toUpperCase(); }
  }
  document.getElementById("npAvatarBtn").addEventListener("click", () => {
    if (!api()) return;
    api().pick_image().then((r) => { if (r && r.ok) { npAvatar = r.url; updateAvatarPreview(); } });
  });
  document.getElementById("npAvatarClear").addEventListener("click", () => { npAvatar = ""; updateAvatarPreview(); });
  npName.addEventListener("input", () => { if (!npAvatar) updateAvatarPreview(); });

  function open() {
    npName.value = ""; npUser.value = "Player"; npLoader = "vanilla"; npAvatar = "";
    buildLoaderGrid();
    updateAvatarPreview();
    npVersionDD.set((App.VERSIONS[0] && App.VERSIONS[0].id) || "1.20.1");
    modal.classList.add("show");
  }
  function close() { modal.classList.remove("show"); }

  document.getElementById("pmAdd").addEventListener("click", () => { Profiles.closeMenu(); open(); });
  document.getElementById("npCancel").addEventListener("click", () => { close(); if (!hasProfile()) Welcome.show(); });
  document.getElementById("welcomeCreate").addEventListener("click", () => { Welcome.hide(); open(); });
  document.getElementById("npSave").addEventListener("click", () => {
    const name = npName.value.trim();
    if (!name) { askConfirm({ icon:"✏️", title:"Нужно имя", text:"Введи имя профиля.", okText:"Ок" }, null); return; }
    const id = "p" + Date.now();
    App.state.profiles[id] = {
      name,
      avatar: npAvatar,
      settings: { loader: npLoader, version: npVersionDD.get() || "1.20.1", memory: Math.min(4096, maxMem()), username: npUser.value.trim() || "Player" },
      blocks: [
        { id:"b1", type:"play",     title:"Играть",  body:"", icon:"▶",  x:0,   y:0,   w:240, h:160, primary:true },
        { id:"b2", type:"username", title:"Ник",     body:"", icon:"🧑", x:240, y:0,   w:240, h:160 },
        { id:"b3", type:"memory",   title:"Память",  body:"", icon:"🧠", x:0,   y:160, w:400, h:160 },
        { id:"b4", type:"stats",    title:"Статы",   body:"", icon:"📊", x:400, y:160, w:240, h:200 },
      ],
    };
    App.state.activeProfile = id;
    persist(); close(); Welcome.hide(); Profiles.load();

    // достижения
    if (typeof Achievements !== "undefined") {
      Achievements.unlock("first_profile");
      if (Object.keys(App.state.profiles).length >= 5) Achievements.unlock("five_profiles");
    }
  });

  return { open, initDropdown };
})();
