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
APP_VERSION = "0.0.8"
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


def content_dir(profile_id, ptype):
    folder = {"mod": "mods", "resourcepack": "resourcepacks", "shader": "shaderpacks"}.get(ptype, "mods")
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
    with urllib.request.urlopen(req, timeout=20) as r:
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
        """True для версий на LWJGL 2.x (<=1.12) на Apple Silicon — запуск через Rosetta."""
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
            os_name = "mac"; arch = "aarch64" if platform.machine() == "arm64" else "x64"; ext = "tar.gz"
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
    def ping_server(self, address):
        """Server List Ping: online/offline + игроки + версия."""
        import socket, struct

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

        host = address
        port = 25565
        if ":" in address:
            host, p = address.rsplit(":", 1)
            try:
                port = int(p)
            except ValueError:
                port = 25565
        try:
            sock = socket.create_connection((host, port), timeout=4)
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
            sock.close()
            info = json.loads(data.decode("utf-8", "ignore"))
            players = info.get("players", {})
            ver = info.get("version", {})
            return {"online": True, "now": players.get("online", 0), "max": players.get("max", 0), "version": ver.get("name", "")}
        except Exception as e:
            return {"online": False, "error": str(e)}

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
        try:
            data = http_get_json(MOJANG_MANIFEST)
            out = []
            for v in data.get("versions", []):
                if v.get("type") == "release" or (include_snapshots and v.get("type") == "snapshot"):
                    out.append({"id": v["id"], "type": v["type"]})
            return {"versions": out}
        except Exception as e:
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
            minor = int(parts[1]) if len(parts) > 1 else 0
            patch = int(parts[2]) if len(parts) > 2 else 0
        except Exception:
            return 8
        if minor >= 21 or (minor == 20 and patch >= 5):
            return 21
        if minor >= 18:
            return 17
        if minor == 17:
            return 16
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

    def search_modpacks(self, query, version, offset=0, sort="relevance"):
        facets = [["project_type:modpack"]]
        if version:
            facets.append([f"versions:{version}"])
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

    def install_mod(self, profile_id, project_id, loader, version, ptype="mod"):
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
        dest = os.path.join(content_dir(profile_id, ptype), target["filename"])
        try:
            http_download(target["url"], dest)
        except Exception as e:
            return {"ok": False, "error": f"Ошибка скачивания: {e}"}
        return {"ok": True, "filename": target["filename"], "version": ver.get("version_number")}

    def install_modpack(self, profile_id, project_id):
        threading.Thread(target=self._modpack_worker, args=(profile_id, project_id), daemon=True).start()
        return {"ok": True}

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

    def list_installed(self, profile_id, ptype="mod"):
        d = content_dir(profile_id, ptype)
        exts = (".jar",) if ptype == "mod" else (".zip", ".jar")
        return sorted([f for f in os.listdir(d) if f.lower().endswith(exts)])

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
    def _find_loader_version(self, mc, loader, base_version):
        try:
            installed = minecraft_launcher_lib.utils.get_installed_versions(mc)
            for v in installed:
                vid = v.get("id", "")
                if loader in vid.lower() and base_version in vid:
                    return vid
            for v in reversed(installed):
                vid = v.get("id", "")
                if loader in vid.lower():
                    return vid
        except Exception:
            pass
        return base_version

    def _version_id(self, mc, base_version, loader):
        if loader in ("fabric", "quilt", "forge", "neoforge"):
            return self._find_loader_version(mc, loader, base_version)
        return base_version

    def is_installed(self, profile_id, version, loader="vanilla"):
        try:
            mc = profile_game_dir(profile_id)
            vid = self._version_id(mc, version, loader)
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
        return self._version_id(mc, version, loader)

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

    def _launch_worker(self, profile_id, version, username, memory, loader, server=""):
        try:
            mc = profile_game_dir(profile_id)
            launch_version = self._version_id(mc, version, loader)
            vjson = os.path.join(mc, "versions", launch_version, launch_version + ".json")
            if not os.path.exists(vjson):
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
            mem = int(memory)
            xms = min(mem, max(1024, mem // 2))
            jvm_args = [
                f"-Xmx{mem}M",
                f"-Xms{xms}M",
                "-XX:+UnlockExperimentalVMOptions",
                "-XX:+UseG1GC",
                "-XX:+ParallelRefProcEnabled",
                "-XX:MaxGCPauseMillis=200",
                "-XX:+DisableExplicitGC",
                "-XX:G1NewSizePercent=30",
                "-XX:G1MaxNewSizePercent=40",
                "-XX:G1HeapRegionSize=8M",
                "-XX:G1ReservePercent=20",
                "-XX:G1HeapWastePercent=5",
                "-XX:G1MixedGCCountTarget=4",
                "-XX:InitiatingHeapOccupancyPercent=15",
            ]
            lwjgl_jars = None
            lwjgl_nat = None
            intel_java = None
            java_exe = None
            if self._needs_intel_java(version):
                self._progress("Подготовка Intel Java (Rosetta)…", 0, 1)
                intel_java = self._intel_java8_path()
            else:
                fix = self._needs_lwjgl_fix(version)
                if fix == "swap":
                    self._progress("Подготовка библиотек для Apple Silicon…", 0, 1)
                    lwjgl_jars, lwjgl_nat = self._lwjgl_3xx_dir()
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
            threading.Thread(target=self._watch_process, args=(proc, log_path, logf), daemon=True).start()
        except Exception as e:
            self._err(e)





    def _watch_process(self, proc, log_path, logf):
        code = proc.wait()
        try:
            logf.close()
        except Exception:
            pass
        if code not in (0, None):
            tail = ""
            try:
                with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                    tail = "".join(f.readlines()[-40:])
            except Exception:
                pass
            if _window:
                try:
                    _window.evaluate_js(f"window.onGameCrash && window.onGameCrash({json.dumps(code)}, {json.dumps(tail)})")
                except Exception:
                    pass

    def get_last_log(self, profile_id):
        mc = profile_game_dir(profile_id)
        log_path = os.path.join(mc, "last_launch.log")
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                return {"ok": True, "log": f.read()[-8000:]}
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
    )
    if DEV:
        threading.Thread(target=start_watcher, daemon=True).start()
    webview.start()

