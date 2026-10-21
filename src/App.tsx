import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  CornerDownLeft,
  Delete,
  Send,
  Image as ImageIcon,
  Settings,
  X,
  Wifi,
  WifiOff,
  QrCode,
  Check,
  AlertTriangle,
  Smartphone,
  Copy,
  Keyboard,
  Sparkles,
  Clipboard,
  Trash2,
  Monitor,
  CheckSquare,
  Square,
  Power,
} from 'lucide-react';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [pcHost, setPcHost] = useState<string>(() => {
    return localStorage.getItem('my_input_pc_host') || '';
  });
  const [status, setStatus] = useState<'connected' | 'offline'>('connected');
  const [pcName, setPcName] = useState('My PC');
  const [lanUrl, setLanUrl] = useState('');

  // Desktop vs Mobile mode detection
  const [isDesktop, setIsDesktop] = useState(false);
  const [autoStart, setAutoStart] = useState(false);

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [tempHost, setTempHost] = useState(pcHost);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Attached image
  const [attachedImage, setAttachedImage] = useState<{ url: string; base64: string } | null>(null);
  const [isSendingImage, setIsSendingImage] = useState(false);

  // PC Clipboard History items
  const [clipboardItems, setClipboardItems] = useState<Array<{ id: string; text: string; time: string }>>([]);
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);

  // PWA Install prompt event
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Fetch auto-start status
  useEffect(() => {
    fetch('/api/autostart')
      .then(res => res.json())
      .then(data => setAutoStart(!!data.enabled))
      .catch(() => {});
  }, []);

  const toggleAutoStart = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setAutoStart(val);
    try {
      await fetch('/api/autostart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: val }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // PWA install listener
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsAppInstalled(true);
      setInstallPrompt(null);
    }
  };

  // API URL resolver
  const getApiUrl = useCallback(
    (endpoint: string) => {
      const base = pcHost.trim().replace(/\/+$/, '');
      return base ? `${base}${endpoint}` : endpoint;
    },
    [pcHost]
  );

  const getDisplayName = (raw: string) => {
    if (!raw || raw.toLowerCase() === 'localhost' || raw.includes('127.0.0.1')) {
      return 'Windows PC';
    }
    return raw;
  };

  // Health check & Clipboard items fetch
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/status'), { method: 'GET' });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus('connected');
        if (data.hostname) {
          setPcName(getDisplayName(data.hostname));
        } else {
          setPcName('Windows PC');
        }
        if (data.lanUrl) {
          setLanUrl(data.lanUrl);
        } else if (typeof window !== 'undefined') {
          setLanUrl(window.location.origin);
        }
      } else {
        setStatus('offline');
      }
    } catch {
      setStatus('offline');
    }

    try {
      const clipRes = await fetch(getApiUrl('/api/clipboard'), { method: 'GET' });
      if (clipRes.ok) {
        const clipData = await clipRes.json().catch(() => ({}));
        if (Array.isArray(clipData.items)) {
          setClipboardItems(clipData.items);
        }
      }
    } catch {}
  }, [getApiUrl]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleClearClipboard = async () => {
    try {
      await fetch(getApiUrl('/api/clipboard/clear'), { method: 'POST' });
      setClipboardItems([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 80), 160)}px`;
    }
  };

  const handleSend = async (e?: React.FormEvent, customAction = 'none') => {
    if (e) e.preventDefault();

    if (attachedImage) {
      setIsSendingImage(true);
      const imgData = attachedImage.base64;
      setAttachedImage(null);
      try {
        await fetch(getApiUrl('/api/image'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: imgData }),
        });
      } catch (err) {
        console.error('Image send failed:', err);
      } finally {
        setIsSendingImage(false);
      }
    }

    if (inputText.trim() || customAction !== 'none') {
      const textToSend = inputText;
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '80px';
      }

      try {
        await fetch(getApiUrl('/api/input'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend, action: customAction }),
        });
      } catch (err) {
        console.error('Text send failed:', err);
      }
    }
  };

  const handleSendKey = async (key: string) => {
    try {
      await fetch(getApiUrl('/api/key'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachedImage({
        url: result,
        base64: result,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const saveHost = () => {
    const clean = tempHost.trim().replace(/\/+$/, '');
    setPcHost(clean);
    localStorage.setItem('my_input_pc_host', clean);
    setShowSettings(false);
    checkStatus();
  };

  const copyUrlToClipboard = () => {
    const target = lanUrl || window.location.href;
    navigator.clipboard.writeText(target);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const copyClipItem = (id: string, text: string) => {
    const fallbackCopy = (str: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = str;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } catch (err) {}
      document.body.removeChild(textarea);
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }
      setCopiedClipId(id);
      setTimeout(() => setCopiedClipId(null), 2000);
    } catch (e) {
      fallbackCopy(text);
      setCopiedClipId(id);
      setTimeout(() => setCopiedClipId(null), 2000);
    }
  };

  // If accessed from PC Desktop screen, show PC Control Center Dashboard
  if (isDesktop) {
    const currentUrl = lanUrl || window.location.href;
    return (
      <div className="h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-8 flex flex-col gap-6 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <img src="/icon.png" alt="MyPc-Input" className="w-12 h-12 rounded-2xl object-contain shadow-md" />
              <div>
                <h1 className="text-xl font-extrabold text-white tracking-tight">MyPc-Input Control Center</h1>
                <p className="text-xs text-slate-400">Wireless Phone-to-PC Text & Clipboard Bridge</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Server Running</span>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="p-4 bg-white rounded-2xl shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}`}
                alt="QR Code"
                className="w-[200px] h-[200px] object-contain rounded-lg"
              />
            </div>
            <span className="text-xs text-slate-400 font-mono text-center bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 select-all">
              {currentUrl}
            </span>
          </div>

          {/* Auto-Start Checkbox Option */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">কম্পিউটার চালু হওয়ার সাথে সাথে চালু করতে চাই</span>
              <span className="text-xs text-slate-400">Start MyPc-Input automatically when Windows boots up</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={toggleAutoStart}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={copyUrlToClipboard}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedUrl ? 'Link Copied to Clipboard!' : 'Copy Connection Link'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mobile / Phone UI
  return (
    <div className="h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header Bar */}
      <header className="h-12 px-3.5 flex items-center justify-between border-b border-slate-900 bg-slate-950 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-1.5 py-1 text-left">
            <img
              src="/icon.png"
              alt="MyPc-Input"
              className="w-7 h-7 rounded-full object-contain shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white leading-none">
                MyPc-Input
              </span>
              <span className="text-[10px] text-slate-400 font-normal truncate max-w-[120px] mt-0.5">
                {status === 'connected' ? pcName : 'Offline'}
              </span>
            </div>
            {status === 'connected' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 ml-0.5 shrink-0 animate-pulse" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-rose-500 ml-0.5 shrink-0" />
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area: PC Clipboard History sync viewer */}
      <main className="flex-1 flex flex-col p-3.5 min-h-0 gap-3 overflow-y-auto relative">
        <div className="flex-1 flex flex-col rounded-2xl bg-slate-900/60 border border-slate-800 p-3.5 min-h-[200px] overflow-hidden shadow-inner relative">
          <div className="flex items-center justify-between mb-2.5 shrink-0">
            <span className="text-xs font-semibold tracking-wider uppercase text-slate-300 flex items-center gap-1.5">
              <Clipboard className="w-4 h-4 text-blue-400" />
              <span>PC Copied Clipboard Items</span>
            </span>
            {clipboardItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearClipboard}
                className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all flex items-center justify-center shadow-xs"
                title="Clear Clipboard History"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 no-scrollbar pb-16">
            {clipboardItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs gap-1.5">
                <Clipboard className="w-10 h-10 opacity-20 mb-1 text-blue-400" />
                <span className="text-slate-400 font-medium">No PC Clipboard items yet</span>
                <span className="text-[11px] text-slate-500">Anything you copy on your Windows PC will appear here automatically so you can copy it on your phone.</span>
              </div>
            ) : (
              clipboardItems.map((item) => (
                <div key={item.id} className="relative p-3.5 pr-14 rounded-xl bg-slate-900 border border-slate-800 text-xs shadow-xs group">
                  <div className="flex flex-col w-full min-w-0">
                    <span className="text-slate-200 font-normal break-words select-text whitespace-pre-wrap">{item.text}</span>
                    <span className="text-[10px] text-slate-500 font-mono mt-1.5">{item.time}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyClipItem(item.id, item.text)}
                    className="absolute top-2.5 right-2.5 h-8 w-8 rounded-lg bg-slate-800 text-slate-200 hover:bg-blue-600 hover:text-white active:scale-95 transition-all flex items-center justify-center shadow-xs"
                    title="Copy to phone clipboard"
                  >
                    {copiedClipId === item.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Floating D-Pad Arrow Keys (Floating over clipboard card, no background card) */}
        <div className="absolute bottom-6 right-6 z-20 grid grid-cols-3 gap-1.5 select-none pointer-events-auto">
          <div />
          <button
            type="button"
            onClick={() => handleSendKey('up')}
            className="h-10 w-11 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-slate-100 hover:bg-slate-800 active:bg-blue-600 active:text-white active:scale-95 transition-all flex items-center justify-center shadow-xl"
            title="Up Arrow"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <div />
          <button
            type="button"
            onClick={() => handleSendKey('left')}
            className="h-10 w-11 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-slate-100 hover:bg-slate-800 active:bg-blue-600 active:text-white active:scale-95 transition-all flex items-center justify-center shadow-xl"
            title="Left Arrow"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => handleSendKey('down')}
            className="h-10 w-11 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-slate-100 hover:bg-slate-800 active:bg-blue-600 active:text-white active:scale-95 transition-all flex items-center justify-center shadow-xl"
            title="Down Arrow"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => handleSendKey('right')}
            className="h-10 w-11 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-slate-100 hover:bg-slate-800 active:bg-blue-600 active:text-white active:scale-95 transition-all flex items-center justify-center shadow-xl"
            title="Right Arrow"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </main>

      {/* Keyboard Shortcut Bar (Clean Single Row without D-Pad) */}
      <section className="px-3 pb-2 flex items-center justify-between gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSendKey('tab')}
            className="h-9 px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold active:bg-slate-800 active:scale-95 transition-all flex items-center justify-center shadow-xs"
          >
            Tab
          </button>
          <button
            type="button"
            onClick={() => handleSendKey('esc')}
            className="h-9 px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold active:bg-slate-800 active:scale-95 transition-all flex items-center justify-center shadow-xs"
          >
            Esc
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSendKey('space')}
            className="h-9 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold active:bg-slate-800 active:scale-95 transition-all flex items-center justify-center shadow-xs"
            title="Space"
          >
            Space
          </button>
          <button
            type="button"
            onClick={() => handleSendKey('backspace')}
            className="h-9 px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 active:bg-slate-800 active:scale-95 transition-all flex items-center justify-center shadow-xs"
            title="Backspace"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleSend(undefined, 'ctrl_enter')}
            className="h-9 px-3 rounded-xl bg-slate-900 border border-blue-500/40 text-blue-400 font-semibold text-xs active:bg-blue-600 active:text-white active:scale-95 transition-all flex items-center justify-center gap-1 shadow-xs"
            title="Control + Enter"
          >
            <span className="text-[10px] font-mono font-bold bg-blue-500/20 px-1 py-0.5 rounded leading-none">Ctrl</span>
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSend(undefined, 'enter')}
            className="h-9 px-4 rounded-xl bg-blue-600 text-white font-semibold text-xs active:bg-blue-700 active:scale-95 transition-all flex items-center justify-center shadow-xs"
            title="Enter"
          >
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Spacious Input Footer Card with Copy & Icon-only Send button */}
      <footer className="w-full p-3 pb-safe bg-slate-950 border-t border-slate-900 shrink-0">
        {attachedImage && (
          <div className="mb-2.5 relative inline-flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
            <img
              src={attachedImage.url}
              alt="Selected"
              className="w-12 h-12 object-cover rounded-lg"
            />
            <div className="flex flex-col text-xs pr-6">
              <span className="text-slate-200 font-medium text-xs">Photo Attached</span>
              <span className="text-[10px] text-slate-400">Pastes instantly to PC Clipboard</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="absolute top-1 right-1 p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={(e) => handleSend(e, 'none')} className="relative w-full rounded-2xl bg-slate-900 border-2 border-slate-800 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-inner">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            placeholder="Type or dictate text to send to PC..."
            rows={2}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            className="w-full min-h-[80px] max-h-[160px] p-3.5 pb-12 pr-12 bg-transparent text-slate-100 placeholder-slate-500 text-base outline-none resize-none overflow-y-auto leading-relaxed select-text"
          />

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-2.5 left-2.5 h-9 w-9 rounded-xl bg-slate-800 text-slate-300 hover:text-blue-400 active:scale-95 transition-all flex items-center justify-center shadow-xs"
            title="Attach photo"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          {/* Icon-only Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() && !attachedImage}
            className="absolute bottom-2.5 right-2.5 h-9 w-9 rounded-xl bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center shadow-sm"
            title="Send to PC"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>
    </div>
  );
}
