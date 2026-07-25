/* Красивое окно "Файлы изменились — перезагрузить?" по центру экрана. */
window.notifyReload = function (fname) {
  let overlay = document.getElementById("__reloadOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "__reloadOverlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = `
      <div style="width:360px;background:#14171c;border:1px solid #2a2f38;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.7);padding:26px;text-align:center;font-family:-apple-system,'SF Pro Display','Segoe UI',system-ui,sans-serif;color:#e8eaed;">
        <div style="font-size:40px;margin-bottom:10px;">🔄</div>
        <h3 style="font-size:19px;margin:0 0 8px;">Файлы изменились</h3>
        <p id="__reloadText" style="font-size:13px;color:#8a909a;margin:0 0 20px;line-height:1.5;">Обновить лаунчер, чтобы увидеть изменения?</p>
        <div style="display:flex;gap:10px;">
          <button id="__reloadLater" style="flex:1;padding:12px;border:none;border-radius:10px;background:rgba(255,255,255,0.07);color:#e8eaed;font-weight:700;font-size:14px;cursor:pointer;">Позже</button>
          <button id="__reloadNow" style="flex:1;padding:12px;border:none;border-radius:10px;background:var(--accent,#4caf50);color:#fff;font-weight:700;font-size:14px;cursor:pointer;">Перезагрузить</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById("__reloadNow").addEventListener("click", () => {
      if (window.pywebview && window.pywebview.api) window.pywebview.api.reload_now();
      else location.reload();
    });
    document.getElementById("__reloadLater").addEventListener("click", () => { overlay.style.display = "none"; });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });
  }
  overlay.style.display = "flex";
  document.getElementById("__reloadText").textContent = "Изменён: " + fname + ". Обновить лаунчер?";
};
   