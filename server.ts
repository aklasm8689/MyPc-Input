import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import os from 'os';
import path from 'path';
import http from 'http';
import { exec, spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple in-memory receiver for active inputs
const recentEvents: Array<{ id: string; time: number; type: string; value: string }> = [];

// Clipboard history in-memory (on-demand checking for 0% idle CPU usage)
const clipboardHistory: Array<{ id: string; text: string; time: string }> = [];
let lastClipboardText = '';

function fetchCurrentClipboard(): Promise<string> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve('');
      return;
    }
    const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
if ([System.Windows.Forms.Clipboard]::ContainsText()) {
    [System.Windows.Forms.Clipboard]::GetText()
}
`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell.exe -NoProfile -STA -EncodedCommand ${encoded}`, { encoding: 'buffer' }, (err, stdout: any) => {
      if (err || !stdout) {
        resolve('');
        return;
      }
      const txt = Buffer.isBuffer(stdout) ? stdout.toString('utf8').trim() : stdout.toString().trim();
      resolve(txt || '');
    });
  });
}

app.get('/api/clipboard', async (_req: Request, res: Response) => {
  try {
    const currentText = await fetchCurrentClipboard();
    if (currentText && currentText !== lastClipboardText && currentText.length < 5000) {
      lastClipboardText = currentText;
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      clipboardHistory.unshift({
        id: Date.now().toString(),
        text: currentText,
        time: timeStr,
      });
      if (clipboardHistory.length > 30) clipboardHistory.pop();
    }
  } catch {}
  res.json({ items: clipboardHistory });
});

app.post('/api/clipboard/clear', async (_req: Request, res: Response) => {
  clipboardHistory.length = 0;
  try {
    const currentText = await fetchCurrentClipboard();
    lastClipboardText = currentText;
  } catch {
    lastClipboardText = '';
  }
  res.json({ status: 'ok' });
});

// Persistent background PowerShell worker for typing and keyboard actions
let pwshProcess: ChildProcess | null = null;

function initWindowsWorker() {
  if (process.platform === 'win32' && !pwshProcess) {
    try {
      pwshProcess = spawn('powershell.exe', ['-NoProfile', '-STA'], {
        windowsHide: true,
      });

      pwshProcess.on('error', (err) => {
        console.error('Persistent PowerShell worker error:', err);
        pwshProcess = null;
      });

      pwshProcess.on('exit', () => {
        pwshProcess = null;
      });

      pwshProcess.stdin?.write(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
\n`);
    } catch (e) {
      console.error('Failed to start persistent PowerShell worker:', e);
    }
  }
}

initWindowsWorker();

function executeWindowsAction(script: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(true);
      return;
    }
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell.exe -NoProfile -STA -EncodedCommand ${encoded}`, (err) => {
      resolve(!err);
    });
  });
}

// Helper to get primary LAN IP address
function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Health check / PC info endpoint with LAN IP
app.get(['/health', '/api/info', '/api/status'], (_req: Request, res: Response) => {
  const lanIp = getLanIp();
  res.json({
    status: 'ok',
    app: 'MyPc-Input',
    hostname: os.hostname(),
    platform: process.platform,
    ip: lanIp,
    port: PORT,
    lanUrl: `http://${lanIp}:${PORT}`,
  });
});

// Image upload and direct clipboard paste into Windows active window
app.post('/api/image', async (req: Request, res: Response) => {
  try {
    const { base64 = '', name = 'image.png' } = req.body;
    if (!base64) {
      res.status(400).json({ status: 'error', error: 'No image data provided' });
      return;
    }

    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `myinput_${Date.now()}.png`);
    await import('fs/promises').then(fs => fs.writeFile(tempFile, buffer));

    if (process.platform === 'win32') {
      const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("${tempFile.replace(/\\/g, '\\\\')}")
try {
  [System.Windows.Forms.Clipboard]::SetImage($img)
} finally {
  $img.Dispose()
}
Start-Sleep -Milliseconds 60
[System.Windows.Forms.SendKeys]::SendWait("^v")
`;
      await executeWindowsAction(script);
    }

    res.json({ status: 'ok', message: 'Image pasted to active window' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Text input endpoint
app.post('/api/input', async (req: Request, res: Response) => {
  try {
    const { text = '', action = 'none' } = req.body;
    recentEvents.unshift({
      id: Date.now().toString(),
      time: Date.now(),
      type: 'input',
      value: text ? `${text} (${action})` : action,
    });
    if (recentEvents.length > 50) recentEvents.pop();

    if (process.platform === 'win32') {
      if (text) {
        const escaped = text.replace(/`/g, '``').replace(/"/g, '`"');
        const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Set-Clipboard -Value "${escaped}"
Start-Sleep -Milliseconds 40
[System.Windows.Forms.SendKeys]::SendWait("^v")
`;
        await executeWindowsAction(script);
      }

      if (action === 'enter') {
        await executeWindowsAction(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
`);
      } else if (action === 'ctrl_enter') {
        await executeWindowsAction(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^{ENTER}")
`);
      } else if (action === 'shift_enter') {
        await executeWindowsAction(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("+{ENTER}")
`);
      } else if (action === 'backspace') {
        await executeWindowsAction(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{BACKSPACE}")
`);
      } else if (action === 'space') {
        await executeWindowsAction(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendVar(" ")
`);
      }
    }

    res.json({ status: 'ok', typed: text, action });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Single Key endpoint
app.post('/api/key', async (req: Request, res: Response) => {
  try {
    const { key } = req.body;
    recentEvents.unshift({
      id: Date.now().toString(),
      time: Date.now(),
      type: 'key',
      value: key,
    });
    if (recentEvents.length > 50) recentEvents.pop();

    if (process.platform === 'win32') {
      let winKey = '';
      if (key === 'enter') winKey = '{ENTER}';
      else if (key === 'ctrl_enter') winKey = '^{ENTER}';
      else if (key === 'shift_enter') winKey = '+{ENTER}';
      else if (key === 'backspace') winKey = '{BACKSPACE}';
      else if (key === 'space') winKey = ' ';
      else if (key === 'tab') winKey = '{TAB}';
      else if (key === 'esc') winKey = '{ESC}';
      else if (key === 'up') winKey = '{UP}';
      else if (key === 'down') winKey = '{DOWN}';
      else if (key === 'left') winKey = '{LEFT}';
      else if (key === 'right') winKey = '{RIGHT}';

      if (winKey) {
        await executeWindowsAction(`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${winKey}")
`);
      }
    }

    res.json({ status: 'ok', key });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Feed for the UI to monitor events
app.get('/api/events', (_req: Request, res: Response) => {
  res.json({ events: recentEvents });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = http.createServer(app);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MyPc-Input server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
