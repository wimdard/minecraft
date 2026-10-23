/* Инструменты сборки: перенос модов на другую версию + проверка конфликтов (и перед запуском). */
const ModTools = (() => {
  let modal = null;

  function vl() { const s = activeProfile().settings; return [s.version, s.loader || "vanilla"]; }

  function open(html) {
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "modal-overlay"; modal.id = "modToolsModal";
      modal.innerHTML = '<div class="modal mt-modal"></div>';
      modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
      document.body.appendChild(modal);
    }
    modal.querySelector(".mt-modal").innerHTML = html;
    modal.classList.add("show");
    return modal.querySelector(".mt-modal");
  }
  function close() { if (modal) modal.classList.remove("show"); }
  function busy(box, text) {
    const b = box.querySelector(".mt-body");
    if (b) b.innerHTML = `<div class="mt-busy"><span class="mt-spin"></span>${esc(text)}</div>`;
  }
  const icon = (url) => url
    ? `<img class="mt-ic" src="${url}" onerror="this.style.visibility='hidden'">`
    : `<span class="mt-ic mt-ic-empty">📦</span>`;

  function refreshAll() {
    if (typeof Classic !== "undefined" && Classic.render) Classic.render();
    if (typeof Mods !== "undefined" && Mods.refresh) Mods.refresh();
    if (typeof ModSets !== "undefined" && ModSets.render) ModSets.render();
  }

  // ---------- перенос на другую версию ----------
  function openMigrate() {
    if (!api() || !hasProfile()) return;
    const [curV, curL] = vl();
    const versions = (typeof versionOptions === "function" ? versionOptions() : []).filter(v => !v.tag);
    const box = open(`
      <h3 class="mt-title"><svg class="ic"><use href="#i-swap"/></svg>Перенос сборки на другую версию</h3>
      <p class="mt-sub">Сейчас: <b>${esc(curV)} · ${esc(loaderName(curL))}</b>. Лаунчер найдёт те же моды под новую версию и покажет, каких нет.</p>
      <div class="mt-pick">
        <label>Версия<select id="mtVer" class="browse-sel">${versions.map(v => `<option value="${esc(v.id)}">${esc(v.id)}</option>`).join("")}</select></label>
        <label>Загрузчик<select id="mtLdr" class="browse-sel"></select></label>
        <button class="mt-btn" id="mtPlan"><svg class="ic"><use href="#i-check"/></svg><span>Проверить моды</span></button>
      </div>
      <div class="mt-body"></div>
      <div class="modal-actions"><button class="btn-cancel" id="mtClose">Закрыть</button></div>`);
    const verSel = box.querySelector("#mtVer"), ldrSel = box.querySelector("#mtLdr");
    const fillLoaders = () => {
      const ls = (typeof loadersFor === "function" ? loadersFor(verSel.value) : []).filter(l => l.id !== "vanilla");
      ldrSel.innerHTML = ls.map(l => `<option value="${l.id}"${l.id === curL ? " selected" : ""}>${esc(l.nm)}</option>`).join("");
    };
    const firstOther = versions.find(v => v.id !== curV);
    if (firstOther) verSel.value = firstOther.id;
    fillLoaders();
    verSel.addEventListener("change", fillLoaders);
    box.querySelector("#mtClose").addEventListener("click", close);
    box.querySelector("#mtPlan").addEventListener("click", () => plan(box, curV, curL, verSel.value, ldrSel.value));
  }

  function plan(box, fromV, fromL, toV, toL) {
    busy(box, "Сверяю моды с Modrinth…");
    api().plan_migration(App.state.activeProfile, fromV, fromL, toV, toL).then((r) => {
      const body = box.querySelector(".mt-body");
      if (!r || !r.ok) { body.innerHTML = `<div class="mt-err">⚠️ ${esc((r && r.error) || "Ошибка")}</div>`; return; }
      const c = r.count, total = r.items.length;
      const row = (it) => {
        const st = it.status === "ok"
          ? `<em class="mt-tag ok">${esc(it.from)} → ${esc(it.to)}</em>`
          : it.status === "missing" ? `<em class="mt-tag bad">нет под ${esc(toV)}</em>`
          : `<em class="mt-tag muted">не с Modrinth</em>`;
        const chk = it.status === "ok"
          ? `<input type="checkbox" class="dep-chk mt-chk" data-vid="${esc(it.version_id)}" checked>`
          : it.status === "unknown"
            ? `<input type="checkbox" class="dep-chk mt-copy" data-file="${esc(it.filename)}" title="Скопировать файл как есть — может не запуститься">`
            : `<input type="checkbox" class="dep-chk" disabled>`;
        return `<label class="mt-row ${it.status}">${chk}${icon(it.icon_url)}<span class="mt-nm" title="${esc(it.filename)}">${esc(it.name)}</span>${st}</label>`;
      };
      body.innerHTML = `
        <div class="mt-sum">
          <span class="mt-pill ok">✓ есть: <b>${c.ok}</b> из ${total}</span>
          ${c.missing ? `<span class="mt-pill bad">✗ нет версии: <b>${c.missing}</b></span>` : ""}
          ${c.unknown ? `<span class="mt-pill muted">? не с Modrinth: <b>${c.unknown}</b></span>` : ""}
        </div>
        <div class="mt-list">${r.items.map(row).join("")}</div>
        ${c.unknown ? `<div class="mt-note">Моды не с Modrinth можно отметить — их файл скопируется как есть, но под новой версией он может не работать.</div>` : ""}
        <label class="mt-switch"><input type="checkbox" class="dep-chk" id="mtSwitch" checked> Переключиться на ${esc(toV)} · ${esc(loaderName(toL))} после переноса</label>
        <button class="mt-go" id="mtGo"></button>`;
      const go = body.querySelector("#mtGo");
      const upd = () => {
        const n = body.querySelectorAll(".mt-chk:checked").length + body.querySelectorAll(".mt-copy:checked").length;
        go.innerHTML = n ? `<svg class="ic"><use href="#i-swap"/></svg><span>Перенести</span><b class="mt-go-n">${n}</b>` : "<span>Нечего переносить</span>";
        go.disabled = !n;
      };
      body.querySelectorAll(".mt-chk, .mt-copy").forEach(x => x.addEventListener("change", upd));
      upd();
      go.addEventListener("click", () => {
        const vids = [...body.querySelectorAll(".mt-chk:checked")].map(x => x.dataset.vid);
        const files = [...body.querySelectorAll(".mt-copy:checked")].map(x => x.dataset.file);
        const sw = body.querySelector("#mtSwitch").checked;
        busy(box, `Скачиваю моды под ${toV}…`);
        api().run_migration(App.state.activeProfile, fromV, fromL, toV, toL, vids, files).then((res) => {
          const b = box.querySelector(".mt-body");
          if (!res || !res.ok) { b.innerHTML = `<div class="mt-err">⚠️ ${esc((res && res.error) || "Ошибка")}</div>`; return; }
          if (sw) {
            const s = activeProfile().settings;
            s.version = toV; s.loader = toL; persist();
          }
          refreshAll();
          const deps = (res.deps || []).length;
          b.innerHTML = `
            <div class="mt-done">✅ Готово: перенесено <b>${res.installed}</b> мод(ов)` +
            (res.copied ? `, скопировано как есть: <b>${res.copied}</b>` : "") +
            (deps ? `, добавлено зависимостей: <b>${deps}</b>` : "") + `.` +
            (res.failed && res.failed.length ? `<div class="mt-err">Не скачалось: ${res.failed.map(esc).join(", ")}</div>` : "") +
            (sw ? `<div class="mt-sub">Версия переключена на <b>${esc(toV)} · ${esc(loaderName(toL))}</b>. Если её ещё нет, кнопка покажет «Установить».</div>` : "") +
            `</div>`;
        });
      });
    });
  }

  // ---------- проверка конфликтов ----------
  function renderIssues(box, r, onRecheck) {
    const body = box.querySelector(".mt-body");
    if (!r || !r.ok) {
      body.innerHTML = `<div class="mt-err">⚠️ ${r && r.offline ? "Нет связи с Modrinth — проверить не получилось." : esc((r && r.error) || "Ошибка")}</div>`;
      return;
    }
    const unk = (r.unknown || []).length;
    if (!r.issues.length) {
      body.innerHTML = `<div class="mt-done">✅ Проблем не нашёл. Проверено модов: <b>${r.checked}</b>.` +
        (unk ? `<div class="mt-sub">${unk} мод(ов) не с Modrinth — их проверить нельзя.</div>` : "") + `</div>`;
      return;
    }
    body.innerHTML = `<div class="mt-list">` + r.issues.map((it, i) => {
      const fix = it.fix ? `<button class="mod-btn install mt-fix" data-i="${i}">Установить</button>` : "";
      const off = (it.files || []).map(f => `<button class="mod-btn mt-off" data-file="${esc(f)}" title="Выключить этот файл">выкл ${esc(f.length > 28 ? f.slice(0, 26) + "…" : f)}</button>`).join("");
      return `<div class="mt-issue ${it.level}"><span class="mt-lvl">${it.level === "error" ? "⛔" : "⚠️"}</span><div class="mt-itext">${esc(it.text)}<div class="mt-acts">${fix}${off}</div></div></div>`;
    }).join("") + `</div>` + (unk ? `<div class="mt-note">${unk} мод(ов) не с Modrinth — их проверить нельзя.</div>` : "");
    const [v, l] = vl();
    body.querySelectorAll(".mt-fix").forEach(b => b.addEventListener("click", () => {
      const it = r.issues[+b.dataset.i];
      b.disabled = true; b.textContent = "Ставлю…";
      api().install_mod(App.state.activeProfile, it.fix, l, v, "mod").then(() => { refreshAll(); onRecheck(); });
    }));
    body.querySelectorAll(".mt-off").forEach(b => b.addEventListener("click", () => {
      b.disabled = true;
      api().toggle_mod(App.state.activeProfile, b.dataset.file, "mod").then(() => { refreshAll(); onRecheck(); });
    }));
  }

  function openCheck() {
    if (!api() || !hasProfile()) return;
    const [v, l] = vl();
    if (l === "vanilla") { askConfirm({ icon: "🩺", title: "Проверка модов", text: "На ванильной версии моды не используются.", okText: "Ок" }, null); return; }
    const box = open(`
      <h3 class="mt-title"><svg class="ic"><use href="#i-check"/></svg>Проверка модов</h3>
      <p class="mt-sub">${esc(v)} · ${esc(loaderName(l))}: дубли, недостающие зависимости, несовместимые моды, моды под другую версию.</p>
      <div class="mt-body"></div>
      <div class="modal-actions"><button class="btn-cancel" id="mtClose">Закрыть</button><button class="btn-save" id="mtAgain">Проверить снова</button></div>`);
    const run = () => { busy(box, "Проверяю моды…"); api().check_mods(App.state.activeProfile, v, l).then(r => renderIssues(box, r, run)); };
    box.querySelector("#mtClose").addEventListener("click", close);
    box.querySelector("#mtAgain").addEventListener("click", run);
    run();
  }

  // ---------- проверка перед запуском ----------
  function hookLaunch() {
    const a = window.pywebview && window.pywebview.api;
    if (!a || !a.launch_game || a.launch_game.__modcheck) return;
    const orig = a.launch_game;
    const wrapped = function (pid, version, username, memory, loader) {
      const args = arguments;
      if (!loader || loader === "vanilla") return orig.apply(a, args);
      const timeout = new Promise(res => setTimeout(() => res(null), 6000));
      return Promise.race([a.check_mods(pid, version, loader), timeout]).then((r) => {
        const errors = r && r.ok ? r.issues.filter(i => i.level === "error") : [];
        if (!errors.length) return orig.apply(a, args);
        const ov = document.getElementById("launchOverlay"); if (ov) ov.classList.remove("show");
        const box = open(`
          <h3>⛔ Игра, скорее всего, вылетит</h3>
          <p class="mt-sub">Нашёл проблемы в модах. Исправь их или запусти как есть.</p>
          <div class="mt-body"></div>
          <div class="modal-actions"><button class="btn-cancel" id="mtCancel">Отмена</button><button class="btn-warn" id="mtAnyway">Запустить всё равно</button></div>`);
        const recheck = () => { busy(box, "Проверяю моды…"); a.check_mods(pid, version, loader).then(rr => renderIssues(box, rr, recheck)); };
        renderIssues(box, r, recheck);
        box.querySelector("#mtCancel").addEventListener("click", close);
        box.querySelector("#mtAnyway").addEventListener("click", () => {
          close();
          if (ov) ov.classList.add("show");
          orig.apply(a, args);
        });
      });
    };
    wrapped.__modcheck = true;
    a.launch_game = wrapped;
  }
  hookLaunch();
  window.addEventListener("pywebviewready", hookLaunch);

  const mBtn = document.getElementById("modMigrate");
  if (mBtn) mBtn.addEventListener("click", openMigrate);
  const cBtn = document.getElementById("modCheck");
  if (cBtn) cBtn.addEventListener("click", openCheck);

  return { openMigrate, openCheck };
})();
