const BlockModal = (() => {
  const modal = document.getElementById("blockModal");
  const typeGrid = document.getElementById("typeGrid");
  const iconRow = document.getElementById("iconRow");
  const mTitle = document.getElementById("mTitle");
  const mBody = document.getElementById("mBody");
  const mUrl = document.getElementById("mUrl");
  const mUrlField = document.getElementById("mUrlField");
  const mBodyField = document.getElementById("mBodyField");

  let editingEl = null, pickedType = "note", pickedIcon = "📝";

  function buildTypeGrid() {
    typeGrid.innerHTML = "";
    const showBeta = !(App.state && App.state.showBeta === false);
    TYPES.forEach((t) => {
      if (t.beta && !showBeta) return;   // скрыть бета-типы, если бета выключена
      const d = document.createElement("div");
      d.className = "type-opt" + (t.id === pickedType ? " active" : "");
      d.innerHTML = `<div class="ic">${t.ic}</div><div class="nm">${t.nm}</div>`;
            d.addEventListener("click", () => {
        const prev = TYPES.find(x => x.id === pickedType);
        const nameWasDefault = !mTitle.value.trim() || (prev && mTitle.value.trim() === prev.nm);
        pickedType = t.id; pickedIcon = t.ic;
        if (nameWasDefault) mTitle.value = t.nm;
        buildTypeGrid(); buildIconRow(); toggleFields();
      });

      typeGrid.appendChild(d);
    });
  }

  function buildIconRow() {
    iconRow.innerHTML = "";
    ICONS.forEach((ic) => {
      const b = document.createElement("button");
      b.className = "icon-pick" + (ic === pickedIcon ? " active" : "");
      b.textContent = ic;
      b.addEventListener("click", () => { pickedIcon = ic; buildIconRow(); });
      iconRow.appendChild(b);
    });
  }
  function toggleFields() {
    mUrlField.style.display = pickedType === "link" ? "block" : "none";
    mBodyField.style.display = (pickedType === "news" || pickedType === "note") ? "block" : "none";
  }

  function open(el) {
    editingEl = el || null;
        try {

    if (el) {
      document.getElementById("blockModalTitle").textContent = "Настроить блок";
      document.getElementById("mSave").textContent = "Сохранить";
      pickedType = el.dataset.type; pickedIcon = el.dataset.icon;
      mTitle.value = el.querySelector(".item-title").textContent; mBody.value = el.dataset.bodyText || ""; mUrl.value = el.dataset.url || "";
    } else {
      document.getElementById("blockModalTitle").textContent = "Новый блок";
      document.getElementById("mSave").textContent = "Создать";
      pickedType = "note"; pickedIcon = "📝"; mTitle.value = ""; mBody.value = ""; mUrl.value = "";
    }
    buildTypeGrid(); buildIconRow(); toggleFields();
    modal.classList.add("show");
        } catch(err) { alert("Ошибка open: " + err.message + "\n" + err.stack); }

  }
  function close() { modal.classList.remove("show"); editingEl = null; }

  document.getElementById("mCancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.getElementById("mSave").addEventListener("click", () => {
    const data = { type: pickedType, icon: pickedIcon, title: mTitle.value.trim() || (TYPES.find(t => t.id === pickedType)?.nm || "Блок"), body: mBody.value.trim(), url: mUrl.value.trim() };
    const surface = document.getElementById("surface");
    if (editingEl) {
      const blocks = Blocks.collect().map(x => x.id === editingEl.dataset.id ? { ...x, ...data } : x);
      surface.innerHTML = ""; blocks.forEach(Blocks.makeItem);
    } else {
      const spot = Blocks.findFreeSpot(240, 160);
      Blocks.makeItem({ id: "b" + Date.now(), ...data, x: spot.x, y: spot.y, w: 240, h: 160 });
    }
    Blocks.sync(); close();
  });
  document.getElementById("addBtn").addEventListener("click", () => { if (hasProfile()) open(null); });

  return { open };
})();
