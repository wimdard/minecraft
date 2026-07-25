/* Показывает ошибки JS прямо на экране (для отладки) */
window.addEventListener("error", (e) => {
  showErr((e.message || "Ошибка") + "  @ " + (e.filename || "").split("/").pop() + ":" + e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  showErr("Promise: " + (e.reason && e.reason.message ? e.reason.message : e.reason));
});
function showErr(msg) {
  let box = document.getElementById("__errbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "__errbox";
    box.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#e53935;color:#fff;font:13px monospace;padding:10px 14px;white-space:pre-wrap;max-height:40vh;overflow:auto;";
    document.body.appendChild(box);
  }
  box.textContent += msg + "\n";
}
