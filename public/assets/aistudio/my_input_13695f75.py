#!/usr/bin/env python3
"""My Input — Windows local-network phone-to-PC text input (Phase 1).

Run without arguments to open the installer/control panel.  The background
server uses --daemon and is intentionally dependency-light: only pynput and
pyperclip are installed automatically when required.
"""
from __future__ import annotations

import argparse
import base64
import ctypes
import io
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

APP_NAME = "My Input"
DEFAULT_PORT = int(os.environ.get("MY_INPUT_PORT", "5000"))
DISCOVERY_PORT = int(os.environ.get("MY_INPUT_DISCOVERY_PORT", "5001"))
VALID_ACTIONS = {"none", "enter", "shift_enter", "backspace", "space", "image_only"}
INPUT_LOCK = threading.Lock()
SERVER: ThreadingHTTPServer | None = None


def user_data_dir() -> Path:
    return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "MyInput"


def pid_file() -> Path:
    return user_data_dir() / "my_input.pid"


def hostname() -> str:
    return socket.gethostname()


def lan_ip() -> str:
    """Find the LAN-facing address without sending any network traffic."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 80))  # TEST-NET; connect is local for UDP.
        candidate = probe.getsockname()[0]
        return candidate if not candidate.startswith("127.") else "127.0.0.1"
    except OSError:
        try:
            return socket.gethostbyname(hostname())
        except OSError:
            return "127.0.0.1"
    finally:
        probe.close()


def bootstrap_dependencies() -> tuple[bool, str]:
    """Install only the runtime packages that are missing."""
    missing: list[str] = []
    # zeroconf advertises <computer-name>.local to Android via mDNS, so the
    # phone never needs to remember a Wi-Fi address that can change.
    packages = (("pynput", "pynput"), ("pyperclip", "pyperclip"),
                ("zeroconf", "zeroconf"), ("PIL", "Pillow"),
                ("qrcode", "qrcode"))
    for module, package in packages:
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    if not missing:
        return True, "Dependencies ready"

    commands = [
        [sys.executable, "-m", "pip", "install", "--user", *missing],
        [sys.executable, "-m", "pip", "install", *missing],
    ]
    errors: list[str] = []
    for command in commands:
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=180)
            if result.returncode == 0:
                return True, "Installed: " + ", ".join(missing)
            errors.append(result.stderr.strip() or result.stdout.strip())
        except (OSError, subprocess.SubprocessError) as exc:
            errors.append(str(exc))
    return False, "Could not install dependencies: " + " | ".join(errors[-1:])


def copy_unicode_to_clipboard(text: str) -> None:
    """Use pyperclip, then Windows' Unicode clipboard command as a fallback."""
    try:
        import pyperclip  # type: ignore
        pyperclip.copy(text)
        return
    except Exception:
        pass
    # clip.exe consumes UTF-16LE on Windows; avoid shell quoting or encoding loss.
    process = subprocess.Popen(["clip.exe"], stdin=subprocess.PIPE)
    assert process.stdin is not None
    process.stdin.write(text.encode("utf-16le"))
    process.stdin.close()
    if process.wait(timeout=5) != 0:
        raise RuntimeError("Windows clipboard command failed")


def copy_image_to_clipboard(image_path: Path) -> None:
    """Put a PNG on the Windows clipboard as an image, not as a file path."""
    script = """
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($env:MY_INPUT_IMAGE_PATH)
try { [System.Windows.Forms.Clipboard]::SetImage($image) }
finally { $image.Dispose() }
"""
    environment = os.environ.copy()
    environment["MY_INPUT_IMAGE_PATH"] = str(image_path)
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-STA", "-EncodedCommand", encoded],
        capture_output=True, text=True, timeout=15, env=environment,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Could not copy the image to the clipboard")


def normalize_image_to_png(raw: bytes, content_type: str) -> Path:
    """Convert an uploaded photo (jpeg/png/webp) into a PNG file on disk."""
    buffer = io.BytesIO(raw)
    try:
        from PIL import Image  # type: ignore
        with Image.open(buffer) as image:
            image = image.convert("RGBA")
            folder = user_data_dir() / "images"; folder.mkdir(parents=True, exist_ok=True)
            target = folder / f"upload-{int(time.time() * 1000)}.png"
            image.save(target, "PNG")
            return target
    except Exception:
        # Without Pillow the Windows clipboard can only read PNG via the fallback,
        # so reject other formats early rather than paste garbage.
        if "png" in (content_type or "image/png"):
            folder = user_data_dir() / "images"; folder.mkdir(parents=True, exist_ok=True)
            target = folder / f"upload-{int(time.time() * 1000)}.png"
            target.write_bytes(raw)
            return target
        raise ValueError("Image must be a PNG, JPEG or WebP photo")


def paste_clipboard(keyboard: Any, key: Any) -> None:
    keyboard.press(key.ctrl)
    keyboard.press("v")
    keyboard.release("v")
    keyboard.release(key.ctrl)


def execute_input(text: str, action: str, image_path: Path | None = None) -> None:
    """Clipboard paste and keys; serialized so parallel phone taps cannot overlap."""
    if action not in VALID_ACTIONS:
        raise ValueError("Unsupported action")
    try:
        from pynput.keyboard import Controller, Key  # type: ignore
    except Exception as exc:
        raise RuntimeError("Keyboard engine unavailable. Reinstall pynput.") from exc

    with INPUT_LOCK:
        keyboard = Controller()
        if image_path is not None:
            copy_image_to_clipboard(image_path)
            time.sleep(0.05)
            paste_clipboard(keyboard, Key)
        if text:
            copy_unicode_to_clipboard(text)
            time.sleep(0.05)
            paste_clipboard(keyboard, Key)
        if action in ("none", "image_only"):
            return
        time.sleep(0.05)
        if action == "enter":
            keyboard.press(Key.enter)
            keyboard.release(Key.enter)
        elif action == "shift_enter":
            keyboard.press(Key.shift)
            keyboard.press(Key.enter)
            keyboard.release(Key.enter)
            keyboard.release(Key.shift)
        elif action == "backspace":
            keyboard.press(Key.backspace)
            keyboard.release(Key.backspace)
        elif action == "space":
            keyboard.press(Key.space)
            keyboard.release(Key.space)


def qr_code_data_url(url: str) -> str:
    """Render a scannable QR code of the phone URL as a data URL."""
    try:
        import qrcode  # type: ignore
        buffer = io.BytesIO()
        qrcode.make(url, box_size=8, border=1).save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        return ""


def info_payload() -> dict[str, Any]:
    ip = lan_ip()
    host_url = f"http://{hostname()}:{DEFAULT_PORT}"
    return {
        "status": "ok", "app": "MyInput", "hostname": hostname(),
        "local_hostname": f"{hostname()}.local", "ip": ip, "port": DEFAULT_PORT,
        "os": "Windows", "url": host_url, "hostname_url": host_url,
        "local_hostname_url": f"http://{hostname()}.local:{DEFAULT_PORT}",
        "ip_url": f"http://{ip}:{DEFAULT_PORT}",
        "qr": qr_code_data_url(f"http://{ip}:{DEFAULT_PORT}"),
        "supported_actions": ["none", "enter", "shift_enter", "backspace", "space"],
    }


HTML = r'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#2563eb"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="My Input"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/png" href="/icon/192.png"><link rel="apple-touch-icon" href="/icon/192.png"><link rel="apple-touch-icon" sizes="512x512" href="/icon/512.png"><meta name="apple-mobile-web-app-capable" content="yes"><title>My Input</title><style>
*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:#f7f9fc;color:#0f172a;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}.app{width:min(100%,620px);height:100vh;height:100svh;height:100dvh;margin:auto;padding:max(8px,env(safe-area-inset-top)) 16px max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}.top{display:flex;align-items:center;justify-content:space-between;padding:2px 4px;flex:none;min-height:0}.brand{font-size:1.05rem;font-weight:750;letter-spacing:-.03em}.device{display:flex;align-items:center;gap:6px;color:#64748b;font-size:.72rem;max-width:55%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;padding:3px 7px;border-radius:999px;background:#eef2f7;transition:background .15s;flex:none}.device:active{background:#e2e8f0}.dot{width:7px;height:7px;flex:none;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px #dcfce7}.empty{align-self:center;max-width:260px;text-align:center;color:#94a3b8;font-size:.8rem;line-height:1.4;margin:0;flex:none}.spacer{flex:1;min-height:0}.composer{flex:none;display:flex;flex-direction:column;min-height:0}.img-strip{display:none;padding:0}.img-strip.show{display:block}.thumb-wrap{position:relative;width:100%;max-width:340px;aspect-ratio:16/9;margin:0 auto 6px;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px #0f172a33;background:#e2e8f0}.thumb-wrap img{width:100%;height:100%;object-fit:cover;display:block}.thumb-wrap .x{position:absolute;right:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#0f172a;color:#fff;font-size:11px;line-height:22px;text-align:center;cursor:pointer;border:2px solid #fff;z-index:2}.keys{display:flex;justify-content:center;align-items:center;margin:0 0 6px;gap:8px}.key{min-width:34px;height:30px;padding:0 10px;border:0;border-radius:9px;background:#edf2f7;color:#475569;font:600 .95rem/1 system-ui;cursor:pointer}.key:active{transform:scale(.94)}.input-wrap{position:relative;border:1px solid #dbe4f0;border-radius:18px;background:#fff;box-shadow:0 8px 26px #0f172a0d;display:flex;min-height:60px;max-height:150px}.input-wrap:focus-within{border-color:#93c5fd;box-shadow:0 0 0 3px #dbeafe,0 8px 26px #0f172a0d}textarea{flex:1;width:100%;min-height:0;resize:none;overflow-y:auto;border:0;outline:0;background:transparent;padding:12px 12px 50px;color:#172554;font:1.05rem/1.5 system-ui,"Noto Sans Bengali",sans-serif}textarea::placeholder{color:#94a3b8}.action-bar{position:absolute;bottom:8px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:8px;padding:0 12px;z-index:3;pointer-events:none}.action-bar .attach,.action-bar .send{pointer-events:auto}.attach{width:34px;height:34px;border:0;border-radius:10px;background:#f1f5f9;color:#475569;display:grid;place-items:center;cursor:pointer}.attach svg{width:17px;height:17px}.attach.has-image{background:#dbeafe;color:#1d4ed8}.send{width:32px;height:32px;border:0;border-radius:10px;background:#2563eb;color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 3px 8px #2563eb4d}.send svg{width:14px;height:14px;transform:translate(1px,-1px)}.toast{position:fixed;bottom:max(76px,calc(env(safe-area-inset-bottom) + 60px));left:50%;transform:translateX(-50%) translateY(8px);background:#172554;color:#fff;padding:8px 14px;border-radius:999px;opacity:0;transition:.18s;pointer-events:none;max-width:90%;font-size:.8rem;text-align:center;z-index:30}.toast.show{opacity:1;transform:translateX(-50%)}.toast.error{background:#b91c1c}.qr-overlay{position:fixed;inset:0;background:#0f172a99;display:none;align-items:center;justify-content:center;z-index:20}.qr-overlay.show{display:flex}.qr-card{background:#fff;border-radius:20px;padding:20px 22px;text-align:center;box-shadow:0 16px 48px #0f172a40;max-width:290px;width:90%}.qr-card h3{margin:0 0 4px;font-size:1.05rem;color:#0f172a}.qr-card p{margin:0 0 12px;color:#64748b;font-size:.8rem;line-height:1.4;word-break:break-all}.qr-card img{width:100%;border-radius:8px}.qr-card .url{margin-top:10px;font:600 .82rem/1.3 ui-monospace,Consolas,monospace;color:#2563eb}input[type=file]{display:none}@media(max-height:520px){.empty{display:none}.app{gap:6px}}@media(max-width:370px){.app{padding-left:12px;padding-right:12px}.img-strip .thumb-wrap{max-width:260px}}
</style></head><body><main class="app"><header class="top"><div class="brand">My Input</div><button class="device" id="device" type="button" aria-label="Show QR code"><i class="dot"></i><span id="pc">Connecting</span></button></header><p class="empty">Type or use voice input. Attach a photo from your gallery, then send it to your active PC field.</p><div class="spacer"></div><section class="composer"><div class="img-strip" id="img-strip"><div class="thumb-wrap"><img id="preview-img" alt="Attached photo"><span class="x" id="preview-x" role="button" aria-label="Remove photo">✕</span></div></div><div class="keys"><button class="key" data-key="enter" type="button" aria-label="Press Enter on PC">↵</button><button class="key" data-key="shift_enter" type="button" aria-label="Press Shift+Enter on PC">⇧↵</button><button class="key" data-key="backspace" type="button" aria-label="Backspace on PC">⌫</button></div><div class="input-wrap" id="wrap"><textarea id="text" autocomplete="off" autocapitalize="sentences" placeholder="Type or use voice input…" aria-label="Text to send"></textarea><input type="file" id="file" accept="image/*" aria-hidden="true"><div class="action-bar"><button class="attach" id="attach" type="button" aria-label="Attach photo from gallery"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></button><button class="send" id="send" type="button" aria-label="Send to PC"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4Z"></path></svg></button></div></div></section></main><div class="qr-overlay" id="qr-overlay"><div class="qr-card"><h3>Scan to open My Input</h3><p>Point your phone camera at this code — it opens the app on your PC.</p><img id="qr-img" alt="QR code"><div class="url" id="qr-url"></div></div></div><div class="toast" id="toast"></div><script>
const text=document.querySelector('#text'),toast=document.querySelector('#toast'),send=document.querySelector('#send'),attach=document.querySelector('#attach'),fileInput=document.querySelector('#file'),imgStrip=document.querySelector('#img-strip'),previewImg=document.querySelector('#preview-img'),previewX=document.querySelector('#preview-x'),device=document.querySelector('#device'),qrOverlay=document.querySelector('#qr-overlay'),qrImg=document.querySelector('#qr-img'),qrUrl=document.querySelector('#qr-url');let attached=null;function note(message,error=false){toast.textContent=message;toast.className='toast show'+(error?' error':'');clearTimeout(window.noteTimer);window.noteTimer=setTimeout(()=>toast.className='toast',1800)}async function post(body){const response=await fetch('/api/input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Could not send input');return data}async function postImage(){if(!attached)return false;const response=await fetch('/api/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:attached.name,base64:attached.data})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Could not send image');return data}function showPreview(blob){attached={data:null,name:blob.name||'photo'};const reader=new FileReader();reader.onload=()=>{attached.data=String(reader.result).split(',')[1];previewImg.src=String(reader.result);imgStrip.classList.add('show');attach.classList.add('has-image')};reader.readAsDataURL(blob)}function clearPreview(){attached=null;imgStrip.classList.remove('show');attach.classList.remove('has-image')}async function sendAll(action){const hasText=text.value.trim().length>0,hasImage=!!attached;if(!hasText&&!hasImage){note('Type something or attach a photo',true);text.focus();return}try{if(hasImage)await postImage();if(hasText)await post({text:text.value,action:action||'none'});clearPreview();text.value='';note('Sent to PC ✓')}catch(error){note(error.message,true)}finally{text.focus()}}async function sendKeyAction(action){try{if(action==='backspace'){await post({text:'',action});note('Backspace sent')}else{await post({text:'',action});note(action==='enter'?'Enter pressed':'Shift+Enter pressed')}text.focus()}catch(error){note(error.message,true)}finally{text.focus()}}send.onclick=()=>sendAll(null);attach.onclick=()=>fileInput.click();fileInput.onchange=()=>{if(fileInput.files&&fileInput.files[0])showPreview(fileInput.files[0]);fileInput.value=''};previewX.onclick=(e)=>{e.stopPropagation();clearPreview()};document.querySelectorAll('[data-key]').forEach(button=>button.onclick=()=>sendKeyAction(button.dataset.key));fetch('/api/info').then(r=>r.json()).then(i=>{document.querySelector('#pc').textContent=i.hostname;qrImg.src=i.qr||'';qrUrl.textContent=i.ip_url;if(!i.qr)qrImg.style.display='none'}).catch(()=>{document.querySelector('#pc').textContent='Offline';document.querySelector('.dot').style.background='#ef4444'});device.onclick=(e)=>{e.stopPropagation();qrOverlay.classList.add('show')};qrOverlay.onclick=(e)=>{qrOverlay.classList.remove('show');if(e.target===qrOverlay)return;device.focus()};document.addEventListener('keydown',e=>{if(e.key==='Escape')qrOverlay.classList.remove('show')});if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
</script></body></html>'''

ICON_192_B64 = "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"
ICON_512_B64 = "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"
MANIFEST = '{"name":"My Input","short_name":"My Input","start_url":"/","display":"standalone","background_color":"#eff6ff","theme_color":"#2563eb","lang":"en","icons":[{"src":"/icon/192.png","sizes":"192x192","type":"image/png"},{"src":"/icon/512.png","sizes":"512x512","type":"image/png"},{"src":"/icon/512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}'
SERVICE_WORKER = "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());"


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "MyInput/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Do not emit noisy request logs in silent boot mode.
        if os.environ.get("MY_INPUT_DEBUG") == "1":
            super().log_message(fmt, *args)

    def send_json(self, data: dict[str, Any], status: int = 200) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(raw)

    def send_text(self, value: str, content_type: str) -> None:
        raw = value.encode("utf-8")
        self.send_response(200); self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw))); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store"); self.send_header("Pragma", "no-cache")
        self.end_headers(); self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/": self.send_text(HTML, "text/html; charset=utf-8")
        elif path in ("/health", "/api/info"): self.send_json(info_payload())
        elif path == "/manifest.webmanifest": self.send_text(MANIFEST, "application/manifest+json; charset=utf-8")
        elif path == "/icon/192.png" or path == "/icon/512.png":
            b64 = ICON_192_B64 if "192" in path else ICON_512_B64
            raw = base64.b64decode(b64)
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(raw)
        elif path == "/sw.js": self.send_text(SERVICE_WORKER, "application/javascript; charset=utf-8")
        else: self.send_json({"status": "error", "error": "Not found"}, 404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/image":
            self.handle_image()
            return
        if parsed.path not in ("/api/input", "/input"):
            self.send_json({"status": "error", "error": "Not found"}, 404); return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000: raise ValueError("Text is too large")
            raw = self.rfile.read(length)
            content_type = self.headers.get("Content-Type", "").lower()
            query = urllib.parse.parse_qs(parsed.query)
            if "application/json" in content_type:
                body = json.loads(raw.decode("utf-8") or "{}")
                if not isinstance(body, dict): raise ValueError("JSON object expected")
            elif "application/x-www-form-urlencoded" in content_type:
                form = urllib.parse.parse_qs(raw.decode("utf-8"), keep_blank_values=True)
                body = {key: values[-1] for key, values in form.items()}
            else:
                body = {"text": raw.decode("utf-8")}
            text = body.get("text", "")
            if not isinstance(text, str): raise ValueError("text must be a string")
            action = query.get("action", [body.get("action", "none")])[-1]
            if body.get("shift_enter") is True: action = "shift_enter"
            elif body.get("press_enter") is True: action = "enter"
            if action not in VALID_ACTIONS: raise ValueError("Invalid action")
            if not text and action == "none": raise ValueError("Text or a standalone key action is required")
            execute_input(text, action)
            self.send_json({"status": "ok", "typed": text, "action": action})
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self.send_json({"status": "error", "error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"status": "error", "error": f"Input failed: {exc}"}, 500)

    def handle_image(self) -> None:
        """Receive a base64 photo, paste it into the clipboard, and press Ctrl+V."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 10_000_000: raise ValueError("Image is too large")
            raw = self.rfile.read(length)
            body = json.loads(raw.decode("utf-8") or "{}")
            if not isinstance(body, dict): raise ValueError("JSON object expected")
            base64_data = body.get("base64", "")
            if not base64_data: raise ValueError("base64 image data is required")
            image_bytes = base64.b64decode(base64_data)
            if not image_bytes: raise ValueError("Image data is empty")
            png_path = normalize_image_to_png(image_bytes, "image/png")
            execute_input("", "image_only", png_path)
            self.send_json({"status": "ok", "image": png_path.name})
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self.send_json({"status": "error", "error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"status": "error", "error": f"Image failed: {exc}"}, 500)


def udp_discovery() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("", DISCOVERY_PORT))
        while True:
            data, sender = sock.recvfrom(512)
            if data.strip() == b"MY_INPUT_DISCOVER":
                sock.sendto(json.dumps({"app":"MyInput", "hostname":hostname(), "ip":lan_ip(), "port":DEFAULT_PORT, "url":f"http://{lan_ip()}:{DEFAULT_PORT}"}).encode(), sender)
    except OSError:
        return
    finally:
        sock.close()


def start_mdns_advertisement() -> tuple[Any, Any] | tuple[None, None]:
    """Advertise this PC as <hostname>.local for Android and other mDNS clients."""
    try:
        from zeroconf import ServiceInfo, Zeroconf  # type: ignore
        ip = lan_ip()
        if ip.startswith("127."):
            return None, None
        host = hostname().replace(" ", "-")
        service = ServiceInfo(
            type_="_http._tcp.local.",
            name=f"My Input ({host})._http._tcp.local.",
            addresses=[socket.inet_aton(ip)],
            port=DEFAULT_PORT,
            properties={"app": "MyInput", "path": "/"},
            server=f"{host}.local.",
        )
        zeroconf = Zeroconf()
        zeroconf.register_service(service, allow_name_change=True)
        return zeroconf, service
    except Exception:
        # The web server remains usable by IP if multicast is unavailable.
        return None, None


def run_server() -> None:
    global SERVER
    ok, message = bootstrap_dependencies()
    if not ok:
        raise RuntimeError(message)
    user_data_dir().mkdir(parents=True, exist_ok=True)
    pid_file().write_text(str(os.getpid()), encoding="ascii")
    SERVER = ThreadingHTTPServer(("0.0.0.0", DEFAULT_PORT), RequestHandler)
    threading.Thread(target=udp_discovery, daemon=True, name="MyInputDiscovery").start()
    mdns, service = start_mdns_advertisement()
    try:
        SERVER.serve_forever(poll_interval=0.4)
    finally:
        if mdns is not None and service is not None:
            try:
                mdns.unregister_service(service)
                mdns.close()
            except Exception:
                pass
        pid_file().unlink(missing_ok=True)
        SERVER.server_close()


def healthcheck() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{DEFAULT_PORT}/health", timeout=2) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def installed_script() -> Path:
    return user_data_dir() / "my_input.py"


def pythonw_path() -> str:
    candidate = Path(sys.executable).with_name("pythonw.exe")
    return str(candidate if candidate.exists() else sys.executable)


def configure_autostart(script: Path) -> None:
    import winreg
    command = f'"{pythonw_path()}" "{script}" --daemon'
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
    try: winreg.SetValueEx(key, "MyInput", 0, winreg.REG_SZ, command)
    finally: winreg.CloseKey(key)


def remove_autostart() -> None:
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
        try: winreg.DeleteValue(key, "MyInput")
        except FileNotFoundError: pass
        finally: winreg.CloseKey(key)
    except OSError: pass


def open_firewall(port: int) -> str:
    """Best-effort; lack of elevation is harmless and shown in the panel."""
    tcp = subprocess.run(["netsh", "advfirewall", "firewall", "add", "rule", "name=My Input Local Network", "dir=in", "action=allow", "protocol=TCP", f"localport={port}", "profile=private"], capture_output=True, text=True)
    mdns = subprocess.run(["netsh", "advfirewall", "firewall", "add", "rule", "name=My Input Hostname Discovery", "dir=in", "action=allow", "protocol=UDP", "localport=5353", "profile=private"], capture_output=True, text=True)
    return "Firewall rules ready" if tcp.returncode == 0 and mdns.returncode == 0 else "Allow My Input through Windows Firewall if your phone cannot connect"


def install_and_start() -> tuple[bool, str]:
    ok, message = bootstrap_dependencies()
    if not ok: return False, message
    folder = user_data_dir(); folder.mkdir(parents=True, exist_ok=True)
    target = installed_script()
    source = Path(__file__).resolve()
    if source != target: shutil.copy2(source, target)
    configure_autostart(target)
    if not healthcheck():
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.Popen([pythonw_path(), str(target), "--daemon"], close_fds=True, creationflags=creationflags, cwd=str(folder))
        for _ in range(25):
            if healthcheck(): return True, "Installed and server is running. " + open_firewall(DEFAULT_PORT)
            time.sleep(0.2)
        return False, "Installed, but server did not answer on port " + str(DEFAULT_PORT)
    return True, "Auto-start is enabled and the server is already running. " + open_firewall(DEFAULT_PORT)


def stop_server() -> None:
    pid = pid_file()
    if pid.exists():
        try:
            process_id = int(pid.read_text(encoding="ascii").strip())
            # A forced shutdown or power loss can leave an old PID file behind.
            # Never kill an unrelated process whose Windows PID has since been reused.
            check = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 f"(Get-CimInstance Win32_Process -Filter 'ProcessId = {process_id}').CommandLine"],
                capture_output=True, text=True, timeout=5,
            )
            command_line = check.stdout.lower()
            if "my_input.py" in command_line and "--daemon" in command_line:
                subprocess.run(["taskkill", "/PID", str(process_id), "/T", "/F"], capture_output=True, timeout=8)
        except (ValueError, OSError, subprocess.SubprocessError): pass
    pid.unlink(missing_ok=True)


def launch_gui() -> None:
    try:
        import tkinter as tk
        from tkinter import messagebox
    except Exception:
        print(f"Open http://{lan_ip()}:{DEFAULT_PORT} after running: {sys.executable} {__file__} --install")
        return
    root = tk.Tk(); root.title("My Input — Setup"); root.geometry("610x420"); root.minsize(550, 390)
    bg = "#f0fdfa"; teal = "#0f766e"; root.configure(bg=bg)
    state = tk.StringVar(); urls = tk.StringVar()
    def refresh() -> None:
        running = healthcheck(); ip = lan_ip()
        state.set(("● Server running" if running else "○ Server stopped") + "\n" + ("Auto-start: enabled" if installed_script().exists() else "Not installed yet"))
        urls.set(f"Phone URL:  http://{hostname()}:{DEFAULT_PORT}\nFallback:  http://{ip}:{DEFAULT_PORT}")
    def install() -> None:
        good, msg = install_and_start(); refresh()
        (messagebox.showinfo if good else messagebox.showerror)("My Input", msg)
    def copy_url() -> None:
        root.clipboard_clear(); root.clipboard_append(f"http://{hostname()}:{DEFAULT_PORT}"); root.update(); messagebox.showinfo("My Input", "Phone URL copied. Open it in Chrome on your phone, then use Add to Home screen.")
    def uninstall() -> None:
        remove_autostart(); stop_server(); refresh(); messagebox.showinfo("My Input", "Auto-start was removed and the server was stopped.")
    tk.Label(root,text="My Input  |  মাই ইনপুট",font=("Segoe UI",22,"bold"),fg="#115e59",bg=bg).pack(pady=(25,8))
    tk.Label(root,textvariable=state,font=("Segoe UI",11),justify="center",fg="#334155",bg=bg).pack(pady=8)
    tk.Label(root,textvariable=urls,font=("Consolas",10),justify="left",fg="#134e4a",bg="#ffffff",relief="solid",bd=1,padx=15,pady=12).pack(padx=35,pady=10,fill="x")
    tk.Button(root,text="Install & Enable Auto-Start  (ইনস্টল ও অটো-স্টার্ট চালু করুন)",command=install,bg=teal,fg="white",font=("Segoe UI",11,"bold"),padx=12,pady=11).pack(pady=(12,6))
    row=tk.Frame(root,bg=bg); row.pack(pady=5)
    tk.Button(row,text="Copy Phone URL",command=copy_url,padx=14,pady=8).pack(side="left",padx=5)
    tk.Button(row,text="Stop / Uninstall Auto-Start",command=uninstall,padx=14,pady=8).pack(side="left",padx=5)
    refresh(); root.mainloop()


def main() -> None:
    parser = argparse.ArgumentParser(description="My Input")
    parser.add_argument("--daemon", action="store_true")
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--serve", action="store_true", help="Run server in this visible terminal")
    parser.add_argument("--gui", action="store_true", help="Show the setup window instead of starting silently")
    parser.add_argument("--stop", action="store_true", help="Stop the background server")
    args = parser.parse_args()
    if args.stop:
        stop_server()
        print("My Input server stopped.")
        raise SystemExit(0)
    if args.install:
        ok, msg = install_and_start(); print(msg); raise SystemExit(0 if ok else 1)
    if args.daemon or args.serve:
        run_server()
    elif args.gui:
        launch_gui()
    else:
        # Application mode: install silently and start the hidden server.
        ok, msg = install_and_start()
        if not ok:
            print(msg)
            print("Run the batch installer or `python my_input.py --gui` for help.")
            raise SystemExit(1)
        print(msg)
        print("My Input is running silently. To stop it: `python my_input.py --stop`.")


if __name__ == "__main__":
    main()
