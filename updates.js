/* Вкладка обновлений: проверка версии через GitHub Releases. */
const Updates = (() => {
  let latestUrl = "", latestPage = "";

  function api() { return (window.pywebview && window.pywebview.api) ? window.pywebview.api : null; }

  async function onOpen() {
    if (!api()) return;
    const v = await api().app_version();
    document.getElementById("updCurrent").textContent = v;
  }

  async function check() {
    const status = document.getElementById("updStatus");
    const notes = document.getElementById("updNotes");
    const dlBtn = document.getElementById("updDownloadBtn");
    status.textContent = "Проверяю…";
    notes.textContent = "";
    dlBtn.style.display = "none";
    const r = await api().check_update();
    if (!r || !r.ok) { status.textContent = "Не удалось проверить обновления."; return; }
    document.getElementById("updCurrent").textContent = r.current;
    if (r.hasUpdate) {
      status.innerHTML = `Доступна новая версия: <b>${r.latest}</b>`;
      notes.textContent = r.notes || "";
      if (r.url || r.page) {
        latestUrl = r.url; latestPage = r.page;
        dlBtn.style.display = "";
      }
    } else {
      status.textContent = "У тебя последняя версия ✓";
    }
  }

  function download() {
    const link = latestUrl || latestPage;
    if (link && api()) api().open_update_page(link);
  }

  function init() {
    const c = document.getElementById("updCheckBtn");
    const d = document.getElementById("updDownloadBtn");
    if (c) c.addEventListener("click", check);
    if (d) d.addEventListener("click", download);
  }

  return { init, onOpen, check };
})();
