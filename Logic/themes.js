/* Бета: пользовательские CSS-темы. Накладывают свой .css поверх базового стиля. */
const UserThemes = (() => {
  const KEY = "mc_user_theme";
  function styleEl() {
    let s = document.getElementById("userThemeStyle");
    if (!s) { s = document.createElement("style"); s.id = "userThemeStyle"; document.head.appendChild(s); }
    return s;
  }
  function apply(css) {
    // на время смены темы выключаем анимации, иначе панели «едут» от старого места к новому
    const root = document.documentElement;
    let guard = document.getElementById("themeSwitchGuard");
    if (!guard) {
      guard = document.createElement("style"); guard.id = "themeSwitchGuard";
      guard.textContent = "html.theme-switching *, html.theme-switching *::before, html.theme-switching *::after { transition:none !important; animation-duration:0s !important; }";
      document.head.appendChild(guard);
    }
    root.classList.add("theme-switching");
    styleEl().textContent = css || "";
    void root.offsetHeight; // применить стили сразу, пока анимации выключены
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  }
  function current() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function setCurrent(name) { try { name ? localStorage.setItem(KEY, name) : localStorage.removeItem(KEY); } catch (e) {} }

  function selectTheme(name, chip) {
    const row = document.getElementById("userThemeRow");
    if (row) row.querySelectorAll(".skin-chip").forEach(c => c.classList.remove("active"));
    if (chip) chip.classList.add("active");
    if (!name) { apply(""); setCurrent(""); return; }
    if (!api()) return;
    api().read_theme(name).then(r => {
      if (r && r.ok) { apply(r.css); setCurrent(name); }
      else if (typeof askConfirm === "function") {
        askConfirm({ icon: "⚠️", title: "Тема не загрузилась", text: esc((r && r.error) || "Ошибка"), okText: "Ок" }, null);
      }
    });
  }

  function build() {
    const row = document.getElementById("userThemeRow");
    if (!row || !api()) return;
    api().list_themes().then(r => {
      const list = (r && r.themes) || [];
      row.innerHTML = "";
      const mk = (name, label) => {
        const b = document.createElement("button");
        b.className = "skin-chip" + (current() === name ? " active" : "");
        b.textContent = label; b.dataset.theme = name;
        b.addEventListener("click", () => selectTheme(name, b));
        row.appendChild(b);
      };
      mk("", "Без темы");
      list.forEach(n => mk(n, n));
    });
  }

  function reapply() {
    const name = current();
    if (name && api()) api().read_theme(name).then(r => { if (r && r.ok) apply(r.css); });
  }

  function init() { build(); reapply(); }

  const openBtn = document.getElementById("openThemesBtn");
  if (openBtn) openBtn.addEventListener("click", () => { if (api()) api().open_themes_folder(); setTimeout(build, 500); });

  const reloadBtn = document.getElementById("reloadThemesBtn");
  if (reloadBtn) reloadBtn.addEventListener("click", () => { build(); reapply(); });

  const importBtn = document.getElementById("importThemeBtn");
  if (importBtn) importBtn.addEventListener("click", () => {
    if (!api()) return;
    api().import_theme().then(r => {
      if (r && r.ok && r.added && r.added.length) build();
      else if (r && r.error && typeof askConfirm === "function")
        askConfirm({ icon: "⚠️", title: "Не удалось", text: esc(r.error), okText: "Ок" }, null);
    });
  });

  return { init, build, reapply };
})();

window.addEventListener("pywebviewready", () => { try { UserThemes.init(); } catch (e) {} });
setTimeout(() => { try { UserThemes.reapply(); } catch (e) {} }, 1200);
