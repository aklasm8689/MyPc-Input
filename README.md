# 🖥️📱 MyPc-Input

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/react-19.0-blue.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/tailwindcss-4.3-38bdf8.svg)](https://tailwindcss.com/)
[![Windows](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078D6.svg)](https://microsoft.com/windows)
[![Installer Size](https://img.shields.io/badge/installer%20size-%3C%201%20MB-brightgreen.svg)](#)

**MyPc-Input** is an ultra-fast, lightweight wireless bridge that turns your mobile phone into a wireless keyboard, text sender, image clipboard pusher, and remote controller for your Windows PC over local Wi-Fi.

Packaged as an **ultra-lightweight Windows Application & Installer (< 1 MB)** with 100% offline QR pairing, native Dark Mode Control Center, and seamless system tray support!

---

## ✨ Key Features

- ⚡ **Ultra-Lightweight (< 1 MB Installer)**: Tiny installer size (~969 KB) and consumes only ~15 MB RAM (over 10x lighter than Electron or Chromium apps).
- 📶 **100% Offline QR Code Pairing**: Scan the live QR code directly from the Desktop Control Center to connect over local Wi-Fi. Powered by an embedded offline QR engine (zero internet required, zero external API latency).
- 🖥️ **Windows Desktop Control Center**: Clean Dark Mode GUI with live server status, one-click IP copy, browser launcher, start/stop toggle, and auto-start on boot configuration.
- ⌨️ **Instant Wireless Typing**: Type text or voice-dictate on your phone and send it directly to your PC cursor position in real time.
- 📋 **PC Clipboard History Sync**: Text copied on your Windows PC instantly syncs and appears as cards on your phone for 1-tap mobile copying.
- 🖼️ **Image Clipboard Paste**: Capture or select photos from your phone gallery and paste them directly into active PC windows.
- 🎮 **Floating D-Pad & Keyboard Shortcuts**: Dedicated arrow keys (Up, Down, Left, Right), Enter, Space, Backspace, Tab, Esc, and Ctrl+Enter shortcuts right at your fingertips.
- 🔕 **Background System Tray Mode**: Minimizing or closing the window parks it silently in the Windows System Tray (near the clock) so it keeps running without cluttering your taskbar.
- 🚀 **Official Windows Installer**: Installs with Desktop shortcut, Start Menu integration, Windows startup auto-run, and a registered uninstaller in Windows "Installed Applications" / Settings.

---

## 📥 How to Install & Use (For Users)

1. Download or run the installer: **[`MyPc-Input-Setup.exe`](MyPc-Input-Setup.exe)** (only ~969 KB).
2. Follow the 1-click setup — it automatically installs to your user directory (no admin rights required) and creates shortcuts.
3. Open **MyPc-Input** from your Desktop or Start Menu:
   - The Desktop Control Center opens and starts the server automatically on port `5000`.
   - An offline QR code is displayed right in the center.
4. Scan the QR code with your mobile phone camera (ensure your phone is connected to the same Wi-Fi network).
5. Start typing, sending keys, or copying clipboard items!
6. **Background Mode**: Closing the window (`X`) minimizes it directly to the Windows System Tray. Right-click the tray icon to re-open or quit anytime.

---

## 🏗️ Architecture & Project Structure

The project is structured with clean separation of concerns between the native Windows backend and the responsive React frontend:

```text
MyPc-Input/
├── native/                         # Native C# Backend & Desktop UI
│   ├── Program.cs                  # Entry point, single-instance mutex, autostart registry
│   ├── HttpServer.cs               # High-performance Winsock HTTP & API server
│   ├── MainForm.cs                 # Dark Mode Control Center GUI & system tray
│   ├── QrHelper.cs                 # 100% Offline pure C# QR code generator
│   ├── ClipboardManager.cs         # Windows clipboard history sync & listener
│   └── InputSimulator.cs           # Keystroke, text & image paste automation
│
├── lib/
│   └── QRCoder.dll                 # Embedded dependency for offline QR codes
│
├── src/                            # Responsive Mobile & Desktop Web Interface
│   ├── App.tsx                     # Virtual keyboard, D-pad, clipboard cards & modals
│   ├── main.tsx                    # React DOM entry
│   └── index.css                   # Tailwind CSS styling
│
├── public/                         # Web icons and static assets
├── installer.nsi                   # NSIS solid LZMA Windows installer script
├── build-installer.ps1             # 1-Click build script for frontend, native exe & setup
├── MyPc-Input-Setup.exe            # Ready-to-distribute standalone installer (< 1 MB)
├── app.ico                         # Multi-resolution Windows application icon
└── package.json                    # Minimal frontend scripts & dependencies
```

---

## 🛠️ Developer Setup & Building

### Prerequisites
- Node.js 18+ & npm
- Windows 10 or 11 (.NET Framework 4.0+ is built into Windows)

### Commands

```bash
# 1. Install frontend dependencies
npm install

# 2. Check TypeScript types
npm run lint

# 3. Run development web server (with hot reload)
npm run dev

# 4. Build Ultra-Lightweight Windows Installer (< 1 MB)
npm run build:installer
```

Running `npm run build:installer` builds the React frontend, compiles the native C# executable embedding all assets, and packages `MyPc-Input-Setup.exe` with solid LZMA compression in seconds.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
