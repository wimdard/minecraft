function setupDropdown(ddId, triggerId, menuId, valId, getOptions, onPick) {
  const dd = document.getElementById(ddId);
  const trigger = document.getElementById(triggerId);
  const menu = document.getElementById(menuId);
  const val = document.getElementById(valId);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (trigger.classList.contains("disabled")) return;
    const opening = !dd.classList.contains("open");
    document.querySelectorAll(".dd.open").forEach(d => d.classList.remove("open"));
    if (opening) {
      renderMenu();
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      dd.classList.toggle("up", spaceBelow < 260 && spaceAbove > spaceBelow);
      dd.classList.add("open");
    }
  });

  document.addEventListener("click", (e) => { if (!dd.contains(e.target)) dd.classList.remove("open"); });

  function renderMenu() {
    menu.innerHTML = "";
    const cur = val.textContent;
    getOptions().forEach((o) => {
      const d = document.createElement("div");
      d.className = "dd-opt" + (o.id === cur ? " active" : "");
      d.innerHTML = `<span>${esc(o.label)}</span>${o.tag ? `<span class="tag">${esc(o.tag)}</span>` : ""}`;
      d.addEventListener("click", () => { val.textContent = o.id; dd.classList.remove("open"); onPick(o.id); });
      menu.appendChild(d);
    });
  }

  return { set: (v) => { val.textContent = v; }, get: () => val.textContent };
}
