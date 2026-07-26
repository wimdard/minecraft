/* Классика: ник + версия→загрузчик + умная кнопка + Java + логи + достижения. */
const Classic = (() => {
  const wrap = document.getElementById("vlWrap");
  const trigger = document.getElementById("vlTrigger");
  const menu = document.getElementById("vlMenu");
  const valEl = document.getElementById("vlVal");
  const playBtn = document.getElementById("clPlay");

  let sub = null;
  let installedSet = new Set();

  function pid() { return App.state.activeProfile; }
  function keyOf(ver, loader) { return ver + "|" + loader; }

  function ensureSub() {
    if (sub) return sub;
    sub = document.createElement("div"); sub.className = "vl-sub";
    document.body.appendChild(sub); return sub;
  }
  function hideSub() { if (sub) sub.classList.remove("show"); }

  function showSubFor(verEl, versionId) {
    const s = ensureSub(); s.innerHTML = "";
    LOADERS.forEach((l) => {
      const li = document.createElement("div");
      li.className = "vl-loader"; li.textContent = l.nm;
      li.addEventListener("click", (ev) => {
        ev.stopPropagation();
        activeProfile().settings.version = versionId;
        activeProfile().settings.loader = l.id;
        persist(); wrap.classList.remove("open"); hideSub(); render();
      });
      s.appendChild(li);
    });
    s.classList.add("show");
    const r = verEl.getBoundingClientRect();
    const subW = s.offsetWidth, subH = s.offsetHeight, margin = 8;
    let left = r.right + margin;
    if (left + subW > window.innerWidth - margin) left = r.left - subW - margin;
    if (left < margin) left = margin;
    let top = r.top;
    if (top + subH > window.innerHeight - margin) top = window.innerHeight - subH - margin;
    if (top < margin) top = margin;
    s.style.left = left + "px"; s.style.top = top + "px";
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !wrap.classList.contains("open");
    if (opening) buildMenu();
    wrap.classList.toggle("open");
    if (!wrap.classList.contains("open")) hideSub();
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target) && (!sub || !sub.contains(e.target))) { wrap.classList.remove("open"); hideSub(); }
  });

  function buildMenu() {
    menu.innerHTML = "";
    const s = activeProfile().settings;
    versionOptions().forEach((v) => {
      const ver = document.createElement("div");
      ver.className = "vl-ver" + (v.id === s.version ? " active" : "");
      const inst = installedSet.has(keyOf(v.id, s.loader));
      ver.innerHTML = `<span>${esc(v.id)}${v.tag ? ' · ' + v.tag : ''}<span class="dot-inst ${inst ? 'on' : ''}"></span></span><span class="chev">›</span>`;
      ver.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const wasHot = ver.classList.contains("hot");
        menu.querySelectorAll(".vl-ver").forEach(x => x.classList.remove("hot"));
        hideSub();
        if (!wasHot) { ver.classList.add("hot"); showSubFor(ver, v.id); }
      });
      menu.appendChild(ver);
    });
  }

  function checkInstalled() {
    if (!api() || !hasProfile()) return;
    const s = activeProfile().settings;
    api().is_installed(pid(), s.version, s.loader).then((r) => {
      if (r && r.installed) installedSet.add(keyOf(s.version, s.loader));
      window.__blkInstalled = installedSet;
      updatePlayButton();
      if (typeof Blocks !== "undefined" && document.querySelector('.item.type-version')) Blocks.refresh();
    });
  }


  function updatePlayButton() {
    const s = activeProfile().settings;
    const inst = installedSet.has(keyOf(s.version, s.loader));
    playBtn.textContent = inst ? "▶ ИГРАТЬ" : "⬇ УСТАНОВИТЬ";
  }

  function render() {
    if (!hasProfile()) return;
    const s = activeProfile().settings;
    document.getElementById("clUser").value = s.username;
    valEl.textContent = s.version + " · " + loaderName(s.loader);
    const mb = Math.min(s.memory, maxMem());
    const a = memAssessment(mb, s.loader);
    document.getElementById("clMemVal").textContent = mb + " МБ";
    const note = document.getElementById("clMemNote");
    note.textContent = a.text; note.className = a.level;
    document.getElementById("clMemFill").style.width = Math.round((mb - 1024) / (maxMem() - 1024) * 100) + "%";
    if (typeof Servers !== "undefined") Servers.render();
    checkInstalled();
  }

  document.getElementById("clUser").addEventListener("change", () => {
    if (!hasProfile()) return;
    activeProfile().settings.username = document.getElementById("clUser").value.trim() || "Player";
    persist(); render();
  });

  function doLaunch(s, server) {
    showLaunch("Запуск…", 0);
    api().launch_game(pid(), s.version, s.username, s.memory, s.loader, server);
    if (typeof Achievements !== "undefined") {
      Achievements.unlock("first_launch");
      App.state.launchCount = (App.state.launchCount || 0) + 1; persist();
      if (App.state.launchCount >= 5) Achievements.unlock("launch_5");
      if (App.state.launchCount >= 25) Achievements.unlock("launch_25");
    }
  }

  function play(serverArg) {
    if (!api() || !hasProfile()) return;
    const s = activeProfile().settings;
    const inst = installedSet.has(keyOf(s.version, s.loader));
    const server = (serverArg !== undefined && serverArg !== null)
      ? serverArg
      : ((typeof Servers !== "undefined") ? Servers.activeIp() : "");
       if (inst) {
      doLaunch(s, server);
    } else {
      showLaunch("Подготовка…", 0);
      api().install_version(pid(), s.version, s.loader);
    }

  }

  playBtn.addEventListener("click", () => play());



  function showLaunch(stage, pct) {
    const ov = document.getElementById("launchOverlay");
    ov.classList.add("show");
    document.getElementById("launchStage").textContent = stage;
    document.getElementById("launchFill").style.width = pct + "%";
    document.getElementById("launchPct").textContent = pct + "%";
  }
  function hideLaunch() { document.getElementById("launchOverlay").classList.remove("show"); }
  function showLog(title, text) {
    askConfirm({ icon:"📄", title: title, text: `<pre class="log-pre">${esc(text || "(лог пуст)")}</pre>`, okText:"Закрыть" }, null);
  }

  window.onLaunchProgress = function (stage, pct) {
    if (stage === "__done__") { showLaunch("Готово!", 100); setTimeout(hideLaunch, 1500); return; }
    showLaunch(stage, pct);
  };
  window.onLaunchError = function (msg) {
    hideLaunch();
    showLog("Ошибка запуска", msg);
  };
  window.onGameCrash = function (code, tail) {
    hideLaunch();
    askConfirm({ icon:"💥", title:"Игра завершилась с ошибкой", text: `Код выхода: <b>${esc(String(code))}</b>. Показать последние строки лога?`, okText:"Показать лог", okClass:"btn-warn" }, () => {
      showLog("Лог краша", tail);
    });
  };
  window.onInstalled = function (version, loader) {
    installedSet.add(keyOf(version, loader));
    updatePlayButton();
    if (wrap.classList.contains("open")) buildMenu();
  };
  window.onModpackInstalled = function (filename, version) {
    hideLaunch();
    askConfirm({ icon:"📦", title:"Модпак установлен", text:`Сборка установлена в профиль.${version ? " Версия: <b>" + esc(version) + "</b>." : ""} Выбери её в списке версий и жми Играть.`, okText:"Ок" }, null);
    if (typeof Classic !== "undefined") Classic.render();
  };

  function initDropdown() {}
  return { render, initDropdown, play };
})();
