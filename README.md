# 🖥️📱 MyPc-Input

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-19.0-blue.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/tailwindcss-4.3-38bdf8.svg)](https://tailwindcss.com/)

**MyPc-Input** is a lightning-fast, zero-lag wireless bridge that turns your mobile phone into a powerful wireless keyboard, text sender, image clipboard pusher, and remote controller for your Windows PC over local Wi-Fi.

---

## ✨ Key Features

- ⌨️ **Instant Wireless Typing**: Type text or voice-dictate on your phone and send it directly to your PC cursor position in real time.
- 📋 **PC Clipboard History Sync**: Anything copied on your Windows PC instantly syncs and appears as cards on your phone so you can easily copy it on mobile with 1-tap.
- 🖼️ **Image Clipboard Paste**: Capture or select photos from your phone gallery and paste them directly into active PC windows.
- 🎮 **Floating D-Pad & Keyboard Shortcuts**: Dedicated arrow keys (Up, Down, Left, Right), Enter, Space, Backspace, Tab, Esc, and Ctrl+Enter shortcuts right at your fingertips.
- 🌐 **LAN QR Code Pairing**: Scan the generated QR code with your phone camera to instantly connect over local Wi-Fi without typing IP addresses.
- 🚀 **1-Click Portable Launcher**: Double-click `start-background.bat` to launch the server in the background, create a desktop shortcut with custom icon, and auto-open the browser.

---

## 📥 Quick Start Guide (For Users)

1. Download or clone this repository and extract the ZIP.
2. Ensure [Node.js](https://nodejs.org/) is installed on your computer.
3. Double-click **`start-background.bat`**.
   - It will automatically install required dependencies.
   - Starts the background Node.js / Express server on port `5000`.
   - Creates a clean Desktop shortcut (`MyPc-Input.lnk`).
   - Opens your default browser automatically.
4. Click the **QR Code icon** in the top right, scan it with your phone camera, and start typing or syncing clipboard items instantly!

---

## 🛑 How to Stop & Cleanup

- Double-click **`stop-background.bat`**.
- This instantly stops the background server process and removes the desktop shortcut cleanly.

---

## 🛠️ Developer Setup & Architecture

If you want to run this project in development mode:

```bash
# Clone the repository
git clone https://github.com/aklasm7484/MyPc-Input.git

# Navigate to project directory
cd MyPc-Input

# Install dependencies
npm install

# Run development server
npm run dev
```

### Tech Stack
- **Backend**: Node.js, Express, TypeScript (`server.ts`), PowerShell automation (`System.Windows.Forms`).
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Lucide Icons (`src/App.tsx`).

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
