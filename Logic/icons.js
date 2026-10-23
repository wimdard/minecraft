/* Рисованные иконки вместо эмодзи по всему лаунчеру.
   Набор символов + автозамена эмодзи в интерфейсе (и в том, что появится позже).
   Пользовательский текст (описания модов, поля ввода, логи) не трогаем. */
const Icons = (() => {
  // ---------- набор иконок (24×24, линия currentColor) ----------
  const S = {
    trash:   '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5.5M14 11v5.5"/>',
    warn:    '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>',
    stop:    '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 12h9"/>',
    ok:      '<path d="M5 12.5l4.5 4.5L19 7"/>',
    okbox:   '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.3l2.8 2.8L16.5 9"/>',
    x:       '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    folder:  '<path d="M3 6.5h6l2 2.2h10v10.8H3z"/>',
    doc:     '<path d="M6 2.5h8l4 4V21.5H6z"/><path d="M14 2.5v4h4M9 12h6M9 15.5h6M9 9h2.5"/>',
    note:    '<path d="M5 3.5h14v17H5z"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>',
    gear:    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.2"/>',
    play:    '<path d="M8 5.2v13.6L19 12z"/>',
    dl:      '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 20h14"/>',
    user:    '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-4 4.4-6 8-6s6.6 2 8 6"/>',
    users:   '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5"/><path d="M15.5 5.2a3.3 3.3 0 0 1 0 6.6M17.5 14.6c2 .6 3.3 2.2 4 4.9"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.8-.8 1.8-1.7 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6h2.1a4 4 0 0 0 4-4C20.5 6.4 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11" r=".9" fill="currentColor"/><circle cx="10" cy="7.3" r=".9" fill="currentColor"/><circle cx="14.6" cy="7.3" r=".9" fill="currentColor"/>',
    landscape:'<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 16.5l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.6"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
    flask:   '<path d="M9.5 3.5h5M10.5 3.5v6L5 19.2a1 1 0 0 0 .9 1.3h12.2a1 1 0 0 0 .9-1.3L13.5 9.5v-6"/><path d="M7.6 15h8.8"/>',
    gamepad: '<path d="M7 7.5h10a4.5 4.5 0 0 1 4.3 5.8l-1 3.4a2.5 2.5 0 0 1-4.3.9L14.4 16H9.6L8 17.6a2.5 2.5 0 0 1-4.3-.9l-1-3.4A4.5 4.5 0 0 1 7 7.5z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".8" fill="currentColor"/><circle cx="17.3" cy="13" r=".8" fill="currentColor"/>',
    coffee:  '<path d="M4.5 9h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 10.5h1.3a2.5 2.5 0 0 1 0 5h-1.6M8 3.5c-.6 1 .6 1.6 0 2.6M12 3.5c-.6 1 .6 1.6 0 2.6"/>',
    link:    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bell:    '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    belloff: '<path d="M8.4 5.6A6 6 0 0 1 18 11v4M6 11v5.5l-1.5 2h12"/><path d="M10 20.5a2 2 0 0 0 4 0M3.5 3.5l17 17"/>',
    camera:  '<path d="M3 8h4l1.8-2.5h6.4L17 8h4v11.5H3z"/><circle cx="12" cy="13.5" r="3.5"/>',
    clip:    '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 13.5h6M9 17h3.5"/>',
    bulb:    '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    boom:    '<path d="M12 2.5l1.8 5.2 5.4-2.1-2.6 5.1 4.9 2.6-5.5 1 1.3 5.4-5.3-3.2L8.6 21l.4-5.5-5.5-.3 4.3-3.6L4 7.1l5.3 1z"/>',
    chart:   '<path d="M4 20.5h16"/><rect x="5.5" y="12" width="3" height="6" rx=".6"/><rect x="10.5" y="7" width="3" height="11" rx=".6"/><rect x="15.5" y="9.5" width="3" height="8.5" rx=".6"/>',
    news:    '<path d="M4 5h13v14.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19.5z"/><path d="M17 9h3v10.5a1.5 1.5 0 0 1-3 0M7 8.5h7M7 12h7M7 15.5h4.5"/>',
    brain:   '<path d="M12 5v15M12 5a3 3 0 0 0-5.6-1.2A3 3 0 0 0 4 8.3a3.4 3.4 0 0 0 .5 6A3.2 3.2 0 0 0 8 19.6 3 3 0 0 0 12 20M12 5a3 3 0 0 1 5.6-1.2A3 3 0 0 1 20 8.3a3.4 3.4 0 0 1-.5 6 3.2 3.2 0 0 1-3.5 5.3A3 3 0 0 1 12 20"/>',
    globe:   '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>',
    gem:     '<path d="M7 4h10l4 5.5L12 20.5 3 9.5z"/><path d="M3 9.5h18M9.5 4 8 9.5l4 11 4-11L14.5 4"/>',
    trophy:  '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 3.8M16.5 6h3a3 3 0 0 1-3 3.8M12 13.5v4M8.5 20.5h7M9.5 17.5h5"/>',
    fire:    '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.6-2.6-5.4-3.6-9-1.5 1.8-1.7 3.6-1.9 5-1-1-1.6-2.5-1.6-4.4-3 2-6 5.3-6 8.4A6.5 6.5 0 0 0 12 21z"/>',
    puzzle:  '<path d="M4 7h4a2.2 2.2 0 1 1 4 0h4v4a2.2 2.2 0 1 1 0 4v4h-4a2.2 2.2 0 1 0-4 0H4v-4a2.2 2.2 0 1 0 0-4z"/>',
    rocket:  '<path d="M12.5 15.5 8.5 11.5C10 6.5 14 3.5 20.5 3.5c0 6.5-3 10.5-8 12z"/><path d="M8.5 11.5 5 11l3-3.5h3.5M12.5 15.5l.5 3.5 3.5-3v-3.5M5.5 18.5c.5-1.8 1.5-2.8 3-3"/><circle cx="15.5" cy="8.5" r="1.4"/>',
    feather: '<path d="M20 4c-7 0-12 5-12 11v5"/><path d="M8 15c5 0 9.5-3 12-11M8 15h6M10 11.5h6.5"/>',
    wrench:  '<path d="M14.5 6.5a4 4 0 0 0 4.9 5.3L12 19.2a2 2 0 0 1-2.8 0l-.4-.4a2 2 0 0 1 0-2.8l7.4-7.4"/><path d="M14.5 6.5 17 4a4 4 0 0 1 3.3 4.4L17.8 11"/>',
    scale:   '<path d="M12 4v16M7 20h10M5 7h14M12 4.5l-.01 0"/><path d="M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z"/>',
    pick:    '<g transform="scale(1.5)" filter="url(#ico-pick-bw)" stroke="none" shape-rendering="crispEdges"><path fill="#5c3a1c" d="M9 7h1v1h-1zM8 8h1v1h-1zM7 9h1v1h-1zM6 10h1v1h-1zM5 11h1v1h-1zM4 12h1v1h-1zM3 13h1v1h-1zM2 14h1v1h-1zM1 15h1v1h-1z"/><path fill="#9b6a3a" d="M9 6h1v1h-1zM8 7h1v1h-1zM7 8h1v1h-1zM6 9h1v1h-1zM5 10h1v1h-1zM4 11h1v1h-1zM3 12h1v1h-1zM2 13h1v1h-1zM1 14h1v1h-1zM0 15h1v1h-1z"/><path fill="currentColor" d="M4 1h1v1h-1zM5 1h1v1h-1zM6 1h1v1h-1zM7 1h1v1h-1zM8 1h1v1h-1zM9 1h1v1h-1zM2 2h1v1h-1zM3 2h1v1h-1zM4 2h1v1h-1zM5 2h1v1h-1zM6 2h1v1h-1zM7 2h1v1h-1zM8 2h1v1h-1zM9 2h1v1h-1zM10 2h1v1h-1zM1 3h1v1h-1zM2 3h1v1h-1zM3 3h1v1h-1zM8 3h1v1h-1zM9 3h1v1h-1zM10 3h1v1h-1zM11 3h1v1h-1zM0 4h1v1h-1zM1 4h1v1h-1zM9 4h1v1h-1zM10 4h1v1h-1zM11 4h1v1h-1zM12 4h1v1h-1zM10 5h1v1h-1zM11 5h1v1h-1zM12 5h1v1h-1zM13 5h1v1h-1zM11 6h1v1h-1zM12 6h1v1h-1zM13 6h1v1h-1zM14 6h1v1h-1zM12 7h1v1h-1zM13 7h1v1h-1zM14 7h1v1h-1zM13 8h1v1h-1zM14 8h1v1h-1zM13 9h1v1h-1zM14 9h1v1h-1zM13 10h1v1h-1zM14 10h1v1h-1zM13 11h1v1h-1zM14 11h1v1h-1zM12 12h1v1h-1zM13 12h1v1h-1zM12 13h1v1h-1zM13 13h1v1h-1zM11 14h1v1h-1zM12 14h1v1h-1zM11 15h1v1h-1z"/></g>',
    heart:   '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
    pencil:  '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
    caret:   '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
    arrow:   '<path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5"/>',
    list:    '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    grid:    '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    bolt:    '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    home:    '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"/>',
    farm:    '<path d="M12 21V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 13c3 0 5-2 5-5-3 0-5 2-5 5zM12 9c-1.6 0-3-1.4-3-3.5 1.6 0 3 1.4 3 3.5zM12 9c1.6 0 3-1.4 3-3.5-1.6 0-3 1.4-3 3.5zM5 21h14"/>',
    castle:  '<path d="M4 21V9h3V6h2.5v3h5V6H17v3h3v12zM10 21v-4.5a2 2 0 0 1 4 0V21"/><path d="M4 9V6.5M20 9V6.5"/>',
    city:    '<path d="M3.5 21h17M5 21V9h5v12M10 21V4h6v17M16 21v-8h3.5v8"/><path d="M12.5 7.5h1M12.5 11h1M12.5 14.5h1M7 12.5h1M7 16h1"/>',
    torii:   '<path d="M3 6c3 .8 15 .8 18 0M4.5 9.5h15M7 6.6V21M17 6.6V21M12 6.9v2.6"/>',
    bridge:  '<path d="M2.5 16.5h19M4 16.5V9M20 16.5V9M2.5 9c3.5 0 6 3 9.5 3s6-3 9.5-3M8 16.5v-3.6M12 16.5V12M16 16.5v-3.6M2.5 20h19"/>',
    tower:   '<path d="M12 2.5v3M10 5.5h4l1.5 15h-7z"/><path d="M8.5 11.5h7M7.5 20.5h9M10.5 15.5h3"/>',
    ship:    '<path d="M3.5 15h17l-2.5 4.5H6z"/><path d="M6 15V10h12v5M9 10V6h6v4M12 6V3.5"/>',
    hole:    '<ellipse cx="12" cy="15" rx="8.5" ry="3.5"/><path d="M6.5 15c1.4.9 3.4 1.4 5.5 1.4s4.1-.5 5.5-1.4"/><path d="M12 4v6M9 7.5 12 10.5l3-3"/>',
    tree:    '<path d="M12 21v-5M7 16h10l-2.5-3.5H16L12 3 8 12.5h1.5z"/>',
    coaster: '<path d="M2.5 18c2.5 0 3.5-9 7-9s4 7 7 7c2 0 3-3 5-3M2.5 21h19M6 21v-4.5M12 21v-6.5M18 21v-5"/>',
    arena:   '<ellipse cx="12" cy="10" rx="8.5" ry="3.5"/><path d="M3.5 10v6c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5v-6M8 13.3v6M16 13.3v6M12 13.5v6"/>',
    train:   '<rect x="5.5" y="3.5" width="13" height="13" rx="3"/><path d="M5.5 10.5h13M9 13.5h.01M15 13.5h.01M8 16.5 6 20.5M16 16.5l2 4"/>',
    star:    '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    stetho:  '<path d="M12 2.8l7.5 3V12c0 4.6-3.1 7.8-7.5 9.3-4.4-1.5-7.5-4.7-7.5-9.3V5.8z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    gift:    '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5"/><path d="M12 8c-1-2.8-3.2-4.2-4.6-3.2-1.3 1 0 3.2 4.6 3.2zM12 8c1-2.8 3.2-4.2 4.6-3.2 1.3 1 0 3.2-4.6 3.2z"/>',
    crane:   '<path d="M7 21V4M3.5 21h7M7 4h13M7 4l4 4M11 4v3M17 4v4"/><path d="M15.5 8h3v3h-3zM7 9l3 0M7 14h3"/>',
    ruler:   '<path d="M4 20V4l16 16z"/><path d="M8 12v8M4 8h2M4 12h2M4 16h2M8 16l0 0"/><path d="M8 12.5l3.5 3.5H8z"/>',
    lock:    '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"/>'
  };

  // эмодзи и символы → иконка
  const MAP = {
    "🗑": "trash", "⚠": "warn", "⛔": "stop", "✅": "okbox", "✓": "ok", "✔": "ok", "✗": "x", "✕": "x", "❌": "x",
    "📁": "folder", "📂": "folder", "📄": "doc", "📝": "note", "📜": "doc", "⚙": "gear",
    "🔄": "#i-refresh", "⟳": "#i-refresh", "↺": "#i-refresh", "↻": "#i-refresh",
    "▶": "play", "⬇": "dl", "📥": "#i-file-in", "📤": "#i-pack-out", "📦": "#i-boxes",
    "🧑": "user", "👤": "user", "👥": "users", "🎨": "palette", "🌄": "landscape", "🖼": "landscape",
    "🖥": "monitor", "🧪": "flask", "🎮": "gamepad", "☕": "coffee", "🔗": "link",
    "🔔": "bell", "🔕": "belloff", "📸": "camera", "📷": "camera", "📋": "clip", "💡": "bulb", "💥": "boom",
    "📊": "chart", "📰": "news", "🧠": "brain", "🌍": "globe", "🌐": "globe", "💎": "gem", "🏆": "trophy",
    "🔥": "fire", "🧩": "puzzle", "🚀": "rocket", "🪶": "feather", "🛠": "wrench", "🔧": "wrench", "⚖": "scale",
    "⛏": "pick", "♥": "heart", "❤": "heart", "✏": "pencil", "✎": "pencil", "▼": "caret", "▾": "caret",
    "☰": "list", "▦": "grid", "⚡": "bolt", "⭐": "star", "✨": "star", "🩺": "stetho", "🔍": "#i-search", "🔎": "#i-search",
    "🏠": "home", "🚜": "farm", "🏰": "castle", "🏙": "city", "⛩": "torii", "🌉": "bridge", "🗼": "tower",
    "🚢": "ship", "🕳": "hole", "🌳": "tree", "🎢": "coaster", "🏟": "arena", "🚉": "train", "🔀": "#i-swap",
    "🎁": "gift", "🏗": "crane", "📐": "ruler", "🔒": "lock", "🔐": "lock"
  };
  // цвет по смыслу
  const TONE = { warn: "warn", stop: "bad", x: "bad", trash: "bad", okbox: "good", ok: "good", heart: "bad", star: "accent" };

  // ---------- спрайт ----------
  (function sprite() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true"); svg.style.position = "absolute";
    svg.innerHTML = `<filter id="ico-pick-bw" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter>` +
      Object.keys(S).map(k => `<symbol id="ico-${k}" viewBox="0 0 24 24">${S[k]}</symbol>`).join("");
    document.body.insertBefore(svg, document.body.firstChild);
    const st = document.createElement("style");
    st.textContent = `
      .ic-emo{ width:1.1em; height:1.1em; display:inline-block; vertical-align:-0.18em; fill:none; stroke:currentColor;
        stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; overflow:visible; flex:none; }
      button .ic-emo, .tab .ic-emo, label .ic-emo { margin-right:.15em; }
      .ic-tone-warn{ color:var(--warn,#f5a524); } .ic-tone-bad{ color:var(--bad,#ef5350); }
      .ic-tone-good, .ic-tone-accent{ color:var(--accent); }
      .cm-icon .ic-emo, .splash-logo .ic-emo, .classic-logo .ic-emo, .w-logo .ic-emo, .launch-ic .ic-emo,
      .upd-icon .ic-emo, .beta-ic .ic-emo { width:1em; height:1em; vertical-align:0; stroke-width:1.5; }
      .cm-icon .ic-emo:not([class*="ic-tone"]), .w-logo .ic-emo, .launch-ic .ic-emo, .upd-icon .ic-emo, .beta-ic .ic-emo,
      .splash-logo .ic-emo, .classic-logo .ic-emo { color:var(--accent); }
      .logo .ic-emo{ margin-right:-.18em; }
      .classic-center{ gap:0 !important; }
      .classic-logo{ line-height:1 !important; margin-bottom:-.06em !important; }
      .classic-logo .ic-emo{ display:block; margin:0 auto; }
      .classic-title{ margin-top:0 !important; }
      .profile-caret .ic-emo, .arw .ic-emo { width:.9em; height:.9em; vertical-align:-0.1em; margin:0; }`;
    document.head.appendChild(st);

    // своя картинка кирки: ищем Pickaxelogo.png рядом с index.html, иначе остаётся пиксельная
    const tries = ["Pickaxelogo.png", "Assets/Pickaxelogo.png", "assets/Pickaxelogo.png", "Images/Pickaxelogo.png",
      "images/Pickaxelogo.png", "img/Pickaxelogo.png", "Styles/Pickaxelogo.png", "Logic/Pickaxelogo.png"];
    (function probe(i) {
      if (i >= tries.length) return;
      const img = new Image();
      img.onload = () => {
        const sym = svg.querySelector("#ico-pick");
        if (sym) sym.innerHTML = `<image href="${tries[i]}" x="0" y="0" width="24" height="24"
          preserveAspectRatio="xMidYMid meet" style="image-rendering:pixelated" filter="url(#ico-pick-bw)"/>`;
      };
      img.onerror = () => probe(i + 1);
      img.src = tries[i];
    })(0);
  })();

  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const RE = new RegExp("(" + keys.join("|") + ")\\uFE0F?", "g");

  // пользовательский и чужой текст — не трогаем
  const SKIP = "input, textarea, select, option, script, style, pre, code, [contenteditable], .no-ic," +
    " .mod-title, .mod-desc, #miTitle, #miDesc, .mi-desc, .mi-versions, #ivTitle, #ivDesc, .iv-desc," +
    " .sv-nm, .ver-name, .log-pre, .shot-name, .mt-nm";

  function makeIcon(ch) {
    const id = MAP[ch];
    const ref = id.charAt(0) === "#" ? id : "#ico-" + id;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ic-emo" + (TONE[id] ? " ic-tone-" + TONE[id] : ""));
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", ref);
    svg.appendChild(use);
    return svg;
  }

  function fixText(node) {
    const t = node.nodeValue;
    if (!t || !RE.test(t)) return;
    RE.lastIndex = 0;
    const p = node.parentNode;
    if (!p || (p.closest && p.closest(SKIP))) return;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = RE.exec(t))) {
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      frag.appendChild(makeIcon(m[1]));
      last = m.index + m[0].length;
      // пробел сразу после иконки съедаем — отступ даёт CSS
      if (t.charAt(last) === " " && p.closest("button, .tab, label, h1, h2, h3, h4, .set-card-title, .pm-section-title")) last++;
    }
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    p.replaceChild(frag, node);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1 || (root.matches && root.matches(SKIP))) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = [];
    while (tw.nextNode()) list.push(tw.currentNode);
    list.forEach(fixText);
  }

  // всё, что появляется позже (окна, списки, тосты) — тоже
  let queue = new Set(), raf = 0;
  const flush = () => { raf = 0; const q = queue; queue = new Set(); q.forEach(walk); };
  const mo = new MutationObserver((muts) => {
    muts.forEach(m => {
      if (m.type === "characterData") queue.add(m.target);
      else m.addedNodes.forEach(n => queue.add(n));
    });
    if (!raf) raf = requestAnimationFrame(flush);
  });

  function start() {
    walk(document.body);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  return { refresh: () => walk(document.body), MAP };
})();
