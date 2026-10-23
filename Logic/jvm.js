/* Java и флаги JVM: пресет, свои флаги, своя Java. Всё хранится в настройках профиля. */
const Jvm = (() => {
  const presets = document.getElementById("jvmPresets");
  const argsEl = document.getElementById("jvmArgs");
  const javaVal = document.getElementById("javaPathVal");

  function s() { return hasProfile() ? activeProfile().settings : null; }

  function render() {
    const st = s(); if (!st || !presets) return;
    const cur = st.jvmPreset || "aikar";
    presets.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.preset === cur));
    argsEl.value = st.jvmArgs || "";
    argsEl.placeholder = cur === "custom"
      ? "твои флаги, например: -XX:+UseG1GC -XX:MaxGCPauseMillis=50"
      : "например: -Dsodium.checks.issue2561=false";
    javaVal.textContent = st.javaPath ? st.javaPath : "Автоматически (под версию игры)";
    javaVal.title = st.javaPath || "";
  }

  if (presets) presets.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    const st = s(); if (!st) return;
    st.jvmPreset = b.dataset.preset; persist(); render();
  }));

  if (argsEl) argsEl.addEventListener("change", () => {
    const st = s(); if (!st) return;
    st.jvmArgs = argsEl.value.trim(); persist();
  });

  const pick = document.getElementById("javaPickBtn");
  if (pick) pick.addEventListener("click", () => {
    if (!api()) return;
    api().pick_java().then((r) => {
      if (!r || (!r.ok && !r.error)) return;
      if (!r.ok) { askConfirm({ icon: "⚠️", title: "Не подошло", text: esc(r.error), okText: "Ок" }, null); return; }
      const st = s(); if (!st) return;
      st.javaPath = r.path; persist(); render();
      askConfirm({ icon: "☕", title: "Java выбрана", text: `Версия <b>${esc(r.version)}</b>. Учти: если она не подходит игре, игра не запустится — тогда нажми «Авто».`, okText: "Ок" }, null);
    });
  });

  const auto = document.getElementById("javaAutoBtn");
  if (auto) auto.addEventListener("click", () => {
    const st = s(); if (!st) return;
    delete st.javaPath; persist(); render();
  });

  // панель одна: обновляем блок при каждом открытии настроек
  const openBtn = document.getElementById("topSettings");
  if (openBtn) openBtn.addEventListener("click", () => setTimeout(render, 0));
  (function wait(n) { if (App.state) render(); else if (n < 50) setTimeout(() => wait(n + 1), 100); })(0);

  return { render };
})();
