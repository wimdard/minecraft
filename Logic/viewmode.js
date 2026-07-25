/* Переключатель вида: "blocks" (дашборд) | "classic" (лаунчер).
   Режим общий, хранится в App.state.viewMode. */
const ViewMode = (() => {
  const toggle = document.getElementById("viewToggle");

  function current() { return (App.state && App.state.viewMode) || "blocks"; }

  function apply(mode) {
    document.body.dataset.view = mode;
    if (toggle) toggle.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.view === mode));
    // classic-экран построим на Шаге 2; пока просто помечаем body
    if (typeof Classic !== "undefined" && mode === "classic") Classic.render();
  }

  function set(mode) {
    if (App.state) { App.state.viewMode = mode; persist(); }
    apply(mode);
  }

  function init() {
    if (toggle) {
      toggle.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => set(b.dataset.view));
      });
    }
    apply(current());
  }

  return { init, apply, current, set };
})();
