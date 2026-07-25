let _confirmCb = null;
const _confirmModal = document.getElementById("confirmModal");

function askConfirm({ icon = "⚠️", title = "Подтверждение", text = "", okText = "Ок", okClass = "btn-save" }, cb) {
  document.getElementById("cmIcon").textContent = icon;
  document.getElementById("cmTitle").textContent = title;
  document.getElementById("cmText").innerHTML = text;
  const ok = document.getElementById("cmOk");
  ok.textContent = okText;
  ok.className = okClass;
  _confirmCb = cb;
  _confirmModal.classList.add("show");
}

function closeConfirm() { _confirmModal.classList.remove("show"); _confirmCb = null; }

document.getElementById("cmCancel").addEventListener("click", closeConfirm);
document.getElementById("cmOk").addEventListener("click", () => { const cb = _confirmCb; closeConfirm(); if (cb) cb(); });
_confirmModal.addEventListener("click", (e) => { if (e.target === _confirmModal) closeConfirm(); });
