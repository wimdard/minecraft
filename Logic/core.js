const App = {
  state: null,
  SYS: { ram: 8192, cores: 4, cpu: "Неизвестно", os: "—", arch: "" },
  VERSIONS: [],
};

const TYPES = [
  { id:"play",     nm:"Играть",  ic:"▶" },
  { id:"version",  nm:"Версия",  ic:"🎮" },
  { id:"username", nm:"Ник",     ic:"🧑" },
  { id:"memory",   nm:"Память",  ic:"🧠" },
  { id:"news",     nm:"Новости", ic:"📰", beta:true },
  { id:"friends",  nm:"Друзья",  ic:"👥", beta:true },
  { id:"stats",    nm:"Статы",   ic:"📊" },
  { id:"link",     nm:"Ссылка",  ic:"🔗" },
  { id:"note",     nm:"Заметка", ic:"📝" },
  { id:"server",   nm:"Сервер",  ic:"🌍" },

];

const ICONS = ["▶","🧑","🧠","📰","👥","📊","🔗","📝","🎮","⚙️","⭐","🔥","🧩","🌍","💎","🏆"];
const LOADERS = [
  { id:"vanilla",  nm:"Vanilla" },
  { id:"fabric",   nm:"Fabric" },
  { id:"forge",    nm:"Forge" },
  { id:"quilt",    nm:"Quilt" },
  { id:"neoforge", nm:"NeoForge" },
];
const FALLBACK_VERSIONS = ["1.21.1","1.21","1.20.6","1.20.4","1.20.1","1.19.4","1.19.2","1.18.2","1.16.5","1.12.2"];

const CELL = 40;
const snap = (v) => Math.round(v / CELL) * CELL;

const api = () => (window.pywebview && window.pywebview.api) ? window.pywebview.api : null;

const hasProfile = () => App.state && App.state.activeProfile && App.state.profiles[App.state.activeProfile];
const activeProfile = () => App.state.profiles[App.state.activeProfile];
const persist = () => { if (api()) api().save_state(App.state); };

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const loaderName = (id) => (LOADERS.find(l => l.id === id) || {}).nm || id;
const maxMem = () => App.SYS.ram;
const isModded = (loader) => loader && loader !== "vanilla";

function memAssessment(mb, loader) {
  if (isModded(loader)) {
    if (mb < 3072) return { level:"bad",  text:"Мало для модов" };
    if (mb < 4096) return { level:"warn", text:"Впритык для модов" };
    if (mb < 6144) return { level:"ok",   text:"Норма для модов" };
    return { level:"ok", text:"С запасом" };
  } else {
    if (mb < 2048) return { level:"bad",  text:"Мало" };
    if (mb < 3072) return { level:"warn", text:"Впритык" };
    return { level:"ok", text:"Норма" };
  }
}

function ramLevel(mb) { if (mb < 4096) return "bad"; if (mb < 8192) return "warn"; return "ok"; }
function coreLevel(n) { if (n < 2) return "bad"; if (n < 4) return "warn"; return "ok"; }

function versionOptions() {
  const list = App.VERSIONS.length ? App.VERSIONS : FALLBACK_VERSIONS.map(v => ({ id:v, type:"release" }));
  return list.map(v => ({ id:v.id, label:v.id, tag: v.type === "snapshot" ? "snapshot" : "" }));
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("page-" + tab.dataset.tab).classList.add("active");
    document.body.classList.toggle("tab-home", tab.dataset.tab === "home");
    if (tab.dataset.tab === "mods") Mods.onOpen();
    if (tab.dataset.tab === "ideas") Ideas.onOpen();
    if (tab.dataset.tab === "ach") Achievements.onOpen();
    if (tab.dataset.tab === "updates") Updates.onOpen();



  });
});
