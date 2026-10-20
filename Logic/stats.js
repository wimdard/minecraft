/* Статистика игры: время по версиям, сеансы, последняя игра. Карточка над достижениями. */
const Stats = (() => {
  let running = null;   // {pid, key} — что запущено сейчас

  function keyFor(s) { return s.version + "|" + (s.loader || "vanilla"); }
  function labelFor(key) {
    const [v, l] = key.split("|");
    return v + " · " + (typeof loaderName === "function" ? loaderName(l) : l);
  }
  function fmt(secs) {
    secs = Math.max(0, Math.round(secs || 0));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    if (h) return h + " ч " + m + " мин";
    if (m) return m + " мин";
    return secs ? "< 1 мин" : "0 мин";
  }
  function fmtAgo(ts) {
    if (!ts) return "—";
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return "сегодня";
    if (d === 1) return "вчера";
    return d + " дн. назад";
  }

  // запоминаем версию в момент запуска: игру можно запустить и из классики, и из блоков
  function hookLaunch() {
    const a = window.pywebview && window.pywebview.api;
    if (!a || !a.launch_game || a.launch_game.__stats) return;
    const orig = a.launch_game;
    a.launch_game = function (pid, version, username, memory, loader) {
      running = { pid: pid, key: version + "|" + (loader || "vanilla") };
      return orig.apply(a, arguments);
    };
    a.launch_game.__stats = true;
  }
  hookLaunch();
  window.addEventListener("pywebviewready", hookLaunch);

  const origClosed = window.onGameClosed;
  window.onGameClosed = function (pid, secs) {
    const r = origClosed && origClosed.apply(this, arguments);
    try {
      const p = pid && App.state && App.state.profiles[pid];
      if (p && secs) {
        const s = p.settings;
        const key = (running && running.pid === pid) ? running.key : keyFor(s);
        if (!s.stats || typeof s.stats !== "object") s.stats = {};
        const rec = s.stats[key] || (s.stats[key] = { secs: 0, sessions: 0, last: 0 });
        rec.secs += secs; rec.sessions += 1; rec.last = Date.now();
        persist();
      }
    } catch (e) {}
    running = null;
    render();
    return r;
  };

  function card() {
    let el = document.getElementById("statsCard");
    if (!el) {
      const page = document.getElementById("page-ach");
      if (!page) return null;
      el = document.createElement("div");
      el.id = "statsCard"; el.className = "stats-card";
      page.insertBefore(el, page.firstChild);
    }
    return el;
  }

  function render() {
    if (!hasProfile()) return;
    const el = card(); if (!el) return;
    const s = activeProfile().settings;
    const stats = (s.stats && typeof s.stats === "object") ? s.stats : {};
    const rows = Object.keys(stats).map(k => Object.assign({ key: k }, stats[k])).sort((a, b) => b.secs - a.secs);
    const sessions = rows.reduce((n, r) => n + (r.sessions || 0), 0);
    const last = rows.reduce((t, r) => Math.max(t, r.last || 0), 0);
    const top = rows[0];
    const max = top ? top.secs : 0;
    const list = rows.slice(0, 6).map(r => `
      <div class="st-row">
        <span class="st-nm">${esc(labelFor(r.key))}</span>
        <span class="st-bar"><i style="width:${max ? Math.max(4, Math.round(r.secs / max * 100)) : 0}%"></i></span>
        <span class="st-val">${fmt(r.secs)}</span>
      </div>`).join("");
    el.innerHTML = `
      <div class="st-tiles">
        <div class="st-tile"><b>${fmt(s.playtime)}</b><span>всего в игре</span></div>
        <div class="st-tile"><b>${sessions}</b><span>сеансов</span></div>
        <div class="st-tile"><b>${top ? esc(labelFor(top.key)) : "—"}</b><span>любимая версия</span></div>
        <div class="st-tile"><b>${fmtAgo(last)}</b><span>последняя игра</span></div>
      </div>
      ${list ? `<div class="st-list">${list}</div>` : `<div class="st-empty">Сыграй хотя бы раз — здесь появится время по каждой версии.</div>`}`;
  }

  const tab = document.querySelector('.tab[data-tab="ach"]');
  if (tab) tab.addEventListener("click", render);

  return { render };
})();
