/* Идеи построек — заметки с галереей, каруселью, по профилю. */
const Ideas = (() => {
  const grid = document.getElementById("ideasGrid");
  const filters = document.getElementById("ideasFilters");
  const modal = document.getElementById("ideaModal");

  let editingId = null, pickedTag = "", pickedDiff = "", photos = [], filter = "";
  let carouselIdx = 0, carouselPhotos = [];
  const TAGS = ["Дом","Ферма","Редстоун","Декор","Эпик","Город","Храм","Мост","Башня","Корабль","Подземелье","Природа","Развлечения","Арена","Транспорт"];

  function list() {
    if (!hasProfile()) return [];
    const s = activeProfile().settings;
    if (!Array.isArray(s.ideas)) s.ideas = [];
    s.ideas.forEach(i => { if (!Array.isArray(i.photos)) i.photos = i.photo ? [i.photo] : []; });
    return s.ideas;
  }
  function cover(idea) { return (idea.photos && idea.photos[0]) || ""; }

  function onOpen() {
    if (!hasProfile()) { grid.innerHTML = '<div class="mods-status">Сначала создай профиль</div>'; return; }
    renderFilters(); render();
  }

  function renderFilters() {
    filters.innerHTML = "";
    const mk = (label, val) => {
      const b = document.createElement("button");
      b.className = "idea-filter" + (filter === val ? " active" : "");
      b.textContent = label;
      b.onclick = () => { filter = val; renderFilters(); render(); };
      filters.appendChild(b);
    };
    mk("Все", "");
    TAGS.forEach(t => mk(t, t));
  }

  function render() {
    const items = list().filter(i => !filter || i.tag === filter);
    if (!items.length) { grid.innerHTML = '<div class="mods-status">Пока пусто. Нажми «+ Добавить идею».</div>'; return; }
    grid.innerHTML = "";
    items.forEach((idea) => {
      const card = document.createElement("div");
      card.className = "idea-card";
      const c = cover(idea);
      const photoHtml = c ? `<div class="idea-card-photo" style="background-image:url('${c}')">${idea.photos.length > 1 ? `<span class="idea-count">📷 ${idea.photos.length}</span>` : ""}</div>` : `<div class="idea-card-photo empty">💡</div>`;
      card.innerHTML = `${photoHtml}
        <div class="idea-card-body">
          <div class="idea-card-title">${esc(idea.name)}</div>
          <div class="idea-card-desc">${esc(idea.desc || "")}</div>
          <div class="idea-card-meta">${idea.tag ? `<span class="idea-badge">${esc(idea.tag)}</span>` : ""}${idea.diff ? `<span class="idea-badge diff">${esc(idea.diff)}</span>` : ""}</div>
        </div>
        <div class="idea-card-actions">
          <button class="idea-edit" title="Изменить">✎</button>
          <button class="idea-del" title="Удалить">🗑</button>
        </div>`;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".idea-edit") || e.target.closest(".idea-del")) return;
        openView(idea.id);
      });
      card.querySelector(".idea-edit").onclick = (e) => { e.stopPropagation(); open(idea.id); };
      card.querySelector(".idea-del").onclick = (e) => {
        e.stopPropagation();
        askConfirm({ icon:"🗑", title:"Удалить идею?", text: esc(idea.name), okText:"Удалить", okClass:"btn-danger" }, () => {
          const s = activeProfile().settings;
          s.ideas = s.ideas.filter(x => x.id !== idea.id);
          persist(); render();
        });
      };
      grid.appendChild(card);
    });
  }

  function renderGallery() {
    const g = document.getElementById("ideaGallery");
    g.innerHTML = "";
    if (!photos.length) { g.innerHTML = '<div class="idea-gallery-empty">Нет фото</div>'; return; }
    photos.forEach((p, idx) => {
      const item = document.createElement("div");
      item.className = "idea-thumb";
      item.style.backgroundImage = `url('${p}')`;
      item.innerHTML = `<button class="idea-thumb-del" title="Убрать">×</button>`;
      item.querySelector(".idea-thumb-del").onclick = () => { photos.splice(idx, 1); renderGallery(); };
      g.appendChild(item);
    });
  }

  function open(id) {
    editingId = id || null;
    const idea = id ? list().find(x => x.id === id) : null;
    document.getElementById("ideaModalTitle").textContent = id ? "Изменить идею" : "Новая идея";
    document.getElementById("ideaName").value = idea ? idea.name : "";
    document.getElementById("ideaDesc").value = idea ? (idea.desc || "") : "";
    pickedTag = idea ? (idea.tag || "") : "";
    pickedDiff = idea ? (idea.diff || "") : "";
    photos = idea ? [...(idea.photos || [])] : [];
    renderGallery();
    document.querySelectorAll("#ideaTags button").forEach(b => b.classList.toggle("active", b.dataset.tag === pickedTag));
    document.querySelectorAll("#ideaDiff button").forEach(b => b.classList.toggle("active", b.dataset.diff === pickedDiff));
    modal.classList.add("show");
  }
  function close() { modal.classList.remove("show"); }

  function renderCarousel() {
    const track = document.getElementById("ivTrack");
    const dots = document.getElementById("ivDots");
    track.style.transform = `translateX(-${carouselIdx * 100}%)`;
    dots.querySelectorAll(".iv-dot").forEach((d, i) => d.classList.toggle("active", i === carouselIdx));
    const multi = carouselPhotos.length > 1;
    document.getElementById("ivPrev").classList.toggle("hidden", !multi);
    document.getElementById("ivNext").classList.toggle("hidden", !multi);
  }

  function openView(id) {
    const idea = list().find(x => x.id === id);
    if (!idea) return;
    const vm = document.getElementById("ideaViewModal");
    carouselPhotos = (idea.photos && idea.photos.length) ? idea.photos : [];
    carouselIdx = 0;
    const track = document.getElementById("ivTrack");
    const dots = document.getElementById("ivDots");
    track.innerHTML = ""; dots.innerHTML = "";
    if (carouselPhotos.length) {
      carouselPhotos.forEach((p, i) => {
        const s = document.createElement("div");
        s.className = "iv-slide"; s.style.backgroundImage = `url('${p}')`;
        track.appendChild(s);
        const dot = document.createElement("div");
        dot.className = "iv-dot" + (i === 0 ? " active" : "");
        dot.onclick = () => { carouselIdx = i; renderCarousel(); };
        dots.appendChild(dot);
      });
    } else {
      const s = document.createElement("div"); s.className = "iv-slide empty"; s.textContent = "💡"; track.appendChild(s);
    }
    renderCarousel();
    document.getElementById("ivTitle").textContent = idea.name;
    document.getElementById("ivDesc").textContent = idea.desc || "Без описания";
    document.getElementById("ivMeta").innerHTML = `${idea.tag ? `<span class="idea-badge">${esc(idea.tag)}</span>` : ""}${idea.diff ? `<span class="idea-badge diff">${esc(idea.diff)}</span>` : ""}`;
    document.getElementById("ivEdit").onclick = () => { vm.classList.remove("show"); open(id); };
    document.getElementById("ivPinterest").onclick = () => window.open("https://www.pinterest.com/search/pins/?q=" + encodeURIComponent("minecraft " + idea.name), "_blank");
    vm.classList.add("show");
  }

  const urlModal = document.getElementById("urlModal");
  function askUrl(cb) {
    const input = document.getElementById("urlInput");
    const prev = document.getElementById("urlPreview");
    const bigBtn = document.getElementById("urlPasteBig");
    input.value = ""; prev.style.backgroundImage = "";
    urlModal.classList.add("show");
    const preview = () => { prev.style.backgroundImage = input.value.trim() ? `url('${input.value.trim()}')` : ""; };
    const commit = (v) => {
      cb(v); urlModal.classList.remove("show");
      askConfirm({ icon:"✅", title:"Фото добавлено", text:"Картинка добавлена в галерею идеи.", okText:"Ок" }, null);
    };
    if (bigBtn) bigBtn.onclick = () => {
      if (!api() || !api().read_clipboard) { input.focus(); return; }
      api().read_clipboard().then((r) => {
        if (r && r.ok && r.text) commit(r.text);
        else askConfirm({ icon:"📋", title:"Буфер пуст", text:"Скопируй ссылку и нажми снова.", okText:"Ок" }, null);
      });
    };
    input.oninput = preview;
    document.getElementById("urlOk").onclick = () => { const v = input.value.trim(); if (v) commit(v); };
    document.getElementById("urlCancel").onclick = () => urlModal.classList.remove("show");
  }

  document.getElementById("ideasAdd").addEventListener("click", () => open(null));
  document.getElementById("ideaCancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  urlModal.addEventListener("click", (e) => { if (e.target === urlModal) urlModal.classList.remove("show"); });

  document.querySelectorAll("#ideaTags button").forEach(b => b.addEventListener("click", () => {
    pickedTag = pickedTag === b.dataset.tag ? "" : b.dataset.tag;
    document.querySelectorAll("#ideaTags button").forEach(x => x.classList.toggle("active", x.dataset.tag === pickedTag));
  }));
  document.querySelectorAll("#ideaDiff button").forEach(b => b.addEventListener("click", () => {
    pickedDiff = pickedDiff === b.dataset.diff ? "" : b.dataset.diff;
    document.querySelectorAll("#ideaDiff button").forEach(x => x.classList.toggle("active", x.dataset.diff === pickedDiff));
  }));

  document.getElementById("ideaPickBtn").addEventListener("click", () => {
    if (!api()) return;
    const fn = api().pick_images ? api().pick_images() : api().pick_image().then(r => r && r.ok ? { ok:true, urls:[r.url] } : r);
    Promise.resolve(fn).then((r) => { if (r && r.ok && r.urls) { r.urls.forEach(u => photos.push(u)); renderGallery(); } });
  });
  document.getElementById("ideaUrlBtn").addEventListener("click", () => { askUrl((url) => { photos.push(url); renderGallery(); }); });

  document.getElementById("ideaPinterest").addEventListener("click", () => {
    const name = document.getElementById("ideaName").value.trim() || "minecraft build";
    window.open("https://www.pinterest.com/search/pins/?q=" + encodeURIComponent("minecraft " + name), "_blank");
  });

  document.getElementById("ideaSave").addEventListener("click", () => {
    const name = document.getElementById("ideaName").value.trim();
    if (!name) { askConfirm({ icon:"✏️", title:"Нужно название", text:"Введи название идеи.", okText:"Ок" }, null); return; }
    const desc = document.getElementById("ideaDesc").value;
    const s = activeProfile().settings;
    if (! Array.isArray(s.ideas)) s.ideas = [];
    if (editingId) {
      const it = s.ideas.find(x => x.id === editingId);
      if (it) { it.name = name; it.desc = desc; it.tag = pickedTag; it.diff = pickedDiff; it.photos = [...photos]; delete it.photo; }
    } else {
      s.ideas.push({ id: "i" + Date.now(), name, desc, tag: pickedTag, diff: pickedDiff, photos: [...photos] });
      if (typeof Achievements !== "undefined") {
        Achievements.unlock("first_idea");
        if (s.ideas.length >= 10) Achievements.unlock("ideas_10");
      }
    }
    persist(); close(); render();
  });

  document.getElementById("ivPrev").addEventListener("click", () => {
    if (carouselPhotos.length < 2) return;
    carouselIdx = (carouselIdx - 1 + carouselPhotos.length) % carouselPhotos.length; renderCarousel();
  });
  document.getElementById("ivNext").addEventListener("click", () => {
    if (carouselPhotos.length < 2) return;
    carouselIdx = (carouselIdx + 1) % carouselPhotos.length; renderCarousel();
  });

  (function () {
    const car = document.querySelector(".iv-carousel");
    if (!car) return;
    let lock = false;
    car.addEventListener("wheel", (e) => {
      if (carouselPhotos.length < 2) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) < 8) return;
      e.preventDefault();
      if (lock) return;
      lock = true;
      if (d > 0) carouselIdx = (carouselIdx + 1) % carouselPhotos.length;
      else carouselIdx = (carouselIdx - 1 + carouselPhotos.length) % carouselPhotos.length;
      renderCarousel();
      setTimeout(() => { lock = false; }, 400);
    }, { passive: false });
  })();

  document.getElementById("ideaViewClose").addEventListener("click", () => document.getElementById("ideaViewModal").classList.remove("show"));
  document.getElementById("ivClose2").addEventListener("click", () => document.getElementById("ideaViewModal").classList.remove("show"));
  document.getElementById("ideaViewModal").addEventListener("click", (e) => { if (e.target.id === "ideaViewModal") e.currentTarget.classList.remove("show"); });

  return { onOpen };
})();
