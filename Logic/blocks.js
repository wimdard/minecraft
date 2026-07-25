const Blocks = (() => {
  const surface = document.getElementById("surface");

  let editMode = false;

  function setEditMode(on) {
    editMode = !!on;
    surface.classList.toggle("edit-mode", editMode);
       

    const btn = document.getElementById("editBtn");
    if (btn) btn.classList.toggle("on", editMode);
    if (App.state) { App.state.editMode = editMode; persist(); }
  }
  function initEdit() {
    editMode = !!(App.state && App.state.editMode);
    surface.classList.toggle("edit-mode", editMode);
        

    const btn = document.getElementById("editBtn");
    if (btn) {
      btn.classList.toggle("on", editMode);
      btn.addEventListener("click", () => setEditMode(!editMode));
    }
  }

  function blockInner(block) {
    const s = activeProfile().settings;
    switch (block.type) {
      case "play":
        return `<div class="play-center"><span class="play-big">▶</span><span class="play-word">ИГРАТЬ</span></div>`;
     
              case "version": {
        const rows = versionOptions().map(v => {
          const inst = window.__blkInstalled && window.__blkInstalled.has(v.id + "|" + s.loader);
          return `<div class="blk-list-row${v.id === s.version ? ' active' : ''}" data-ver="${esc(v.id)}">
            <span>${esc(v.id)}${v.tag ? ' · ' + v.tag : ''}</span>
            <span class="blk-dot ${inst ? 'on' : ''}"></span></div>`;
        }).join("");
        const loaders = LOADERS.map(l =>
          `<div class="blk-chip${l.id === s.loader ? ' active' : ''}" data-loader="${l.id}">${esc(l.nm)}</div>`
        ).join("");
                return `<div class="blk-body blk-list-wrap">
          <div class="blk-cur">Сейчас: <b>${esc(s.version)}</b> · ${esc(loaderName(s.loader))}</div>
          <div class="blk-list" data-role="ver-list">${rows}</div>
          <div class="blk-chips" data-role="ver-loaders">${loaders}</div>
        </div>`;


      }
      case "server": {
        const cur = (typeof Servers !== "undefined") ? Servers.activeIp() : "";
        const servers = (typeof Servers !== "undefined") ? Servers.list() : [];
        const rows = servers.map(srv =>
          `<div class="blk-list-row${srv.ip === cur ? ' active' : ''}" data-srv="${esc(srv.ip)}">
            <span class="blk-srv-dot"></span><span>${esc(srv.name)}</span></div>`
        ).join("");
        return `<div class="blk-body blk-list-wrap">
          <div class="blk-list" data-role="srv-list">
            <div class="blk-list-row${!cur ? ' active' : ''}" data-srv=""><span>Без сервера</span></div>
            ${rows}
          </div>
          <div class="blk-srv-add">
            <input class="blk-in" data-role="srv-name" placeholder="Название">
            <input class="blk-in" data-role="srv-ip" placeholder="IP">
            <button class="blk-add-btn" data-role="srv-add">＋</button>
          </div>
        </div>`;
      }



      case "username":
        return `<div class="blk-body"><input class="blk-input" data-role="username" value="${esc(s.username)}" placeholder="Ник"></div>`;
      case "memory": {
        const mb = Math.min(s.memory, maxMem());
        const a = memAssessment(mb, s.loader);
        return `<div class="mem lvl-${a.level}">
          <div class="mem-col"><span class="mem-val" data-role="memval">${mb} МБ</span><span class="mem-note ${a.level}" data-role="memnote">${a.text}</span></div>
          <input class="mem-range" type="range" min="1024" max="${maxMem()}" step="64" value="${mb}" data-role="memory">
        </div>`;

      }
      case "news":
        return `<div class="blk-body"><div class="item-body">${esc(block.body || "Новостей пока нет")}</div></div>`;
      case "friends":
        return `<div class="blk-body blk-friends"><div class="friend"><span class="dot"></span>Steve — в игре</div><div class="friend"><span class="dot"></span>Alex — в сети</div><div class="friend"><span class="dot off"></span>Notch — не в сети</div></div>`;
      case "stats": {
        const rl = ramLevel(App.SYS.ram), cl = coreLevel(App.SYS.cores);
        return `<div class="specs">
          <div class="spec"><span class="sdot ok"></span><span class="sname">Система</span><span class="sval">${esc(App.SYS.os)}</span></div>
          <div class="spec"><span class="sdot ${cl}"></span><span class="sname">Процессор</span><span class="sval" title="${esc(App.SYS.cpu)}">${esc(App.SYS.cpu)}</span></div>
          <div class="spec"><span class="sdot ${cl}"></span><span class="sname">Ядра</span><span class="sval">${App.SYS.cores} ядер</span></div>
          <div class="spec"><span class="sdot ${rl}"></span><span class="sname">ОЗУ</span><span class="sval">${(App.SYS.ram / 1024).toFixed(1)} ГБ</span></div>
        </div>`;
      }
      case "link":
        return `<div class="blk-body"><a class="blk-link" data-role="link" data-url="${esc(block.url || '')}">Открыть ссылку →</a></div>`;
      default:
        return `<div class="blk-body"><div class="item-body">${esc(block.body || "")}</div></div>`;
    }
  }

  function makeItem(block) {
    const el = document.createElement("div");
    el.className = "item type-" + (block.type || "note") + (block.primary ? " primary" : "");
    el.dataset.id = block.id; el.dataset.type = block.type || "note"; el.dataset.primary = block.primary ? "1" : "";
    el.dataset.icon = block.icon || "▪"; el.dataset.url = block.url || ""; el.dataset.bodyText = block.body || "";
    el.style.left = block.x + "px"; el.style.top = block.y + "px";
    el.style.width = (block.w || 240) + "px"; el.style.height = (block.h || 160) + "px";
        if (block.type === "stats") { el.style.width = "240px"; el.style.height = "210px"; }
    el.innerHTML = `<div class="item-content">
      <button class="item-gear" title="Настроить">⚙</button><button class="item-remove">×</button>
      <div class="item-head"><div class="item-icon">${block.icon || "▪"}</div><div class="item-title">${esc(block.title)}</div></div>
      ${blockInner(block)}<div class="item-resize"></div></div>`;
    if ((block.w || 240) >= 360) el.classList.add("wide");

    el.querySelector(".item-remove").addEventListener("click", (e) => { e.stopPropagation(); el.remove(); sync(); });
    el.querySelector(".item-gear").addEventListener("click", (e) => { e.stopPropagation(); BlockModal.open(el); });

    if (block.type === "play") {
      el.querySelector(".item-content").addEventListener("click", (e) => {
        if (e.target.closest(".item-gear,.item-remove,.item-resize")) return;
        if (el.classList.contains("dragging")) return;
        launchGame();
      });
    }
        if (block.type === "version") {
      const content = el.querySelector(".item-content");
      content.addEventListener("click", (e) => {
        if (editMode || el.classList.contains("dragging")) return;
        const row = e.target.closest(".blk-list-row");
        if (row && row.dataset.ver !== undefined) {
          activeProfile().settings.version = row.dataset.ver;
          persist(); refresh(); if (typeof Classic !== "undefined") Classic.render();
          return;
        }
        const chip = e.target.closest(".blk-chip");
        if (chip && chip.dataset.loader) {
          activeProfile().settings.loader = chip.dataset.loader;
          persist(); refresh(); if (typeof Classic !== "undefined") Classic.render();
        }
      });
    }
    if (block.type === "server") {
      const content = el.querySelector(".item-content");
      content.addEventListener("click", (e) => {
        if (editMode || el.classList.contains("dragging")) return;
        const row = e.target.closest(".blk-list-row");
        if (row && row.dataset.srv !== undefined) {
          const ip = row.dataset.srv;
          const cur = Servers.activeIp();
          if (ip === "") { if (cur) Servers.toggle(cur); }
          else if (ip !== cur) { Servers.toggle(ip); }
          refresh(); if (typeof Servers !== "undefined") Servers.render();
          return;
        }
        const addBtn = e.target.closest('[data-role="srv-add"]');
        if (addBtn) {
          const nameEl = el.querySelector('[data-role="srv-name"]');
          const ipEl = el.querySelector('[data-role="srv-ip"]');
          const ip = (ipEl.value || "").trim();
          if (!ip) { ipEl.focus(); return; }
          const name = (nameEl.value || "").trim() || ip;
          const st = activeProfile().settings;
          if (!Array.isArray(st.servers)) st.servers = [];
          st.servers.push({ name, ip });
          if (typeof Achievements !== "undefined") Achievements.unlock("first_server");
          persist(); refresh(); if (typeof Servers !== "undefined") Servers.render();
        }
      });
      // не таскать блок при вводе в поля
      el.querySelectorAll('[data-role="srv-name"],[data-role="srv-ip"]').forEach(inp => {
        inp.addEventListener("mousedown", ev => ev.stopPropagation());
      });
      // пинг активного сервера
      const ip = (typeof Servers !== "undefined") ? Servers.activeIp() : "";
      if (ip && api()) {
        api().ping_server(ip).then((r) => {
          const dot = el.querySelector('.blk-list-row.active .blk-srv-dot');
          if (dot) dot.style.background = (r && r.online) ? "var(--accent)" : "#e05252";
        });
      }
    }



    const uInput = el.querySelector('[data-role="username"]');
    if (uInput) {
      uInput.addEventListener("mousedown", e => e.stopPropagation());
      uInput.addEventListener("change", () => { activeProfile().settings.username = uInput.value.trim() || "Player"; document.getElementById("setUsername").value = activeProfile().settings.username; refresh(); persist(); if (typeof Classic !== "undefined") Classic.render(); });
    }
    const mRange = el.querySelector('[data-role="memory"]');
    if (mRange) {
      mRange.addEventListener("mousedown", e => e.stopPropagation());
      mRange.addEventListener("input", () => {
        const mb = parseInt(mRange.value, 10);
        el.querySelector('[data-role="memval"]').textContent = mb + " МБ";
        const a = memAssessment(mb, activeProfile().settings.loader);
        const note = el.querySelector('[data-role="memnote"]'); note.className = "mem-note " + a.level; note.textContent = a.text;
      });

      mRange.addEventListener("change", () => { activeProfile().settings.memory = parseInt(mRange.value, 10); Profiles.fill(); refresh(); persist(); if (typeof Classic !== "undefined") Classic.render(); });
    }
    const link = el.querySelector('[data-role="link"]');
    if (link) {
      link.addEventListener("mousedown", e => e.stopPropagation());
      link.addEventListener("click", (e) => { e.stopPropagation(); const u = link.dataset.url; if (u) window.open(u, "_blank"); });
    }

    makeDraggable(el);
    makeResizable(el);
    surface.appendChild(el);
  }

  function launchGame() {
    if (editMode) return;
    if (typeof Classic !== "undefined" && Classic.play) {
      Classic.play("");
    }
  }

  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function isValid(self, rect) {
    for (const o of surface.querySelectorAll(".item")) {
      if (o === self) continue;
      const r = { x: parseInt(o.style.left, 10) || 0, y: parseInt(o.style.top, 10) || 0, w: o.offsetWidth, h: o.offsetHeight };
      if (overlaps(rect, r)) return false;
    }
    return true;
  }

  function makeDraggable(el) {
    const handle = el.querySelector(".item-content");
    let ox = 0, oy = 0, dr = false, lx = 0, ly = 0, moved = false;
    handle.addEventListener("mousedown", (e) => {
      if (!editMode) return;
      if (e.target.closest(".item-remove,.item-gear,.item-resize,.blk-input,.mem-range,.blk-link")) return;
      dr = true; moved = false; lx = parseInt(el.style.left, 10) || 0; ly = parseInt(el.style.top, 10) || 0;
      const r = el.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up); e.preventDefault();
    });
    function mv(e) {
      if (!dr) return;
      if (!moved) { moved = true; el.classList.add("dragging"); el.style.zIndex = 1000; }
      const p = surface.getBoundingClientRect();
      let x = snap(e.clientX - p.left - ox), y = snap(e.clientY - p.top - oy);
      x = Math.max(0, Math.min(x, snap(surface.clientWidth - el.offsetWidth)));
      y = Math.max(0, Math.min(y, snap(surface.clientHeight - el.offsetHeight)));
      el.style.left = x + "px"; el.style.top = y + "px";
      if (isValid(el, { x, y, w: el.offsetWidth, h: el.offsetHeight })) { lx = x; ly = y; el.classList.remove("invalid"); } else el.classList.add("invalid");
    }
    function up() {
      if (!dr) return; dr = false;
      if (moved) {
        if (el.classList.contains("invalid")) { el.style.left = lx + "px"; el.style.top = ly + "px"; el.classList.remove("invalid"); }
        el.style.zIndex = 1; setTimeout(() => el.classList.remove("dragging"), 0); sync();
      }
      document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
    }
  }

  function makeResizable(el) {
    const knob = el.querySelector(".item-resize");
    let sx = 0, sy = 0, sw = 0, sh = 0, rz = false, lw = 0, lh = 0;
    knob.addEventListener("mousedown", (e) => {
      if (!editMode) return;
      if (el.dataset.type === "stats") return;
      rz = true; el.classList.add("resizing"); el.style.zIndex = 1000;
      sx = e.clientX; sy = e.clientY; sw = el.offsetWidth; sh = el.offsetHeight; lw = sw; lh = sh;
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up); e.preventDefault(); e.stopPropagation();
    });
    function mv(e) {
      if (!rz) return;
      let w = snap(sw + (e.clientX - sx)), h = snap(sh + (e.clientY - sy));
      w = Math.max(CELL * 4, w); h = Math.max(CELL * 3, h);
      const x = parseInt(el.style.left, 10) || 0, y = parseInt(el.style.top, 10) || 0;
      w = Math.min(w, snap(surface.clientWidth - x)); h = Math.min(h, snap(surface.clientHeight - y));
      el.style.width = w + "px"; el.style.height = h + "px"; el.classList.toggle("wide", w >= 360);
      if (isValid(el, { x, y, w, h })) { lw = w; lh = h; el.classList.remove("invalid"); } else el.classList.add("invalid");
    }
    function up() {
      if (!rz) return; rz = false; el.classList.remove("resizing"); el.style.zIndex = 1;
      if (el.classList.contains("invalid")) { el.style.width = lw + "px"; el.style.height = lh + "px"; el.classList.toggle("wide", lw >= 360); el.classList.remove("invalid"); }
      document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); sync();
    }
  }

  function collect() {
    return [...surface.querySelectorAll(".item")].map((el) => ({
      id: el.dataset.id, type: el.dataset.type,
      title: el.querySelector(".item-title").textContent, body: el.dataset.bodyText || "", url: el.dataset.url || "", icon: el.dataset.icon,
      primary: el.dataset.primary === "1",
      x: parseInt(el.style.left, 10) || 0, y: parseInt(el.style.top, 10) || 0, w: parseInt(el.style.width, 10) || 240, h: parseInt(el.style.height, 10) || 160,
    }));
  }
  function sync() { if (!hasProfile()) return; activeProfile().blocks = collect(); persist(); }
  function refresh() { const b = collect(); surface.innerHTML = ""; b.forEach(makeItem); }
  function renderAll() {
    surface.innerHTML = "";
    (activeProfile().blocks || []).forEach((b, i) => {
      makeItem(b);
      const el = surface.lastChild;
      el.classList.add("appear");
      el.querySelector(".item-content").style.animationDelay = (i * 0.05) + "s";  // блоки появляются по очереди
      setTimeout(() => el.classList.remove("appear"), 600);
    });
  }

  function findFreeSpot(w, h) {
    for (let y = 0; y <= surface.clientHeight - h; y += CELL)
      for (let x = 0; x <= surface.clientWidth - w; x += CELL)
        if (isValid(null, { x, y, w, h })) return { x, y };
    return { x: 0, y: 0 };
  }

  function openVersionPicker(anchorEl) {
    let pop = document.getElementById("blkVerPop");
    if (pop) pop.remove();
    pop = document.createElement("div");
    pop.id = "blkVerPop";
    pop.className = "blk-ver-pop show";
    const s = activeProfile().settings;
    versionOptions().forEach((v) => {
      const ver = document.createElement("div");
      ver.className = "vl-ver" + (v.id === s.version ? " active" : "");
      ver.innerHTML = `<span>${esc(v.id)}${v.tag ? ' · ' + v.tag : ''}</span><span class="chev">›</span>`;
      ver.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showLoaderPicker(ver, v.id);
      });
      pop.appendChild(ver);
    });
    document.body.appendChild(pop);
    const r = anchorEl.getBoundingClientRect();
    let left = r.left, top = r.bottom + 6;
    if (left + 220 > window.innerWidth) left = window.innerWidth - 228;
    if (top + 260 > window.innerHeight) top = r.top - 266;
    pop.style.left = Math.max(8, left) + "px";
    pop.style.top = Math.max(8, top) + "px";
    setTimeout(() => {
      document.addEventListener("click", function closer(e) {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", closer); }
      });
    }, 0);
  }

  function openServerPicker(anchorEl) {
    let pop = document.getElementById("blkSrvPop");
    if (pop) pop.remove();
    pop = document.createElement("div");
    pop.id = "blkSrvPop";
    pop.className = "blk-ver-pop show";
    const cur = Servers.activeIp();
    const servers = Servers.list();
    if (!servers.length) {
      const empty = document.createElement("div");
      empty.className = "sv-empty"; empty.style.padding = "10px"; empty.textContent = "Серверов нет — добавь в классике";
      pop.appendChild(empty);
    }
    // «Без сервера»
    const none = document.createElement("div");
    none.className = "vl-ver" + (!cur ? " active" : "");
    none.innerHTML = `<span>Без сервера</span>`;
    none.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (cur) Servers.toggle(cur); // снять активный
      pop.remove(); refresh(); if (typeof Servers !== "undefined") Servers.render();
    });
    pop.appendChild(none);
    servers.forEach((srv) => {
      const row = document.createElement("div");
      row.className = "vl-ver" + (srv.ip === cur ? " active" : "");
      row.innerHTML = `<span>${esc(srv.name)}</span>`;
      row.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (srv.ip !== cur) Servers.toggle(srv.ip); else Servers.toggle(srv.ip);
        pop.remove(); refresh(); if (typeof Servers !== "undefined") Servers.render();
      });
      pop.appendChild(row);
    });
    document.body.appendChild(pop);
    const r = anchorEl.getBoundingClientRect();
    let left = r.left, top = r.bottom + 6;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 208;
    if (top + 240 > window.innerHeight) top = r.top - 246;
    pop.style.left = Math.max(8, left) + "px";
    pop.style.top = Math.max(8, top) + "px";
    setTimeout(() => {
      document.addEventListener("click", function closer(e) {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", closer); }
      });
    }, 0);
  }

  function showLoaderPicker(verEl, versionId) {
    let sub = document.getElementById("blkLoaderPop");
    if (sub) sub.remove();
    sub = document.createElement("div");
    sub.id = "blkLoaderPop";
    sub.className = "blk-ver-pop show";
    LOADERS.forEach((l) => {
      const li = document.createElement("div");
      li.className = "vl-loader";
      li.textContent = l.nm;
      li.addEventListener("click", (ev) => {
        ev.stopPropagation();
        activeProfile().settings.version = versionId;
        activeProfile().settings.loader = l.id;
        persist();
        const pop = document.getElementById("blkVerPop"); if (pop) pop.remove();
        sub.remove();
        refresh();
        if (typeof Classic !== "undefined") Classic.render();
      });
      sub.appendChild(li);
    });
    document.body.appendChild(sub);
    const r = verEl.getBoundingClientRect();
    let left = r.right + 6;
    if (left + 160 > window.innerWidth) left = r.left - 166;
    sub.style.left = Math.max(8, left) + "px";
    sub.style.top = Math.max(8, r.top) + "px";
  }

  return { makeItem, collect, sync, refresh, renderAll, findFreeSpot, initEdit, setEditMode };
})();
