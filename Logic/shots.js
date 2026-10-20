/* Галерея скриншотов: сетка с ленивой подгрузкой + просмотр с листанием. */
const Shots = (() => {
  const grid = document.getElementById("shotsGrid");
  const countEl = document.getElementById("shotsCount");
  const modal = document.getElementById("shotModal");
  const img = document.getElementById("shotImg");
  const nameEl = document.getElementById("shotName");

  let shots = [];
  let cur = -1;
  const cache = new Map();   // имя -> data: URL
  const queue = [];
  let loading = 0;

  function fmtDate(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) +
      ", " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  // не больше 3 картинок грузим одновременно
  function pump() {
    while (loading < 3 && queue.length) {
      const job = queue.shift();
      if (cache.has(job.name)) { job.done(cache.get(job.name)); continue; }
      loading++;
      api().get_screenshot(App.state.activeProfile, job.name).then((r) => {
        loading--;
        if (r && r.ok) { cache.set(job.name, r.data); job.done(r.data); }
        pump();
      }).catch(() => { loading--; pump(); });
    }
  }
  function load(name, done) { queue.push({ name, done }); pump(); }

  const io = ("IntersectionObserver" in window) ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const el = en.target;
      load(el.dataset.name, (data) => { el.style.backgroundImage = `url("${data}")`; el.classList.add("ready"); });
    });
  }, { root: null, rootMargin: "300px" }) : null;

  function render() {
    if (!api() || !hasProfile()) return;
    grid.innerHTML = '<div class="mods-status">Загрузка…</div>';
    api().list_screenshots(App.state.activeProfile).then((r) => {
      shots = (r && r.shots) || [];
      countEl.textContent = shots.length ? String(shots.length) : "0";
      if (!shots.length) {
        grid.innerHTML = '<div class="mods-status">Скриншотов пока нет. В игре нажми <b>F2</b>, и они появятся здесь.</div>';
        return;
      }
      grid.innerHTML = "";
      shots.forEach((s, i) => {
        const card = document.createElement("div");
        card.className = "shot-card";
        card.innerHTML = `<div class="shot-thumb" data-name="${esc(s.name)}"></div><div class="shot-meta">${esc(fmtDate(s.mtime))}</div>`;
        card.addEventListener("click", () => open(i));
        grid.appendChild(card);
        const th = card.querySelector(".shot-thumb");
        if (io) io.observe(th);
        else load(s.name, (data) => { th.style.backgroundImage = `url("${data}")`; th.classList.add("ready"); });
      });
    });
  }

  function open(i) {
    if (!shots.length) return;
    cur = (i + shots.length) % shots.length;
    const s = shots[cur];
    nameEl.textContent = fmtDate(s.mtime) + " · " + s.name;
    img.removeAttribute("src");
    load(s.name, (data) => { if (shots[cur] === s) img.src = data; });
    modal.classList.add("show");
  }
  function close() { modal.classList.remove("show"); }

  document.getElementById("shotPrev").addEventListener("click", (e) => { e.stopPropagation(); open(cur - 1); });
  document.getElementById("shotNext").addEventListener("click", (e) => { e.stopPropagation(); open(cur + 1); });
  document.getElementById("shotClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("show")) return;
    if (e.key === "ArrowLeft") open(cur - 1);
    else if (e.key === "ArrowRight") open(cur + 1);
    else if (e.key === "Escape") close();
  });

  document.getElementById("shotOpen").addEventListener("click", () => {
    const s = shots[cur]; if (s) api().open_screenshot(App.state.activeProfile, s.name);
  });
  document.getElementById("shotDel").addEventListener("click", () => {
    const s = shots[cur]; if (!s) return;
    askConfirm({ icon: "🗑", title: "Удалить скриншот?", text: esc(s.name), okText: "Удалить", okClass: "btn-danger" }, () => {
      api().delete_screenshot(App.state.activeProfile, s.name).then((r) => {
        if (!r || !r.ok) return;
        cache.delete(s.name);
        shots.splice(cur, 1);
        if (!shots.length) { close(); render(); return; }
        render();
        open(Math.min(cur, shots.length - 1));
      });
    });
  });

  document.getElementById("shotsRefresh").addEventListener("click", render);
  document.getElementById("shotsFolder").addEventListener("click", () => {
    if (api() && hasProfile()) api().open_screenshots_folder(App.state.activeProfile);
  });
  const tab = document.querySelector('.tab[data-tab="shots"]');
  if (tab) tab.addEventListener("click", render);

  return { render };
})();
