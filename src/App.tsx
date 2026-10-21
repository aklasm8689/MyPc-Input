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
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [pcHost, setPcHost] = useState<string>(() => {
    return localStorage.getItem('my_input_pc_host') || '';
  });
  const [status, setStatus] = useState<'connected' | 'offline'>('connected');
  const [pcName, setPcName] = useState('My PC');
  const [lanUrl, setLanUrl] = useState('');

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

    // Fetch clipboard history from PC
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

  // Clear clipboard history on PC
  const handleClearClipboard = async () => {
    try {
      await fetch(getApiUrl('/api/clipboard/clear'), { method: 'POST' });
      setClipboardItems([]);
    } catch (err) {
      console.error(err);
    }
  };

  // Auto-resize textarea with comfortable vertical height up to 5 lines
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 80), 160)}px`;
    }
  };

  // Send Text or Image
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

  // Single Key Action
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

  // Image Selection from Phone Gallery
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

  return (
    <div className="h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header Bar */}
      <header className="h-12 px-3.5 flex items-center justify-between border-b border-slate-900 bg-slate-950 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTempHost(pcHost);
              setShowSettings(true);
            }}
            className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-900 transition-colors text-left"
            title="Click to view connection info"
          >
            <img
              src="/icon.png"
              alt="MyPcInput"
              className="w-7 h-7 rounded-full object-contain shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white leading-none">
                MyPcInput
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
          </button>
        </div>

        <div className="flex items-center gap-1">
          {installPrompt && !isAppInstalled && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
              title="Install as Phone App"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 active:scale-95 transition-all"
            title="Scan QR Code to open on phone"
          >
            <QrCode className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setTempHost(pcHost);
              setShowSettings(true);
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 active:scale-95 transition-all"
            title="Configure PC IP"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area: PC Clipboard History sync viewer with Floating D-Pad */}
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">PC Connection Settings</h3>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 text-xs text-slate-400">
              <span>PC IP Address or Host URL</span>
              <input
                type="text"
                value={tempHost}
                onChange={(e) => setTempHost(e.target.value)}
                placeholder="http://192.168.0.x:5000"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveHost}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs rounded-3xl bg-slate-900 border border-slate-800 p-6 flex flex-col items-center gap-4 text-center shadow-2xl">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-base font-bold text-white">Scan to Connect</h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-white rounded-2xl shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(lanUrl || window.location.href)}`}
                alt="QR Code"
                className="w-[180px] h-[180px] object-contain rounded-lg"
              />
            </div>

            <span className="text-xs text-slate-400 font-mono break-all px-2">
              {lanUrl || window.location.href}
            </span>

            <button
              type="button"
              onClick={copyUrlToClipboard}
              className="w-full h-11 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
            >
              {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedUrl ? 'Copied to Clipboard!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
