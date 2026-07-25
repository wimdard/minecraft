/* Виджет серверов на главном экране + онлайн-статус (пинг) + достижение. */
const Servers = (() => {
  const wrap = document.getElementById("svWrap");
  const trigger = document.getElementById("svTrigger");
  const menu = document.getElementById("svMenu");
  const valEl = document.getElementById("svVal");

  let adding = false;

  function list() {
    if (!hasProfile()) return [];
    const s = activeProfile().settings;
    if (!Array.isArray(s.servers)) s.servers = [];
    return s.servers;
  }
  function activeIp() {
    if (!hasProfile()) return "";
    return activeProfile().settings.activeServer || "";
  }
  function labelFor(ip) {
    if (!ip) return "Без сервера";
    const found = list().find(x => x.ip === ip);
    return found ? found.name : ip;
  }
  function render() {
    if (!hasProfile()) return;
    valEl.textContent = labelFor(activeIp());
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !wrap.classList.contains("open");
    if (opening) { adding = false; buildMenu(); }
    wrap.classList.toggle("open");
  });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) wrap.classList.remove("open"); });

  function toggle(ip) {
    const cur = activeIp();
    activeProfile().settings.activeServer = (cur === ip) ? "" : ip;
    persist(); wrap.classList.remove("open"); render();
  }

  function pingInto(dotEl, infoEl, ip) {
    if (!api()) return;
    api().ping_server(ip).then((r) => {
      if (r && r.online) { dotEl.className = "sv-dot on"; infoEl.textContent = `${r.now}/${r.max}`; }
      else { dotEl.className = "sv-dot off"; infoEl.textContent = "оффлайн"; }
    });
  }

  function buildMenu() {
    menu.innerHTML = "";
    if (!adding) {
      const servers = list();
      if (!servers.length) {
        const empty = document.createElement("div");
        empty.className = "sv-empty"; empty.textContent = "Серверов пока нет";
        menu.appendChild(empty);
      }
      servers.forEach((srv) => {
        const isActive = srv.ip === activeIp();
        const row = document.createElement("div");
        row.className = "vl-ver" + (isActive ? " active" : "");
        row.innerHTML = `
          <span class="sv-name-wrap" title="${esc(srv.ip)}">
            <span class="sv-dot"></span>
            <span class="sv-nm">${esc(srv.name)}</span>
            <span class="sv-info">…</span>
          </span>
          <button class="sv-del" title="Удалить">🗑</button>`;
        row.addEventListener("click", (ev) => { ev.stopPropagation(); toggle(srv.ip); });
        row.querySelector(".sv-del").addEventListener("click", (ev) => {
          ev.stopPropagation();
          askConfirm({ icon:"🗑", title:"Удалить сервер?", text:`<b>${esc(srv.name)}</b> (${esc(srv.ip)})`, okText:"Удалить", okClass:"btn-danger" }, () => {
            const s = activeProfile().settings;
            s.servers = s.servers.filter(x => x.ip !== srv.ip);
            if (s.activeServer === srv.ip) s.activeServer = "";
            persist(); buildMenu(); render();
          });
        });
        menu.appendChild(row);
        pingInto(row.querySelector(".sv-dot"), row.querySelector(".sv-info"), srv.ip);
      });

      const addBtn = document.createElement("div");
      addBtn.className = "sv-add-open";
      addBtn.textContent = "＋ Добавить сервер";
      addBtn.addEventListener("click", (ev) => { ev.stopPropagation(); adding = true; buildMenu(); });
      menu.appendChild(addBtn);

    } else {
      const form = document.createElement("div");
      form.className = "sv-add";
      form.innerHTML = `
        <div class="sv-add-head">
          <button class="sv-back" title="Назад">‹</button>
          <span class="sv-add-title">Новый сервер</span>
        </div>
        <div class="sv-field">
          <span class="sv-lbl">Название</span>
          <input type="text" class="sv-in sv-name" placeholder="Например: Наш сервер">
        </div>
        <div class="sv-field">
          <span class="sv-lbl">Адрес</span>
          <input type="text" class="sv-in sv-ip" placeholder="IP или IP:порт">
        </div>
        <button class="sv-add-btn">Добавить</button>`;
      form.addEventListener("click", (e) => e.stopPropagation());

      const nameIn = form.querySelector(".sv-name");
      const ipIn = form.querySelector(".sv-ip");
      const doAdd = () => {
        const name = nameIn.value.trim();
        const ip = ipIn.value.trim();
        if (!ip) { ipIn.classList.add("sv-err"); ipIn.focus(); return; }
        const s = activeProfile().settings;
        if (!Array.isArray(s.servers)) s.servers = [];
        s.servers.push({ name: name || ip, ip });
        if (typeof Achievements !== "undefined") Achievements.unlock("first_server");
        persist(); adding = false; buildMenu(); render();
      };
      form.querySelector(".sv-add-btn").addEventListener("click", doAdd);
      form.querySelector(".sv-back").addEventListener("click", () => { adding = false; buildMenu(); });
      ipIn.addEventListener("input", () => ipIn.classList.remove("sv-err"));
      ipIn.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
      nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") ipIn.focus(); });

      menu.appendChild(form);
      setTimeout(() => nameIn.focus(), 30);
    }
  }

  return { render, activeIp, list, toggle, buildMenu };
})();
