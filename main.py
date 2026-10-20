import webview
import json
import os
import sys
import platform
import subprocess
import threading
import base64
import mimetypes
import shutil
import re
import urllib.request
import urllib.parse
import uuid
import minecraft_launcher_lib
import ssl

try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())
except Exception:
    pass

## ▶ DEV=True — следим за файлами и предлагаем перезагрузку. Перед упаковкой поставь False!
DEV = False

MODRINTH_API = "https://api.modrinth.com/v2"
MOJANG_MANIFEST = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
NEOFORGE_MAVEN = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml"
USER_AGENT = "MCLauncher/1.0 (personal launcher)"
APP_VERSION = "0.1.2"
GITHUB_REPO = "wimdard/minecraft"
GITHUB_RAW = "https://raw.githubusercontent.com/wimdard/minecraft/main"

_window = None

def resource_path(rel):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.abspath(os.path.join(base, rel))

def project_dir():
    return os.path.dirname(os.path.abspath(__file__))

def data_dir():
    if sys.platform == "win32":
        base = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "MCLauncher")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support", "MCLauncher")
    else:
        base = os.path.join(os.path.expanduser("~"), ".mc_launcher")
    os.makedirs(base, exist_ok=True)
    return base

CONFIG = os.path.join(data_dir(), "profiles.json")

def profile_game_dir(profile_id):
    """Вариант A: у каждого профиля своя изолированная игровая директория."""
    pid = profile_id or "default"
    d = os.path.join(data_dir(), "profiles", pid, "minecraft")
    os.makedirs(d, exist_ok=True)
    return d

def _active_vl(profile_id):
    """Активная версия+загрузчик профиля из profiles.json (для изоляции модов)."""
    s = _profile_settings(profile_id)
    return (s.get("version") or ""), (s.get("loader") or "vanilla")


def _profile_settings(profile_id):
    """settings профиля из profiles.json (пусто, если не нашли)."""
    try:
        with open(CONFIG, "r", encoding="utf-8") as f:
            st = json.load(f)
        p = (st.get("profiles") or {}).get(profile_id) or {}
        return p.get("settings") or {}
    except Exception:
        return {}


# ---------- наборы модов внутри одной версии ----------
MODSET_DEFAULT = "Основной"

def _modset_key(version, loader):
    key = (version or "any") + "__" + (loader or "vanilla")
    return re.sub(r"[^A-Za-z0-9._-]", "_", key)

def _modset_safe(name):
    return re.sub(r'[\\/:*?"<>|~]+', "_", (name or "").strip())[:40].strip()

def _modsets_file(profile_id):
    return os.path.join(profile_game_dir(profile_id), ".mods", "sets.json")

def _modsets_read(profile_id):
    try:
        with open(_modsets_file(profile_id), "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}

def _modsets_write(profile_id, data):
    p = _modsets_file(profile_id)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def active_modset(profile_id, version, loader):
    return _modsets_read(profile_id).get(_modset_key(version, loader)) or MODSET_DEFAULT


def mods_store_dir(profile_id, version, loader, modset=None):
    """Папка-хранилище модов для версии+загрузчика (и активного набора модов)."""
    key = _modset_key(version, loader)
    name = modset if modset is not None else active_modset(profile_id, version, loader)
    if name and name != MODSET_DEFAULT:
        key = key + "~" + _modset_safe(name)
    d = os.path.join(profile_game_dir(profile_id), ".mods", key)
    os.makedirs(d, exist_ok=True)
    return d


def _migrate_flat_mods(profile_id):
    """Разовый перенос старых модов из плоской mods/ в хранилище активной версии."""
    base = os.path.join(profile_game_dir(profile_id), ".mods")
    os.makedirs(base, exist_ok=True)
    marker = os.path.join(base, ".migrated")
    if os.path.exists(marker):
        return
    ver, ldr = _active_vl(profile_id)
    if not ver:
        return
    flat = os.path.join(profile_game_dir(profile_id), "mods")
    try:
        jars = [f for f in os.listdir(flat) if f.lower().endswith(".jar")]
    except Exception:
        jars = []
    store = mods_store_dir(profile_id, ver, ldr)
    for f in jars:
        try:
            shutil.move(os.path.join(flat, f), os.path.join(store, f))
        except Exception:
            pass
    try:
        open(marker, "w").close()
    except Exception:
        pass


def content_dir(profile_id, ptype, version=None, loader=None):
    if ptype == "mod":
        if not version:
            version, loader = _active_vl(profile_id)
        if version:
            _migrate_flat_mods(profile_id)
            return mods_store_dir(profile_id, version, loader)
        d = os.path.join(profile_game_dir(profile_id), "mods")
        os.makedirs(d, exist_ok=True)
        return d
    folder = {"resourcepack": "resourcepacks", "shader": "shaderpacks"}.get(ptype, "mods")
    d = os.path.join(profile_game_dir(profile_id), folder)
    os.makedirs(d, exist_ok=True)
    return d

def total_ram_mb():
    try:
        if sys.platform == "win32":
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return int(stat.ullTotalPhys / (1024 * 1024))
        else:
            return int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / (1024 * 1024))
    except Exception:
        return 8192

def cpu_name():
    try:
        if sys.platform == "darwin":
            out = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], timeout=5)
            return out.decode("utf-8", "ignore").strip()
        elif sys.platform == "win32":
            return os.environ.get("PROCESSOR_IDENTIFIER", platform.processor() or "Неизвестно")
        else:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if "model name" in line:
                        return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return platform.processor() or platform.machine() or "Неизвестно"

def os_label():
    try:
        if sys.platform == "darwin":
            return "macOS " + platform.mac_ver()[0]
        elif sys.platform == "win32":
            return "Windows " + platform.release()
        else:
            return platform.system() + " " + platform.release()
    except Exception:
        return platform.system()

def http_get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except ssl.SSLError:
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            return json.loads(r.read().decode("utf-8"))

def http_post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))

def http_download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(65536)
            if not chunk:
                break
            f.write(chunk)

def empty_state():
    return {"activeProfile": None, "profiles": {}}

FALLBACK_VERSIONS = ["1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2"]

def _open_path(path):
    if sys.platform == "darwin":
        subprocess.Popen(["open", path])
    elif sys.platform == "win32":
        os.startfile(path)  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", path])



class Api:

    
    def pick_video(self):
        try:
            result = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False,
                file_types=("Видео (*.mp4;*.webm;*.mov)",))
            if not result:
                return {"ok": False}
            src = result[0]
            dest_dir = os.path.join(data_dir(), "custom_bg")
            os.makedirs(dest_dir, exist_ok=True)
            ext = os.path.splitext(src)[1] or ".mp4"
            name = "bg_" + uuid.uuid4().hex[:8] + ext
            dest = os.path.join(dest_dir, name)
            shutil.copy2(src, dest)
            return {"ok": True, "path": dest, "url": "file://" + dest}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def minimize_window(self):
        try:
            if _window:
                _window.minimize()
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def app_version(self):
        return APP_VERSION

    def check_update(self):
        try:
            data = http_get_json(f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest")
        except Exception as e:
            return {"ok": False, "error": str(e)}
        tag = (data.get("tag_name") or "").lstrip("v")
        zip_url = ""
        for a in data.get("assets", []):
            if a.get("name", "").endswith(".zip"):
                zip_url = a.get("browser_download_url", "")
                break
        return {"ok": True, "current": APP_VERSION, "latest": tag,
                "hasUpdate": self._version_gt(tag, APP_VERSION),
                "notes": data.get("body", ""), "url": zip_url,
                "page": data.get("html_url", "")}
    def open_url(self, url):
        try:
            if url:
                _open_path(url)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_update_page(self, url):
        try:
            _open_path(url)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}


    def _version_gt(self, a, b):
        def parts(v): return [int(x) for x in re.findall(r"\d+", v)]
        pa, pb = parts(a), parts(b)
        return pa > pb

    def apply_update(self):
        threading.Thread(target=self._update_worker, daemon=True).start()
        return {"ok": True}

    def _update_worker(self):
        try:
            data = http_get_json(f"{GITHUB_RAW}/version.json")
            files = data.get("files", [])
            base = project_dir()
            total = len(files)
            for i, rel in enumerate(files):
                self._progress(f"Обновление: {rel}", i, total)
                url = f"{GITHUB_RAW}/{rel}"
                dest = os.path.join(base, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True) if os.path.dirname(rel) else None
                tmp = dest + ".new"
                http_download(url, tmp)
                os.replace(tmp, dest)
            self._progress("__done__", total, total)
            if _window:
                _window.evaluate_js("window.onUpdateDone && window.onUpdateDone()")
        except Exception as e:
            self._err(e)

    def _needs_intel_java(self, version):
        """True только для LWJGL 2 (<=1.12) на Apple Silicon — их запускаем через Rosetta."""
        if sys.platform != "darwin" or platform.machine() != "arm64":
            return False
        m = re.search(r"1\.(\d+)(?:\.(\d+))?", version)
        if not m:
            return False
        return int(m.group(1)) <= 12

    def install_java(self, version):
        """Скачивает нужную Java и запускает поток (для кнопки 'Скачать и запустить')."""
        major = self._required_java(version)
        threading.Thread(target=self._install_java_worker, args=(major,), daemon=True).start()
        return {"ok": True, "major": major}

    def _install_java_worker(self, major):
        try:
            path = self._ensure_java(major)
            self._progress("__done__", 1, 1)
            if _window:
                _window.evaluate_js(f"window.onJavaReady && window.onJavaReady({json.dumps(path)})")
        except Exception as e:
            self._err(e)

    def _ensure_java(self, major):
        """Возвращает путь к java нужной мажорной версии. Качает Temurin, если нет."""
        # 1) системная java подходит?
        try:
            sysjava = self._java_path()
            out = subprocess.run([sysjava, "-version"], capture_output=True, text=True)
            text = (out.stderr or "") + (out.stdout or "")
            m = re.search(r'version "(\d+)(?:\.(\d+))?', text)
            if m:
                cur = int(m.group(1))
                if cur == 1 and m.group(2):
                    cur = int(m.group(2))
                if cur == major:
                    return sysjava
        except Exception:
            pass
        # 2) уже скачанная?
        base = os.path.join(data_dir(), "java", str(major))
        os.makedirs(base, exist_ok=True)
        def _find():
            exe = "java.exe" if sys.platform == "win32" else "java"
            for root, _, files in os.walk(base):
                if os.path.basename(root) == "bin" and exe in files:
                    return os.path.join(root, exe)
            return None
        found = _find()
        if found:
            return found
        # 3) скачать Temurin под текущую ОС/арч
        self._progress(f"Скачивание Java {major}…", 0, 1)
        if sys.platform == "darwin":
            os_name = "mac"
            arch = "aarch64" if (platform.machine() == "arm64" and major >= 11) else "x64"
            ext = "tar.gz"
        elif sys.platform == "win32":
            os_name = "windows"; arch = "x64"; ext = "zip"
        else:
            os_name = "linux"; arch = "x64"; ext = "tar.gz"
        url = f"https://api.adoptium.net/v3/binary/latest/{major}/ga/{os_name}/{arch}/jdk/hotspot/normal/eclipse?project=jdk"
        archive = os.path.join(base, f"jdk.{ext}")
        http_download(url, archive)
        self._progress(f"Распаковка Java {major}…", 0, 1)
        if ext == "zip":
            import zipfile
            with zipfile.ZipFile(archive) as z:
                z.extractall(base)
        else:
            import tarfile
            with tarfile.open(archive, "r:gz") as t:
                t.extractall(base)
        try:
            os.remove(archive)
        except Exception:
            pass
        found = _find()
        if not found:
            raise RuntimeError(f"Не удалось установить Java {major}")
        try:
            os.chmod(found, 0o755)
        except Exception:
            pass
        return found

    def _intel_java8_path(self):
        """Скачивает portable Temurin 8 x64 (Rosetta) в data_dir и возвращает путь к bin/java."""
        base = os.path.join(data_dir(), "intel_jdk8")
        os.makedirs(base, exist_ok=True)
        marker = os.path.join(base, ".done")
        # найти уже распакованный java
        def _find_java():
            for root, _, files in os.walk(base):
                if os.path.basename(root) == "bin" and "java" in files:
                    return os.path.join(root, "java")
            return None
        if os.path.exists(marker):
            j = _find_java()
            if j:
                return j
        self._progress("Скачивание Intel Java 8 для старых версий…", 0, 1)
        api = "https://api.adoptium.net/v3/binary/latest/8/ga/mac/x64/jdk/hotspot/normal/eclipse?project=jdk"
        tgz = os.path.join(base, "temurin8-x64.tar.gz")
        http_download(api, tgz)
        self._progress("Распаковка Java…", 0, 1)
        import tarfile
        with tarfile.open(tgz, "r:gz") as t:
            t.extractall(base)
        try:
            os.remove(tgz)
        except Exception:
            pass
        j = _find_java()
        if not j:
            raise RuntimeError("Не удалось распаковать Intel Java 8")
        try:
            os.chmod(j, 0o755)
        except Exception:
            pass
        open(marker, "w").close()
        return j

    def _lwjgl_3xx_dir(self, version="3.3.3"):
        """LWJGL 3.3.3: обычные jar (classpath) + arm64-нативы (.dylib).
        Возвращает (classpath_jars: list[str], natives_dir: str)."""
        base = os.path.join(data_dir(), "lwjgl_" + version)
        nat = os.path.join(base, "natives")
        os.makedirs(nat, exist_ok=True)
        libs = [
            "lwjgl", "lwjgl-glfw", "lwjgl-openal", "lwjgl-opengl",
            "lwjgl-stb", "lwjgl-tinyfd", "lwjgl-jemalloc",
        ]
        jars = [os.path.join(base, lib + "-" + version + ".jar") for lib in libs]
        marker = os.path.join(base, ".done_" + version)
        if os.path.exists(marker):
            return jars, nat
        import zipfile
        errors = []
        for lib in libs:
            jar = os.path.join(base, lib + "-" + version + ".jar")
            try:
                if not os.path.exists(jar):
                    http_download(
                        f"https://repo1.maven.org/maven2/org/lwjgl/{lib}/{version}/{lib}-{version}.jar",
                        jar,
                    )
            except Exception as e:
                errors.append(f"{lib} jar: {e}")
            natjar = os.path.join(base, lib + "-natives.jar")
            try:
                http_download(
                    f"https://repo1.maven.org/maven2/org/lwjgl/{lib}/{version}/{lib}-{version}-natives-macos-arm64.jar",
                    natjar,
                )
                got = False
                with zipfile.ZipFile(natjar) as z:
                    for name in z.namelist():
                        if name.endswith(".dylib"):
                            with z.open(name) as src, open(os.path.join(nat, os.path.basename(name)), "wb") as dst:
                                dst.write(src.read())
                            got = True
                os.remove(natjar)
                if not got:
                    errors.append(f"{lib}: в jar нет .dylib")
            except Exception as e:
                errors.append(f"{lib} natives: {e}")
        dylibs = [f for f in os.listdir(nat) if f.endswith(".dylib")]
        if errors or not dylibs:
            raise RuntimeError(
                "Не удалось подготовить LWJGL для Apple Silicon:\n" + "\n".join(errors[:6])
            )
        open(marker, "w").close()
        return jars, nat

    def _needs_lwjgl_fix(self, version):
        """Возвращает: 'swap' (подменить LWJGL 3.x на 3.3.3) или None."""
        if sys.platform != "darwin" or platform.machine() != "arm64":
            return None
        m = re.search(r"1\.(\d+)(?:\.(\d+))?", version)
        if not m:
            return None
        minor = int(m.group(1))
        patch = int(m.group(2)) if m.group(2) else 0
        if minor > 19 or (minor == 19 and patch >= 3):
            return None
        if minor <= 12:
            return None  # LWJGL 2.x — запускаем через Intel Java (Rosetta), не подменяем
        return "swap"


    def _swap_lwjgl(self, cmd, lwjgl_jars, natives_dir):
        """Убирает старые org/lwjgl jar-ы из -cp, добавляет 3.3.3,
        и правит -Djava.library.path на arm64-нативы (последний -D побеждает)."""
        sep = ";" if sys.platform == "win32" else ":"
        for i, arg in enumerate(cmd):
            if arg in ("-cp", "-classpath") and i + 1 < len(cmd):
                entries = cmd[i + 1].split(sep)
                kept = [e for e in entries if "/org/lwjgl/" not in e.replace("\\", "/")]
                cmd[i + 1] = sep.join(lwjgl_jars + kept)
                break
        replaced = False
        for i, arg in enumerate(cmd):
            if arg.startswith("-Djava.library.path="):
                cmd[i] = "-Djava.library.path=" + natives_dir
                replaced = True
        if not replaced:
            for i, arg in enumerate(cmd):
                if arg in ("-cp", "-classpath"):
                    cmd.insert(i, "-Djava.library.path=" + natives_dir)
                    break
        return cmd

    def read_clipboard(self):
        try:
            if sys.platform == "darwin":
                out = subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=3)
                return {"ok": True, "text": out.stdout.strip()}
            elif sys.platform == "win32":
                out = subprocess.run(["powershell", "-command", "Get-Clipboard"], capture_output=True, text=True, timeout=3)
                return {"ok": True, "text": out.stdout.strip()}
            else:
                out = subprocess.run(["xclip", "-selection", "clipboard", "-o"], capture_output=True, text=True, timeout=3)
                return {"ok": True, "text": out.stdout.strip()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def pick_images(self):
        try:
            result = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True,
                file_types=("Изображения (*.png;*.jpg;*.jpeg;*.gif;*.webp)",))
            if not result:
                return {"ok": False}
            urls = []
            for path in result:
                mime = mimetypes.guess_type(path)[0] or "image/png"
                with open(path, "rb") as f:
                    data = base64.b64encode(f.read()).decode("ascii")
                urls.append(f"data:{mime};base64,{data}")
            return {"ok": True, "urls": urls}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ---------- версии (по профилю) ----------
    def list_versions(self, profile_id):
        vdir = os.path.join(profile_game_dir(profile_id), "versions")
        out = []
        if os.path.isdir(vdir):
            for name in sorted(os.listdir(vdir)):
                p = os.path.join(vdir, name)
                if not os.path.isdir(p):
                    continue
                size = 0
                for root, _, files in os.walk(p):
                    for f in files:
                        try:
                            size += os.path.getsize(os.path.join(root, f))
                        except Exception:
                            pass
                out.append({"id": name, "mb": round(size / (1024 * 1024), 1)})
        return {"versions": out}

    def delete_version(self, profile_id, version_id):
        vdir = os.path.join(profile_game_dir(profile_id), "versions")
        path = os.path.normpath(os.path.join(vdir, version_id))
        if not path.startswith(os.path.normpath(vdir)):
            return {"ok": False, "error": "Недопустимый путь"}
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
            return {"ok": True}
        return {"ok": False, "error": "Версия не найдена"}

    def open_game_folder(self, profile_id):
        try:
            _open_path(profile_game_dir(profile_id))
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_version_folder(self, profile_id, version_id):
        vdir = os.path.join(profile_game_dir(profile_id), "versions")
        path = os.path.normpath(os.path.join(vdir, version_id))
        if not path.startswith(os.path.normpath(vdir) + os.sep):
            return {"ok": False, "error": "Недопустимый путь"}
        if not os.path.isdir(path):
            return {"ok": False, "error": "Версия не найдена"}
        try:
            _open_path(path)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_mods_folder(self, profile_id, ptype="mod"):
        try:
            _open_path(content_dir(profile_id, ptype))
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def import_mod_file(self, profile_id, ptype="mod"):
        try:
            types = ("Моды (*.jar)",) if ptype == "mod" else ("Паки (*.zip;*.jar)",)
            result = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True, file_types=types)
            if not result:
                return {"ok": False}
            dest_dir = content_dir(profile_id, ptype)
            copied = []
            for src in result:
                name = os.path.basename(src)
                shutil.copy2(src, os.path.join(dest_dir, name))
                copied.append(name)
            return {"ok": True, "files": copied}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ---------- сервер: онлайн-статус ----------
    def _srv_lookup(self, host):
        """SRV-запись _minecraft._tcp.<host> -> (host, port) или None. Без сторонних библиотек."""
        import socket, struct, random
        resolvers = []
        try:
            with open("/etc/resolv.conf") as f:
                for ln in f:
                    p = ln.split()
                    if len(p) >= 2 and p[0] == "nameserver" and ":" not in p[1]:
                        resolvers.append(p[1])
        except Exception:
            pass
        resolvers += ["1.1.1.1", "8.8.8.8"]
        qname = "_minecraft._tcp." + host.strip(".")
        tid = random.randint(0, 0xFFFF)
        q = struct.pack(">HHHHHH", tid, 0x0100, 1, 0, 0, 0)
        for label in qname.split("."):
            lb = label.encode("idna")
            q += bytes([len(lb)]) + lb
        q += b"\x00" + struct.pack(">HH", 33, 1)

        def read_name(buf, off):
            labels, jumped, end = [], False, off
            for _ in range(64):
                ln = buf[off]
                if ln == 0:
                    off += 1; break
                if ln & 0xC0 == 0xC0:
                    if not jumped:
                        end = off + 2
                    off = ((ln & 0x3F) << 8) | buf[off + 1]; jumped = True; continue
                labels.append(buf[off + 1:off + 1 + ln].decode("ascii", "ignore")); off += 1 + ln
            return ".".join(labels), (end if jumped else off)

        for ns in resolvers[:3]:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.settimeout(1.5)
                s.sendto(q, (ns, 53))
                buf, _ = s.recvfrom(2048)
                s.close()
                rid, flags, qd, an = struct.unpack(">HHHH", buf[:8])
                if rid != tid or (flags & 0x000F) != 0 or an == 0:
                    if rid == tid:
                        return None  # ответ есть, но SRV нет — обычный адрес
                    continue
                off = 12
                for _ in range(qd):
                    _, off = read_name(buf, off); off += 4
                for _ in range(an):
                    _, off = read_name(buf, off)
                    rtype, _, _, rdlen = struct.unpack(">HHIH", buf[off:off + 10]); off += 10
                    if rtype == 33:
                        _, _, port = struct.unpack(">HHH", buf[off:off + 6])
                        target, _ = read_name(buf, off + 6)
                        if target:
                            return target, port
                    off += rdlen
                return None
            except Exception:
                continue
        return None

    def ping_server(self, address):
        """Server List Ping: online/offline, игроки, версия, MOTD, иконка, пинг в мс."""
        import socket, struct, time

        def _read_varint(sock):
            num = 0
            for i in range(5):
                b = sock.recv(1)
                if not b:
                    raise IOError("нет данных")
                b = b[0]
                num |= (b & 0x7F) << (7 * i)
                if not (b & 0x80):
                    break
            return num

        def _varint(value):
            out = b""
            while True:
                part = value & 0x7F
                value >>= 7
                if value:
                    out += struct.pack("B", part | 0x80)
                else:
                    out += struct.pack("B", part)
                    break
            return out

        def _motd(d):
            if isinstance(d, str):
                return d
            if isinstance(d, dict):
                return (d.get("text") or "") + "".join(_motd(x) for x in d.get("extra", []) or [])
            if isinstance(d, list):
                return "".join(_motd(x) for x in d)
            return ""

        address = (address or "").strip()
        host = address
        port = 25565
        explicit_port = False
        if ":" in address:
            host, p = address.rsplit(":", 1)
            try:
                port = int(p); explicit_port = True
            except ValueError:
                port = 25565
        conn_host = host
        if not explicit_port:
            try:
                srv = self._srv_lookup(host)
                if srv:
                    conn_host, port = srv
            except Exception:
                pass
        try:
            sock = socket.create_connection((conn_host, port), timeout=4)
            sock.settimeout(4)
            host_b = host.encode("utf-8")
            handshake = (b"\x00" + _varint(760)
                         + _varint(len(host_b)) + host_b
                         + struct.pack(">H", port) + _varint(1))
            sock.sendall(_varint(len(handshake)) + handshake)
            sock.sendall(_varint(1) + b"\x00")
            _read_varint(sock)
            _read_varint(sock)
            jlen = _read_varint(sock)
            data = b""
            while len(data) < jlen:
                chunk = sock.recv(jlen - len(data))
                if not chunk:
                    break
                data += chunk
            info = json.loads(data.decode("utf-8", "ignore"))
            latency = None
            try:
                t0 = time.time()
                sock.sendall(_varint(9) + b"\x01" + struct.pack(">q", int(t0 * 1000)))
                _read_varint(sock); _read_varint(sock); sock.recv(8)
                latency = int((time.time() - t0) * 1000)
            except Exception:
                pass
            sock.close()
            players = info.get("players", {}) or {}
            ver = info.get("version", {}) or {}
            motd = re.sub(r"§.", "", _motd(info.get("description", ""))).strip()
            icon = info.get("favicon") or ""
            if not icon.startswith("data:image/"):
                icon = ""
            names = [re.sub(r"§.", "", (p or {}).get("name") or "") for p in (players.get("sample") or [])]
            # некоторые серверы кладут в sample рекламу/пустые строки вместо ников
            names = [n for n in names if re.fullmatch(r"[A-Za-z0-9_]{2,16}", n)]
            return {"online": True, "now": players.get("online", 0), "max": players.get("max", 0),
                    "version": ver.get("name", ""), "motd": motd[:200], "icon": icon, "ping": latency,
                    "names": names}
        except Exception as e:
            return {"online": False, "error": str(e)}

    def notify(self, title, text):
        """Системное уведомление (macOS — Центр уведомлений)."""
        try:
            if sys.platform == "darwin":
                q = lambda s: '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'
                subprocess.Popen(["osascript", "-e",
                                  f"display notification {q(text)} with title {q(title)} sound name \"Glass\""])
                return {"ok": True}
            return {"ok": False, "error": "Только macOS"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ---------- скриншоты ----------
    def _shots_dir(self, profile_id):
        d = os.path.join(profile_game_dir(profile_id), "screenshots")
        os.makedirs(d, exist_ok=True)
        return d

    def _shot_path(self, profile_id, name):
        d = self._shots_dir(profile_id)
        p = os.path.normpath(os.path.join(d, os.path.basename(name or "")))
        return p if p.startswith(os.path.normpath(d)) and os.path.isfile(p) else None

    def list_screenshots(self, profile_id):
        try:
            d = self._shots_dir(profile_id)
            out = []
            for f in os.listdir(d):
                if f.lower().endswith((".png", ".jpg", ".jpeg")):
                    st = os.stat(os.path.join(d, f))
                    out.append({"name": f, "mtime": int(st.st_mtime), "size": st.st_size})
            out.sort(key=lambda x: x["mtime"], reverse=True)
            return {"ok": True, "shots": out}
        except Exception as e:
            return {"ok": False, "error": str(e), "shots": []}

    def get_screenshot(self, profile_id, name):
        p = self._shot_path(profile_id, name)
        if not p:
            return {"ok": False}
        mime = mimetypes.guess_type(p)[0] or "image/png"
        with open(p, "rb") as f:
            return {"ok": True, "data": "data:" + mime + ";base64," + base64.b64encode(f.read()).decode("ascii")}

    def open_screenshot(self, profile_id, name):
        p = self._shot_path(profile_id, name)
        if not p:
            return {"ok": False, "error": "Файл не найден"}
        _open_path(p)
        return {"ok": True}

    def delete_screenshot(self, profile_id, name):
        p = self._shot_path(profile_id, name)
        if not p:
            return {"ok": False, "error": "Файл не найден"}
        os.remove(p)
        return {"ok": True}

    def open_screenshots_folder(self, profile_id):
        _open_path(self._shots_dir(profile_id))
        return {"ok": True}

    # ---------- система ----------
    def get_system(self):
        return {"ram": total_ram_mb(), "cores": os.cpu_count() or 4, "cpu": cpu_name(), "os": os_label(), "arch": platform.machine()}

    def pick_image(self):
        try:
            result = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False,
                file_types=("Изображения (*.png;*.jpg;*.jpeg;*.gif;*.webp)",))
            if not result:
                return {"ok": False}
            path = result[0]
            mime = mimetypes.guess_type(path)[0] or "image/png"
            with open(path, "rb") as f:
                data = base64.b64encode(f.read()).decode("ascii")
            return {"ok": True, "url": f"data:{mime};base64,{data}"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def get_versions(self, include_snapshots=False):
        import time
        cache_path = os.path.join(data_dir(), "versions_cache.json")
        ttl = 6 * 3600
        now = time.time()

        def _filter(raw):
            out = []
            for v in raw:
                if v.get("type") == "release" or (include_snapshots and v.get("type") == "snapshot"):
                    out.append({"id": v["id"], "type": v["type"]})
            return out

        cached = None
        try:
            if os.path.exists(cache_path):
                with open(cache_path, "r", encoding="utf-8") as f:
                    cached = json.load(f)
        except Exception:
            cached = None

        if cached and cached.get("raw") and (now - cached.get("ts", 0) < ttl):
            return {"versions": _filter(cached["raw"]), "cached": True}

        try:
            data = http_get_json(MOJANG_MANIFEST)
            raw = data.get("versions", [])
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump({"ts": now, "raw": raw}, f)
            except Exception:
                pass
            return {"versions": _filter(raw)}
        except Exception as e:
            if cached and cached.get("raw"):
                return {"versions": _filter(cached["raw"]), "stale": True, "error": str(e)}
            return {"error": str(e), "versions": [{"id": v, "type": "release"} for v in FALLBACK_VERSIONS]}

        # ---------- состояние ----------
    def load_state(self):
        if not os.path.exists(CONFIG):
            state = empty_state()
            self._write(state)
            return state
        try:
            with open(CONFIG, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, ValueError, OSError):
            # файл побит — сохраняем копию и стартуем с чистого состояния
            try:
                broken = CONFIG + ".broken"
                shutil.copy2(CONFIG, broken)
            except Exception:
                pass
            state = empty_state()
            self._write(state)
            return state

    def save_state(self, state):
        self._write(state)
        return True

    def _write(self, state):
        if not hasattr(self, "_write_lock"):
            self._write_lock = threading.Lock()
        with self._write_lock:
            os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
            tmp = CONFIG + "." + str(os.getpid()) + "." + str(threading.get_ident()) + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            import time
            for _ in range(5):
                try:
                    os.replace(tmp, CONFIG)
                    return
                except PermissionError:
                    time.sleep(0.1)
            try:
                with open(CONFIG, "w", encoding="utf-8") as f:
                    json.dump(state, f, ensure_ascii=False, indent=2)
            finally:
                if os.path.exists(tmp):
                    try:
                        os.remove(tmp)
                    except Exception:
                        pass

    def _java_major(self):
        """Возвращает мажорную версию Java (8, 17, 21...) или 0, если не найдена."""
        try:
            java = self._java_path()
            out = subprocess.run([java, "-version"], capture_output=True, text=True)
            text = (out.stderr or "") + (out.stdout or "")
            m = re.search(r'version "(\d+)(?:\.(\d+))?', text)
            if not m:
                return 0
            major = int(m.group(1))
            # старый формат 1.8 → 8
            if major == 1 and m.group(2):
                major = int(m.group(2))
            return major
        except Exception:
            return 0

    def _required_java(self, version):
        """Требуемая мажорная Java по версии игры."""
        try:
            parts = version.split(".")
            major = int(parts[0]) if parts and parts[0].isdigit() else 0
            minor = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
            patch = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        except Exception:
            return 8
        # Новая год-based нумерация Minecraft (26.x, 27.x ...) — с 2026 требует Java 25+.
        if major >= 26:
            return 25
        if minor >= 21 or (minor == 20 and patch >= 5):
            return 21
        if minor >= 18:
            return 17
        if minor == 17:
            return 17  # 1.17 официально хочет Java 16, но Temurin 16 снят — 17 совместима
        if sys.platform == "darwin" and platform.machine() == "arm64" and minor >= 13:
            return 17  # arm64: 1.13-1.16 на Java 17 (Java 8 arm64 нет; 17 запускает + swap LWJGL)
        return 8

    def check_java(self, version):
        have = self._java_major()
        need = self._required_java(version)
        if have == 0:
            return {"ok": False, "have": 0, "need": need, "msg": "Java не найдена. Установи Java " + str(need) + "."}
        if have < need:
            return {"ok": False, "have": have, "need": need,
                    "msg": f"Для Minecraft {version} нужна Java {need}, а у тебя Java {have}. Игра не запустится — обнови Java."}
        return {"ok": True, "have": have, "need": need}


    # ---------- Modrinth ----------
    def search_mods(self, query, loader, version, category, ptype="mod", offset=0, sort="relevance"):
        facets = [[f"project_type:{ptype}"]]
        if ptype == "mod" and loader and loader != "vanilla":
            facets.append([f"categories:{loader}"])
        if version:
            facets.append([f"versions:{version}"])
        if category:
            cats = category if isinstance(category, list) else [category]
            for c in cats:
                if c:
                    facets.append([f"categories:{c}"])
        params = {"query": query or "", "limit": "20", "offset": str(offset), "index": sort or "relevance", "facets": json.dumps(facets)}
        url = f"{MODRINTH_API}/search?" + urllib.parse.urlencode(params)
        try:
            data = http_get_json(url)
        except Exception as e:
            return {"error": str(e), "hits": []}
        hits = []
        for h in data.get("hits", []):
            hits.append({"project_id": h.get("project_id"), "slug": h.get("slug"), "title": h.get("title"),
                "description": h.get("description"), "downloads": h.get("downloads"), "icon_url": h.get("icon_url"),
                "categories": h.get("categories", []), "author": h.get("author"), "follows": h.get("follows")})
        return {"hits": hits, "total": data.get("total_hits", 0)}

    def search_modpacks(self, query, version, category=None, offset=0, sort="relevance"):
        facets = [["project_type:modpack"]]
        if version:
            facets.append([f"versions:{version}"])
        if category:
            cats = category if isinstance(category, list) else [category]
            for c in cats:
                if c:
                    facets.append([f"categories:{c}"])
        params = {"query": query or "", "limit": "20", "offset": str(offset), "index": sort or "relevance", "facets": json.dumps(facets)}
        url = f"{MODRINTH_API}/search?" + urllib.parse.urlencode(params)
        try:
            data = http_get_json(url)
        except Exception as e:
            return {"error": str(e), "hits": []}
        hits = []
        for h in data.get("hits", []):
            hits.append({"project_id": h.get("project_id"), "slug": h.get("slug"), "title": h.get("title"),
                "description": h.get("description"), "downloads": h.get("downloads"), "icon_url": h.get("icon_url"),
                "author": h.get("author"), "follows": h.get("follows")})
        return {"hits": hits, "total": data.get("total_hits", 0)}


    def mod_info(self, project_id):
        try:
            proj = http_get_json(f"{MODRINTH_API}/project/{project_id}")
        except Exception as e:
            return {"ok": False, "error": str(e)}
        gallery = [g.get("url") for g in proj.get("gallery", []) if g.get("url")]
        return {
            "ok": True,
            "title": proj.get("title"),
            "description": proj.get("description"),
            "body": proj.get("body", ""),
            "downloads": proj.get("downloads", 0),
            "followers": proj.get("followers", 0),
            "icon_url": proj.get("icon_url"),
            "categories": proj.get("categories", []),
            "game_versions": proj.get("game_versions", []),
            "loaders": proj.get("loaders", []),
            "source_url": proj.get("source_url"),
            "wiki_url": proj.get("wiki_url"),
            "slug": proj.get("slug"),
            "gallery": gallery[:6],
        }

    def get_categories(self, ptype="mod"):
        try:
            data = http_get_json(f"{MODRINTH_API}/tag/category")
        except Exception as e:
            return {"error": str(e), "categories": []}
        cats = [c["name"] for c in data if c.get("project_type") == ptype]
        return {"categories": sorted(set(cats))}

    def install_mod(self, profile_id, project_id, loader, version, ptype="mod", dep_ids=None):
        done = {}
        res = self._install_one(profile_id, project_id, loader, version, ptype, done, dep_ids is None)
        if not res.get("ok"):
            return res
        for dpid in (dep_ids or []):
            if dpid and dpid not in done:
                try:
                    self._install_one(profile_id, dpid, loader, version, ptype, done, False)
                except Exception:
                    pass
        res["deps"] = [n for pid, n in done.items() if n and pid != project_id]
        return res

    def resolve_mod(self, project_id, loader, version, ptype="mod"):
        """Мод и его зависимости для окна выбора. Ничего не ставит."""
        def fetch(pid):
            try:
                params = {"game_versions": json.dumps([version]) if version else json.dumps([])}
                if ptype == "mod" and loader and loader != "vanilla":
                    params["loaders"] = json.dumps([loader])
                url = f"{MODRINTH_API}/project/{pid}/version?" + urllib.parse.urlencode(params)
                vs = http_get_json(url)
            except Exception:
                return None
            return vs[0] if vs else None
        main_ver = fetch(project_id)
        if not main_ver:
            return {"ok": False, "error": "Нет подходящей версии под эту версию игры"}
        deps, seen = [], set()
        def walk(ver, depth):
            for d in ver.get("dependencies", []) or []:
                dt = d.get("dependency_type"); dpid = d.get("project_id")
                if not dpid or dpid == project_id or dt not in ("required", "optional"):
                    continue
                if dpid not in seen:
                    seen.add(dpid); deps.append({"project_id": dpid, "type": dt})
                    if dt == "required" and depth < 4:
                        sub = fetch(dpid)
                        if sub: walk(sub, depth + 1)
        walk(main_ver, 0)
        info = {}
        try:
            ids = [project_id] + [d["project_id"] for d in deps]
            q = urllib.parse.quote(json.dumps(ids))
            for p in (http_get_json(f"{MODRINTH_API}/projects?ids={q}") or []):
                info[p.get("id")] = {"name": p.get("title"), "icon_url": p.get("icon_url")}
        except Exception:
            pass
        def nm(pid): return (info.get(pid) or {}).get("name") or pid
        def ic(pid): return (info.get(pid) or {}).get("icon_url")
        return {"ok": True,
                "main": {"project_id": project_id, "name": nm(project_id), "icon_url": ic(project_id)},
                "deps": [{"project_id": d["project_id"], "type": d["type"], "name": nm(d["project_id"]), "icon_url": ic(d["project_id"])} for d in deps]}

    def _install_one(self, profile_id, project_id, loader, version, ptype, done, auto=True):
        if project_id in done:
            return {"ok": True, "filename": done.get(project_id)}
        try:
            params = {"game_versions": json.dumps([version]) if version else json.dumps([])}
            if ptype == "mod" and loader and loader != "vanilla":
                params["loaders"] = json.dumps([loader])
            url = f"{MODRINTH_API}/project/{project_id}/version?" + urllib.parse.urlencode(params)
            versions = http_get_json(url)
        except Exception as e:
            return {"ok": False, "error": f"Не удалось получить версии: {e}"}
        if not versions:
            return {"ok": False, "error": "Нет подходящей версии под эту версию игры"}
        ver = versions[0]
        files = ver.get("files", [])
        target = next((f for f in files if f.get("primary")), files[0] if files else None)
        if not target:
            return {"ok": False, "error": "У версии нет файла для скачивания"}
        dest = os.path.join(content_dir(profile_id, ptype, version, loader), target["filename"])
        try:
            http_download(target["url"], dest)
        except Exception as e:
            return {"ok": False, "error": f"Ошибка скачивания: {e}"}
        done[project_id] = target["filename"]
        if auto and ptype == "mod":
            for dep in ver.get("dependencies", []) or []:
                if dep.get("dependency_type") != "required":
                    continue
                dpid = dep.get("project_id")
                if not dpid or dpid in done:
                    continue
                try:
                    self._install_one(profile_id, dpid, loader, version, ptype, done)
                except Exception:
                    pass
        return {"ok": True, "filename": target["filename"], "version": ver.get("version_number")}

    def _sha1_file(self, path):
        import hashlib
        h = hashlib.sha1()
        try:
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    h.update(chunk)
            return h.hexdigest()
        except Exception:
            return None

    def _latest_version(self, project_id, loader, version, ptype="mod"):
        params = {"game_versions": json.dumps([version]) if version else json.dumps([])}
        if ptype == "mod" and loader and loader != "vanilla":
            params["loaders"] = json.dumps([loader])
        url = f"{MODRINTH_API}/project/{project_id}/version?" + urllib.parse.urlencode(params)
        vers = http_get_json(url)
        return vers[0] if vers else None

    def _installed_file_for_project(self, profile_id, project_id, ptype="mod"):
        d = content_dir(profile_id, ptype)
        for fn in os.listdir(d):
            if not fn.lower().endswith((".jar", ".zip")):
                continue
            sha1 = self._sha1_file(os.path.join(d, fn))
            if not sha1:
                continue
            try:
                info = http_get_json(f"{MODRINTH_API}/version_file/{sha1}?algorithm=sha1")
            except Exception:
                continue
            if info and info.get("project_id") == project_id:
                return fn, info.get("version_number")
        return None, None

    def update_all(self, profile_id, loader, version, ptype="mod"):
        try:
            im = self.installed_map(profile_id, ptype) or {}
        except Exception as e:
            return {"ok": False, "error": str(e)}
        mp = im.get("map") if isinstance(im, dict) else None
        if not isinstance(mp, dict):
            return {"ok": True, "updated": [], "failed": [], "count": 0}
        updated, failed = [], []
        for pid, rec in mp.items():
            fn = (rec or {}).get("filename")
            cur = (rec or {}).get("version")
            if not pid or not fn:
                continue
            try:
                latest = self._latest_version(pid, loader, version, ptype)
            except Exception:
                latest = None
            latest_ver = latest.get("version_number") if latest else None
            if latest_ver and cur and latest_ver != cur:
                r = self.update_mod(profile_id, pid, loader, version, ptype, fn)
                (updated if r.get("ok") else failed).append(r.get("filename") or fn)
        return {"ok": True, "updated": updated, "failed": failed, "count": len(updated)}

    def mod_status(self, profile_id, project_id, loader, version, ptype="mod"):
        try:
            fn, cur_ver = self._installed_file_for_project(profile_id, project_id, ptype)
            if not fn:
                return {"status": "not_installed"}
            latest = self._latest_version(project_id, loader, version, ptype)
            latest_ver = latest.get("version_number") if latest else None
            if latest_ver and cur_ver and latest_ver != cur_ver:
                return {"status": "outdated", "installed_version": cur_ver,
                        "latest_version": latest_ver, "old_filename": fn}
            return {"status": "installed", "installed_version": cur_ver}
        except Exception as e:
            return {"status": "unknown", "error": str(e)}

    def update_mod(self, profile_id, project_id, loader, version, ptype="mod", old_filename=""):
        # dep_ids=[] — зависимости не тянем повторно: они в списке и обновятся своей строкой
        r = self.install_mod(profile_id, project_id, loader, version, ptype, [])
        if not r.get("ok"):
            return r
        if old_filename and old_filename != r.get("filename"):
            d = content_dir(profile_id, ptype)
            old = os.path.normpath(os.path.join(d, old_filename))
            if old.startswith(os.path.normpath(d)) and os.path.exists(old):
                try:
                    os.remove(old)
                except Exception:
                    pass
        return r

    def installed_map(self, profile_id, ptype="mod"):
        """Опознаёт файлы, кэшируя по mtime+size — хешируем только новые/изменённые."""
        d = content_dir(profile_id, ptype)
        cache_path = os.path.join(d, ".mods_cache_" + ptype + ".json")
        cache = {}
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            cache = {}
        files = [fn for fn in os.listdir(d) if fn.lower().endswith((".jar", ".zip", ".jar.disabled"))]
        fresh, to_query = {}, {}
        for fn in files:
            try:
                st = os.stat(os.path.join(d, fn))
                sig = {"mtime": int(st.st_mtime), "size": st.st_size}
            except Exception:
                continue
            c = cache.get(fn)
            if c and c.get("mtime") == sig["mtime"] and c.get("size") == sig["size"]:
                fresh[fn] = c; continue
            h = self._sha1_file(os.path.join(d, fn))
            if not h:
                continue
            sig["sha1"] = h; fresh[fn] = sig; to_query[h] = fn
        if to_query:
            try:
                res = http_post_json(f"{MODRINTH_API}/version_files",
                                     {"hashes": list(to_query.keys()), "algorithm": "sha1"})
            except Exception:
                res = {}
            for h, ver in (res or {}).items():
                fn = to_query.get(h)
                if fn and ver:
                    fresh[fn]["project_id"] = ver.get("project_id")
                    fresh[fn]["version"] = ver.get("version_number")
            # иконки опознанных проектов — одним запросом /projects
            need_icons = sorted({rec.get("project_id") for rec in fresh.values()
                                 if rec.get("project_id") and not rec.get("icon_url")})
            if need_icons:
                try:
                    ids = json.dumps(need_icons)
                    projs = http_get_json(f"{MODRINTH_API}/projects?ids=" + urllib.parse.quote(ids))
                    icons = {p.get("id"): p.get("icon_url") for p in (projs or [])}
                    for rec in fresh.values():
                        pid = rec.get("project_id")
                        if pid and pid in icons:
                            rec["icon_url"] = icons[pid]
                except Exception:
                    pass
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(fresh, f, ensure_ascii=False)
        except Exception:
            pass
        out, icons = {}, {}
        for fn, rec in fresh.items():
            if rec.get("icon_url"):
                icons[fn] = rec.get("icon_url")
            if fn.lower().endswith(".disabled"):
                continue  # отключённые моды не считаем установленными (и не обновляем)
            pid = rec.get("project_id")
            if pid:
                out[pid] = {"version": rec.get("version"), "filename": fn, "icon_url": rec.get("icon_url", "")}
        return {"map": out, "icons": icons}

    def install_modpack(self, profile_id, project_id):
        threading.Thread(target=self._modpack_worker, args=(profile_id, project_id), daemon=True).start()
        return {"ok": True}

    def _store_modpack_mods(self, dest, mc, profile_id):
        """Моды установленного модпака переносим в хранилище его версии."""
        import zipfile
        try:
            with zipfile.ZipFile(dest) as z:
                idx = json.loads(z.read("modrinth.index.json").decode("utf-8"))
                names = z.namelist()
        except Exception:
            return
        # только моды самой сборки — в mods/ могут лежать копии модов другой версии
        wanted = set()
        for fe in idx.get("files", []) or []:
            p = (fe.get("path") or "").replace("\\", "/")
            if p.startswith("mods/") and p.lower().endswith(".jar"):
                wanted.add(os.path.basename(p))
        for n in names:
            if (n.startswith("overrides/mods/") or n.startswith("client-overrides/mods/")) and n.lower().endswith(".jar"):
                wanted.add(os.path.basename(n))
        deps = idx.get("dependencies", {}) or {}
        base = deps.get("minecraft", "")
        if not base:
            return
        loader = "vanilla"
        if "fabric-loader" in deps: loader = "fabric"
        elif "quilt-loader" in deps: loader = "quilt"
        elif "neoforge" in deps: loader = "neoforge"
        elif "forge" in deps: loader = "forge"
        active = os.path.join(mc, "mods")
        if not os.path.isdir(active):
            return
        store = mods_store_dir(profile_id, base, loader)
        for f in [x for x in os.listdir(active) if x in wanted]:
            try:
                shutil.move(os.path.join(active, f), os.path.join(store, f))
            except Exception:
                pass

    def _modpack_worker(self, profile_id, project_id):
        try:
            import minecraft_launcher_lib.mrpack as mrpack
            mc = profile_game_dir(profile_id)
            state = {"stage": "Поиск версии модпака…", "max": 1, "val": 0, "last": 0.0}
            self._progress(state["stage"], 0, 1)

            versions = http_get_json(f"{MODRINTH_API}/project/{project_id}/version")
            mrpack_file = None
            for ver in versions:
                for f in ver.get("files", []):
                    if f.get("filename", "").endswith(".mrpack"):
                        mrpack_file = f
                        break
                if mrpack_file:
                    break
            if not mrpack_file:
                raise RuntimeError("У модпака нет файла .mrpack")

            self._progress("Скачивание модпака…", 0, 1)
            dest = os.path.join(mc, mrpack_file["filename"])
            http_download(mrpack_file["url"], dest)

            self._progress("Установка модпака…", 0, 1)
            callback = self._make_callback(state)
            mrpack.install_mrpack(dest, mc, callback=callback)
            try:
                self._store_modpack_mods(dest, mc, profile_id)
            except Exception:
                pass

            mc_version = ""
            try:
                mc_version = mrpack.get_mrpack_launch_version(dest) or ""
            except Exception:
                pass

            try:
                os.remove(dest)
            except Exception:
                pass

            if _window:
                _window.evaluate_js(f"window.onModpackInstalled && window.onModpackInstalled({json.dumps(mrpack_file.get('filename',''))}, {json.dumps(mc_version)})")
            self._progress("__done__", 1, 1)
        except Exception as e:
            self._err(e)

    # ---------- сборка: экспорт / импорт .mrpack ----------
    def _loader_version_str(self, mc, loader, version):
        """Версия загрузчика из установленной папки версии (нужна для .mrpack)."""
        vid = self._find_loader_version(mc, loader, version) or ""
        pats = {"fabric": r"fabric-loader-([^-]+)-", "quilt": r"quilt-loader-([^-]+)-",
                "forge": r"forge-([\w.]+)$", "neoforge": r"neoforge-([\w.\-]+)$"}
        m = re.search(pats.get(loader, r"^$"), vid)
        return m.group(1) if m else None

    def export_mrpack(self, profile_id, version, loader, name=""):
        import zipfile, hashlib
        try:
            mc = profile_game_dir(profile_id)
            store = mods_store_dir(profile_id, version, loader)
            jars = sorted(f for f in os.listdir(store) if f.lower().endswith(".jar"))
            if not jars:
                return {"ok": False, "error": "В этой версии нет включённых модов"}
            deps = {"minecraft": version}
            if loader in ("fabric", "quilt", "forge", "neoforge"):
                lv = self._loader_version_str(mc, loader, version)
                if not lv:
                    return {"ok": False, "error": "Не нашёл установленный загрузчик. Запусти эту версию хотя бы раз и попробуй снова."}
                key = {"fabric": "fabric-loader", "quilt": "quilt-loader"}.get(loader, loader)
                deps[key] = lv
            title = (name or "").strip() or f"Сборка {version} {loader}"
            safe = re.sub(r'[\\/:*?"<>|]+', "_", title)
            res = _window.create_file_dialog(webview.SAVE_DIALOG, save_filename=safe + ".mrpack")
            if not res:
                return {"ok": False}
            out_path = res if isinstance(res, str) else res[0]
            if not out_path.lower().endswith(".mrpack"):
                out_path += ".mrpack"
            sha1s = {}
            for f in jars:
                h = self._sha1_file(os.path.join(store, f))
                if h:
                    sha1s[h] = f
            try:
                known = http_post_json(f"{MODRINTH_API}/version_files",
                                       {"hashes": list(sha1s.keys()), "algorithm": "sha1"}) or {}
            except Exception:
                known = {}
            files, overrides = [], []
            for h, f in sha1s.items():
                ver = known.get(h)
                hit = None
                for vf in (ver or {}).get("files", []):
                    if (vf.get("hashes") or {}).get("sha1") == h:
                        hit = vf; break
                if hit and hit.get("url"):
                    files.append({"path": "mods/" + f,
                                  "hashes": {"sha1": h, "sha512": hit["hashes"].get("sha512", "")},
                                  "downloads": [hit["url"]], "fileSize": hit.get("size", 0)})
                else:
                    overrides.append(f)
            index = {"formatVersion": 1, "game": "minecraft", "versionId": APP_VERSION,
                     "name": title, "files": files, "dependencies": deps}
            with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
                z.writestr("modrinth.index.json", json.dumps(index, ensure_ascii=False, indent=2))
                for f in overrides:
                    z.write(os.path.join(store, f), "overrides/mods/" + f)
            return {"ok": True, "path": out_path, "linked": len(files), "bundled": len(overrides)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def import_mrpack(self, profile_id):
        try:
            res = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False,
                                             file_types=("Сборки (*.mrpack)",))
            if not res:
                return {"ok": False}
            src = res[0] if isinstance(res, (list, tuple)) else res
        except Exception as e:
            return {"ok": False, "error": str(e)}
        threading.Thread(target=self._mrpack_local_worker, args=(profile_id, src), daemon=True).start()
        return {"ok": True}

    def _mrpack_local_worker(self, profile_id, src):
        try:
            import minecraft_launcher_lib.mrpack as mrpack
            mc = profile_game_dir(profile_id)
            state = {"stage": "Установка сборки…", "max": 1, "val": 0, "last": 0.0}
            self._progress(state["stage"], 0, 1)
            dest = os.path.join(mc, "_import_" + os.path.basename(src))
            shutil.copy2(src, dest)
            mrpack.install_mrpack(dest, mc, callback=self._make_callback(state))
            try:
                self._store_modpack_mods(dest, mc, profile_id)
            except Exception:
                pass
            mc_version = ""
            try:
                mc_version = mrpack.get_mrpack_launch_version(dest) or ""
            except Exception:
                pass
            try:
                os.remove(dest)
            except Exception:
                pass
            if _window:
                _window.evaluate_js(f"window.onModpackInstalled && window.onModpackInstalled({json.dumps(os.path.basename(src))}, {json.dumps(mc_version)})")
            self._progress("__done__", 1, 1)
        except Exception as e:
            self._err(e)

    # ---------- наборы модов ----------
    def list_mod_sets(self, profile_id, version, loader):
        key = _modset_key(version, loader)
        base = os.path.join(profile_game_dir(profile_id), ".mods")
        os.makedirs(base, exist_ok=True)
        names = [MODSET_DEFAULT]
        for d in sorted(os.listdir(base)):
            if d.startswith(key + "~") and os.path.isdir(os.path.join(base, d)):
                names.append(d[len(key) + 1:])
        active = active_modset(profile_id, version, loader)
        if active not in names:
            active = MODSET_DEFAULT
        return {"ok": True, "sets": names, "active": active}

    def _set_active_modset(self, profile_id, version, loader, name):
        data = _modsets_read(profile_id)
        key = _modset_key(version, loader)
        if not name or name == MODSET_DEFAULT:
            data.pop(key, None)
        else:
            data[key] = name
        _modsets_write(profile_id, data)

    def create_mod_set(self, profile_id, version, loader, name, copy_current=False):
        name = _modset_safe(name)
        if not name or name == MODSET_DEFAULT:
            return {"ok": False, "error": "Придумай другое название"}
        if name in self.list_mod_sets(profile_id, version, loader)["sets"]:
            return {"ok": False, "error": "Набор с таким названием уже есть"}
        src = mods_store_dir(profile_id, version, loader)
        dst = mods_store_dir(profile_id, version, loader, name)
        if copy_current:
            for f in os.listdir(src):
                if f.lower().endswith((".jar", ".jar.disabled")):
                    try:
                        shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
                    except Exception:
                        pass
        self._set_active_modset(profile_id, version, loader, name)
        return {"ok": True, "active": name}

    def switch_mod_set(self, profile_id, version, loader, name):
        if name not in self.list_mod_sets(profile_id, version, loader)["sets"]:
            return {"ok": False, "error": "Набор не найден"}
        self._set_active_modset(profile_id, version, loader, name)
        return {"ok": True, "active": name}

    def delete_mod_set(self, profile_id, version, loader, name):
        if not name or name == MODSET_DEFAULT:
            return {"ok": False, "error": "Основной набор удалить нельзя"}
        if name not in self.list_mod_sets(profile_id, version, loader)["sets"]:
            return {"ok": False, "error": "Набор не найден"}
        shutil.rmtree(mods_store_dir(profile_id, version, loader, name), ignore_errors=True)
        if active_modset(profile_id, version, loader) == name:
            self._set_active_modset(profile_id, version, loader, MODSET_DEFAULT)
        return {"ok": True, "active": active_modset(profile_id, version, loader)}

    def list_installed(self, profile_id, ptype="mod"):
        d = content_dir(profile_id, ptype)
        exts = (".jar", ".jar.disabled") if ptype == "mod" else (".zip", ".jar")
        return sorted([f for f in os.listdir(d) if f.lower().endswith(exts)],
                      key=lambda f: f.lower().replace(".disabled", ""))

    def toggle_mod(self, profile_id, filename, ptype="mod"):
        """Вкл/выкл мод без удаления: имя.jar <-> имя.jar.disabled."""
        d = content_dir(profile_id, ptype)
        path = os.path.normpath(os.path.join(d, filename))
        if not path.startswith(os.path.normpath(d)) or not os.path.exists(path):
            return {"ok": False, "error": "Файл не найден"}
        if filename.lower().endswith(".disabled"):
            new_name = filename[:-len(".disabled")]
        else:
            new_name = filename + ".disabled"
        new_path = os.path.join(d, new_name)
        if os.path.exists(new_path):
            return {"ok": False, "error": "Такой файл уже есть: " + new_name}
        try:
            os.rename(path, new_path)
        except Exception as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "filename": new_name, "enabled": not new_name.lower().endswith(".disabled")}

    def delete_mod(self, profile_id, filename, ptype="mod"):
        d = content_dir(profile_id, ptype)
        path = os.path.normpath(os.path.join(d, filename))
        if not path.startswith(os.path.normpath(d)):
            return {"ok": False, "error": "Недопустимый путь"}
        if os.path.exists(path):
            os.remove(path)
            return {"ok": True}
        return {"ok": False, "error": "Файл не найден"}

    def delete_profile_data(self, profile_id):
        d = os.path.join(data_dir(), "profiles", profile_id)
        if os.path.isdir(d):
            shutil.rmtree(d, ignore_errors=True)
        return {"ok": True}

    # ---------- установка / запуск ----------
    def _loader_matches(self, vid, loader):
        low = vid.lower()
        if loader == "forge":
            return "forge" in low and "neoforge" not in low
        return loader in low

    def _neoforge_prefix(self, base_version):
        # NeoForge именует папку без версии игры: 1.21.1 -> neoforge-21.1.x, префикс "21.1."
        parts = base_version.split(".")
        if len(parts) < 2:
            return None
        minor = parts[1]
        patch = parts[2] if len(parts) > 2 else "0"
        return f"{minor}.{patch}."

    def _find_loader_version(self, mc, loader, base_version):
        try:
            installed = minecraft_launcher_lib.utils.get_installed_versions(mc)
            nf_prefix = self._neoforge_prefix(base_version) if loader == "neoforge" else None
            for v in installed:
                vid = v.get("id", "")
                if not self._loader_matches(vid, loader):
                    continue
                if loader == "neoforge":
                    ver_part = vid.lower().replace("neoforge-", "")
                    if nf_prefix and ver_part.startswith(nf_prefix):
                        return vid
                elif base_version in vid:
                    return vid
        except Exception:
            pass
        return None

    def _version_id(self, mc, base_version, loader):
        if loader in ("fabric", "quilt", "forge", "neoforge"):
            found = self._find_loader_version(mc, loader, base_version)
            return found if found else base_version
        return base_version

    def is_installed(self, profile_id, version, loader="vanilla"):
        try:
            mc = profile_game_dir(profile_id)
            if loader in ("fabric", "quilt", "forge", "neoforge"):
                vid = self._find_loader_version(mc, loader, version)
                if not vid:
                    return {"installed": False}
            else:
                vid = version
            vjson = os.path.join(mc, "versions", vid, vid + ".json")
            return {"installed": os.path.exists(vjson)}
        except Exception:
            return {"installed": False}

    def install_version(self, profile_id, version, loader="vanilla"):
        threading.Thread(target=self._install_worker, args=(profile_id, version, loader), daemon=True).start()
        return {"ok": True}

    def launch_game(self, profile_id, version, username, memory, loader="vanilla", server=""):
        threading.Thread(target=self._launch_worker, args=(profile_id, version, username, memory, loader, server), daemon=True).start()
        return {"ok": True}

    def _progress(self, stage, value=0, maximum=0):
        if _window:
            pct = int(value / maximum * 100) if maximum else 0
            try:
                _window.evaluate_js(f"window.onLaunchProgress && window.onLaunchProgress({json.dumps(stage)}, {pct})")
            except Exception:
                pass

    def _err(self, msg):
        if _window:
            try:
                _window.evaluate_js(f"window.onLaunchError && window.onLaunchError({json.dumps(str(msg))})")
            except Exception:
                pass

    def _make_callback(self, state):
        import time
        def human_stage(t):
            if not t: return state["stage"]
            low = t.lower()
            if "download" in low or "install" in low: return "Скачивание файлов игры…"
            if len(t) > 30 or all(c in "0123456789abcdef" for c in low): return "Скачивание файлов игры…"
            return t
        def push():
            now = time.time()
            if now - state["last"] < 0.1: return
            state["last"] = now
            self._progress(state["stage"], state["val"], state["max"] or 1)
        def set_status(t):
            state["stage"] = human_stage(t); state["last"] = 0.0
            self._progress(state["stage"], state["val"], state["max"] or 1)
        def set_progress(v): state["val"] = v; push()
        def set_max(m): state["max"] = m if m else 1
        return {"setStatus": set_status, "setProgress": set_progress, "setMax": set_max}

    def _ensure_russian(self, mc):
        opts = os.path.join(mc, "options.txt")
        try:
            lines = []
            has_lang = False
            if os.path.exists(opts):
                with open(opts, "r", encoding="utf-8") as f:
                    lines = f.read().splitlines()
                for ln in lines:
                    if ln.startswith("lang:"):
                        has_lang = True
                        break
            if not has_lang:
                lines.append("lang:ru_ru")
                with open(opts, "w", encoding="utf-8") as f:
                    f.write("\n".join(lines) + "\n")
        except Exception:
            pass

    def _java_path(self):
        jh = os.environ.get("JAVA_HOME")
        if jh:
            cand = os.path.join(jh, "bin", "java")
            if os.path.exists(cand):
                return cand
        return "java"

    def _pick_neoforge_version(self, base_version):
        parts = base_version.split(".")
        if len(parts) < 2:
            return None
        prefix = f"{parts[1]}.{parts[2] if len(parts) > 2 else '0'}"
        try:
            req = urllib.request.Request(NEOFORGE_MAVEN, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as r:
                xml = r.read().decode("utf-8", "ignore")
        except Exception as e:
            raise RuntimeError(f"Не удалось получить список NeoForge: {e}")
        versions = re.findall(r"<version>([^<]+)</version>", xml)
        matching = [v for v in versions if v.startswith(prefix) and "beta" not in v.lower()]
        if not matching:
            matching = [v for v in versions if v.startswith(prefix)]
        if not matching:
            return None
        return matching[-1]

    def _install_neoforge(self, mc, version, callback):
        nfv = self._pick_neoforge_version(version)
        if not nfv:
            raise RuntimeError(f"NeoForge не найден для {version} (нужна 1.20.2+).")
        callback["setStatus"](f"Скачивание NeoForge {nfv}…")
        url = f"https://maven.neoforged.net/releases/net/neoforged/neoforge/{nfv}/neoforge-{nfv}-installer.jar"
        installer = os.path.join(mc, f"neoforge-{nfv}-installer.jar")
        try:
            http_download(url, installer)
        except Exception as e:
            raise RuntimeError(f"Не удалось скачать installer NeoForge: {e}")
        callback["setStatus"]("Установка NeoForge (Java)…")
        lp = os.path.join(mc, "launcher_profiles.json")
        if not os.path.exists(lp):
            with open(lp, "w", encoding="utf-8") as f:
                json.dump({"profiles": {}, "selectedProfile": "", "clientToken": ""}, f)
        java = self._ensure_java(self._required_java(version))
        proc = subprocess.run([java, "-jar", installer, "--install-client", mc], cwd=mc, capture_output=True, text=True)


        try:
            os.remove(installer)
        except Exception:
            pass
        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or "").strip()[-1500:]
            raise RuntimeError(f"Installer NeoForge вернул ошибку:\n{tail}")

    def _do_install(self, mc, version, loader, state):
        # Если загрузчик под эту версию игры уже установлен — не ставим новый (дубль),
        # запускаем существующий. Иначе автообновление ломает рабочую сборку модов.
        if loader in ("fabric", "quilt", "forge", "neoforge"):
            existing = self._find_loader_version(mc, loader, version)
            if existing:
                return existing  # уже установлен под эту версию
        callback = self._make_callback(state)
        self._progress("Скачивание Minecraft " + version, 0, 1)
        minecraft_launcher_lib.install.install_minecraft_version(version, mc, callback=callback)
        if loader == "fabric":
            self._progress("Установка Fabric…", 0, 1)
            minecraft_launcher_lib.fabric.install_fabric(version, mc, callback=callback)
        elif loader == "quilt":
            self._progress("Установка Quilt…", 0, 1)
            minecraft_launcher_lib.quilt.install_quilt(version, mc, callback=callback)
        elif loader == "forge":
            self._progress("Установка Forge…", 0, 1)
            fv = minecraft_launcher_lib.forge.find_forge_version(version)
            if fv:
                minecraft_launcher_lib.forge.install_forge_version(fv, mc, callback=callback)
            else:
                raise RuntimeError(f"Forge не найден для версии {version}")
        elif loader == "neoforge":
            self._progress("Установка NeoForge…", 0, 1)
            self._install_neoforge(mc, version, callback)
        if loader in ("fabric", "quilt", "forge", "neoforge"):
            found = self._find_loader_version(mc, loader, version)
            if not found:
                raise RuntimeError(f"{loader} установился, но версия не найдена в versions/.")
            return found
        return version

    def _install_worker(self, profile_id, version, loader):
        try:
            mc = profile_game_dir(profile_id)
            state = {"stage": "Подготовка…", "max": 1, "val": 0, "last": 0.0}
            self._do_install(mc, version, loader, state)
            if _window:
                _window.evaluate_js(f"window.onInstalled && window.onInstalled({json.dumps(version)}, {json.dumps(loader)})")
            self._progress("__done__", 1, 1)
        except Exception as e:
            self._err(e)

    def _dedupe_classpath(self, cmd):
        sep = ";" if sys.platform == "win32" else ":"
        out = list(cmd)
        for i, arg in enumerate(out):
            if arg in ("-cp", "-classpath", "-p", "--module-path") and i + 1 < len(out):
                entries = out[i + 1].split(sep)
                seen, uniq = set(), []
                for e in entries:
                    key = os.path.basename(e)
                    if key not in seen:
                        seen.add(key)
                        uniq.append(e)
                out[i + 1] = sep.join(uniq)
        return out

    def _arm_unsupported(self, version):
        """1.13-1.18 не запускаются на Apple Silicon: Minecraft роняет игру на иконке окна.
        Ниже 1.13 — Rosetta+LWJGL2, выше 1.18 — нативный arm64, они работают."""
        if sys.platform != "darwin" or platform.machine() != "arm64":
            return False
        m = re.search(r"1\.(\d+)(?:\.(\d+))?", version)
        if not m:
            return False
        return 13 <= int(m.group(1)) <= 18

    def _sync_active_mods(self, mc, profile_id, version, loader):
        """В <mc>/mods кладём моды только этой версии+загрузчика."""
        _migrate_flat_mods(profile_id)
        active = os.path.join(mc, "mods")
        os.makedirs(active, exist_ok=True)
        store = mods_store_dir(profile_id, version, loader)
        store_jars = [f for f in os.listdir(store) if f.lower().endswith(".jar")]
        for f in [x for x in os.listdir(active) if x.lower().endswith(".jar")]:
            try:
                os.remove(os.path.join(active, f))
            except Exception:
                pass
        for f in store_jars:
            try:
                shutil.copy2(os.path.join(store, f), os.path.join(active, f))
            except Exception:
                pass

    def _jvm_args(self, preset, mem, java_major, extra=""):
        """Флаги JVM по пресету + свои флаги пользователя."""
        import shlex
        xms = min(mem, max(1024, mem // 2))
        aikar = [
            "-XX:+UnlockExperimentalVMOptions", "-XX:+UseG1GC", "-XX:+ParallelRefProcEnabled",
            "-XX:MaxGCPauseMillis=200", "-XX:+DisableExplicitGC", "-XX:G1NewSizePercent=30",
            "-XX:G1MaxNewSizePercent=40", "-XX:G1HeapRegionSize=8M", "-XX:G1ReservePercent=20",
            "-XX:G1HeapWastePercent=5", "-XX:G1MixedGCCountTarget=4",
            "-XX:InitiatingHeapOccupancyPercent=15",
        ]
        if preset == "light":
            # слабый ПК: меньше стартовой памяти, короткие паузы сборщика
            xms = min(mem, 1024)
            flags = ["-XX:+UseG1GC", "-XX:MaxGCPauseMillis=100", "-XX:+DisableExplicitGC",
                     "-XX:+UnlockExperimentalVMOptions", "-XX:G1NewSizePercent=20",
                     "-XX:G1ReservePercent=20", "-XX:G1HeapRegionSize=4M"]
        elif preset == "zgc" and java_major >= 21:
            # много модов: ZGC почти без фризов, нужна Java 21+
            xms = mem
            flags = ["-XX:+UseZGC", "-XX:+DisableExplicitGC", "-XX:+AlwaysPreTouch"]
            if java_major in (21, 22):
                flags.append("-XX:+ZGenerational")
        elif preset == "custom":
            flags = []
        else:
            flags = aikar
        try:
            user = shlex.split(extra or "")
        except ValueError:
            user = (extra or "").split()
        mem_flags = []
        if not any(a.startswith("-Xmx") for a in user):
            mem_flags.append(f"-Xmx{mem}M")
        if not any(a.startswith("-Xms") for a in user):
            mem_flags.append(f"-Xms{xms}M")
        return mem_flags + flags + user

    def pick_java(self):
        try:
            res = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False)
            if not res:
                return {"ok": False}
            path = res[0] if isinstance(res, (list, tuple)) else res
            if os.path.isdir(path):
                for cand in (os.path.join(path, "Contents", "Home", "bin", "java"),
                             os.path.join(path, "bin", "java"), os.path.join(path, "java")):
                    if os.path.isfile(cand):
                        path = cand; break
            out = subprocess.run([path, "-version"], capture_output=True, text=True, timeout=10)
            text = (out.stderr or "") + (out.stdout or "")
            m = re.search(r'version "([^"]+)"', text)
            if not m:
                return {"ok": False, "error": "Это не похоже на Java: " + os.path.basename(path)}
            return {"ok": True, "path": path, "version": m.group(1)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _launch_worker(self, profile_id, version, username, memory, loader, server=""):
        try:
            if self._arm_unsupported(version):
                self._err("Minecraft " + version + " не запускается на Mac с Apple Silicon "
                          "из-за ограничения самой игры (краш на иконке окна). "
                          "Выбери 1.12.2 или 1.19.3 и новее.")
                return
            mc = profile_game_dir(profile_id)
            if loader in ("fabric", "quilt", "forge", "neoforge"):
                launch_version = self._find_loader_version(mc, loader, version)
            else:
                launch_version = version
            vjson = os.path.join(mc, "versions", launch_version, launch_version + ".json") if launch_version else ""
            if not launch_version or not os.path.exists(vjson):
                state = {"stage": "Подготовка…", "max": 1, "val": 0, "last": 0.0}
                launch_version = self._do_install(mc, version, loader, state)
            base_jar = os.path.join(mc, "versions", version, version + ".jar")
            if not os.path.exists(base_jar):
                self._progress("Восстановление файлов игры…", 0, 1)
                minecraft_launcher_lib.install.install_minecraft_version(
                    version, mc,
                    callback=self._make_callback({"stage": "Восстановление…", "max": 1, "val": 0, "last": 0.0})
                )
            self._ensure_russian(mc)
            self._sync_active_mods(mc, profile_id, version, loader)
            mem = int(memory)
            ps = _profile_settings(profile_id)
            jvm_args = self._jvm_args(ps.get("jvmPreset") or "aikar", mem,
                                      self._required_java(version), ps.get("jvmArgs") or "")
            lwjgl_jars = None
            lwjgl_nat = None
            intel_java = None
            java_exe = None
            custom_java = (ps.get("javaPath") or "").strip()
            if self._needs_intel_java(version):
                self._progress("Подготовка Intel Java (Rosetta)…", 0, 1)
                intel_java = self._intel_java8_path()
            else:
                fix = self._needs_lwjgl_fix(version)
                if fix == "swap":
                    self._progress("Подготовка библиотек для Apple Silicon…", 0, 1)
                    lwjgl_jars, lwjgl_nat = self._lwjgl_3xx_dir()
                if custom_java and os.path.isfile(custom_java) and os.access(custom_java, os.X_OK):
                    java_exe = custom_java
                else:
                    java_exe = self._ensure_java(self._required_java(version))
            options = {
                "username": username or "Player",
                "uuid": str(uuid.uuid3(uuid.NAMESPACE_DNS, username or "Player")),
                "token": "0",
                "gameDirectory": mc,
                "jvmArguments": jvm_args,
            }
            if java_exe:
                options["executablePath"] = java_exe
            if server:
                options["quickPlayMultiplayer"] = server
            self._progress("Запуск игры…", 1, 1)
            cmd = minecraft_launcher_lib.command.get_minecraft_command(launch_version, mc, options)
            cmd = self._dedupe_classpath(cmd)
            if lwjgl_jars:
                cmd = self._swap_lwjgl(cmd, lwjgl_jars, lwjgl_nat)
            if intel_java:
                cmd[0] = intel_java
                cmd = ["/usr/bin/arch", "-x86_64"] + cmd
            elif java_exe:
                cmd[0] = java_exe

            log_path = os.path.join(mc, "last_launch.log")
            logf = open(log_path, "w", encoding="utf-8", errors="ignore")
            popen_kwargs = {"cwd": mc, "stdout": logf, "stderr": subprocess.STDOUT}
            if sys.platform == "win32":
                popen_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
            proc = subprocess.Popen(cmd, **popen_kwargs)
            self._progress("__done__", 1, 1)
            try:
                if _window:
                    _window.minimize()
            except Exception:
                pass
            import time as _t
            threading.Thread(target=self._watch_process, args=(proc, log_path, logf, profile_id, _t.time()), daemon=True).start()
        except Exception as e:
            self._err(e)

    def _watch_process(self, proc, log_path, logf, profile_id=None, start_ts=None):
        code = proc.wait()
        try:
            logf.close()
        except Exception:
            pass
        # накопленное игровое время сеанса -> в UI
        if profile_id and start_ts:
            import time as _t
            secs = int(_t.time() - start_ts)
            if _window and secs > 0:
                try:
                    _window.evaluate_js(f"window.onGameClosed && window.onGameClosed({json.dumps(profile_id)}, {secs})")
                except Exception:
                    pass
        if code not in (0, None):
            tail = ""
            full = ""
            try:
                with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                    full = f.read()
                tail = "".join(full.splitlines(keepends=True)[-40:])
            except Exception:
                pass
            if _window:
                try:
                    _window.evaluate_js(f"window.onGameCrash && window.onGameCrash({json.dumps(code)}, {json.dumps(tail)}, {json.dumps(self._diagnose_crash(full))})")
                except Exception:
                    pass

    def _diagnose_crash(self, text):
        import re as _re
        if not text:
            return ""
        low = text.lower()
        if "outofmemoryerror" in low or "java heap space" in low:
            return "Не хватило оперативной памяти. Увеличь объём памяти в настройках профиля."
        if "unsupportedclassversionerror" in low or "compiled by a more recent version of the java runtime" in low:
            return "Один из модов собран под более новую Java. Поставь мод в версии под твою версию Minecraft."
        if "mandatory dependenc" in low:
            return "Forge/NeoForge: некоторым модам не хватает обязательных зависимостей. Доустанови требуемые моды под эту версию."
        if "incompatible mods" in low or "due to errors, the game cannot be loaded" in low or ("requires" in low and "is missing" in low):
            names = _re.findall(r"mod '([^']+)'", text)
            extra = (" Проблемные моды: " + ", ".join(sorted(set(names))[:5]) + ".") if names else ""
            return "Не хватает зависимостей или моды несовместимы между собой." + extra + " Проверь, что все моды под эту версию игры и загрузчик."
        if "requires minecraft version" in low or "for a different version of minecraft" in low:
            return "Какой-то мод рассчитан на другую версию Minecraft. Поставь версии модов под твою версию игры."
        if "duplicate mod" in low or "duplicatemods" in low:
            return "Найдены дубликаты модов (один мод в двух версиях). Удали лишние .jar."
        if "mixin apply failed" in low or "mixinapplyerror" in low or "mixin transformation" in low:
            return "Ошибка Mixin — обычно конфликт модов или мод под другую версию. Отключай недавно добавленные моды по одному."
        if "failed to initialize glfw" in low or "glfw error" in low:
            return "Проблема с графикой/GLFW. На Apple Silicon помогает другая версия игры (1.19.3+ или 1.12.2)."
        return ""

    def get_last_log(self, profile_id):
        mc = profile_game_dir(profile_id)
        log_path = os.path.join(mc, "last_launch.log")
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                return {"ok": True, "log": f.read()[-8000:]}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _themes_dir(self):
        d = os.path.join(data_dir(), "themes")
        os.makedirs(d, exist_ok=True)
        return d

    def list_themes(self):
        d = self._themes_dir()
        try:
            names = sorted(f[:-4] for f in os.listdir(d) if f.lower().endswith(".css"))
        except Exception as e:
            return {"ok": False, "error": str(e), "themes": []}
        if not names:
            example = (
                "/* Пример темы. Скопируй файл, переименуй и меняй под себя. */\n"
                "/* Цвет акцента — кнопки и выделения */\n"
                ":root { --accent: #c678dd; }\n"
                "/* Пример: сильнее скруглить кнопку Играть */\n"
                "#clPlay { border-radius: 14px; }\n"
            )
            try:
                with open(os.path.join(d, "Пример.css"), "w", encoding="utf-8") as f:
                    f.write(example)
                names = ["Пример"]
            except Exception:
                pass
        return {"ok": True, "themes": names}

    def read_theme(self, name):
        d = self._themes_dir()
        safe = os.path.basename((name or "") + ".css")
        path = os.path.normpath(os.path.join(d, safe))
        if not path.startswith(os.path.normpath(d)):
            return {"ok": False, "error": "Недопустимый путь"}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return {"ok": True, "css": f.read()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def import_theme(self):
        """Выбрать .css и скопировать в папку тем. Имя темы = имя файла."""
        try:
            res = _window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True,
                                             file_types=("Темы (*.css)",))
            if not res:
                return {"ok": False}
            d = self._themes_dir()
            added = []
            for src in res:
                name = os.path.basename(src)
                if not name.lower().endswith(".css"):
                    continue
                shutil.copy2(src, os.path.join(d, name))
                added.append(name[:-4])
            return {"ok": True, "added": added}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_themes_folder(self):
        try:
            _open_path(self._themes_dir())
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def reload_now(self):
        if _window:
            _window.load_url(resource_path("index.html"))
        return True

def start_watcher():
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except Exception:
        print("watchdog не установлен — live reload выключен. Поставь: python3 -m pip install watchdog")
        return

    watched_ext = (".html", ".css", ".js")

    class Handler(FileSystemEventHandler):
        def on_any_event(self, event):
            if event.is_directory:
                return
            if event.src_path.lower().endswith(watched_ext):
                if _window:
                    fname = os.path.basename(event.src_path).replace("\\", "\\\\").replace("'", "\\'")
                    try:
                        _window.evaluate_js(f"window.notifyReload && window.notifyReload('{fname}')")
                    except Exception:
                        pass

    obs = Observer()
    obs.schedule(Handler(), project_dir(), recursive=True)
    obs.daemon = True
    obs.start()

if __name__ == "__main__":
    api = Api()
    html_path = resource_path("index.html")
    if not os.path.exists(html_path):
        # fallback: рядом с исполняемым файлом (для упакованного .exe/.app)
        alt = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "index.html")
        if os.path.exists(alt):
            html_path = alt
    _window = webview.create_window(
        "Minecraft Launcher",
        html_path,
        js_api=api,
        width=1040, height=720,
        min_size=(820, 580),
        background_color="#0F1114",
        resizable=True,
        maximized=True,
        hidden=True,
    )
    if DEV:
        threading.Thread(target=start_watcher, daemon=True).start()

    def _show_when_ready():
        # Показываем окно, когда webview уже отрисовал тёмный HTML — без белой вспышки.
        import time
        time.sleep(0.25)
        try:
            _window.show()
        except Exception:
            pass
    threading.Thread(target=_show_when_ready, daemon=True).start()
    webview.start()

