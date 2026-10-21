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

  // PWA Install prompt event
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackpadRef = useRef<HTMLDivElement>(null);

  // Touch pointer tracking refs for zero-lag smooth movement
  const pointer1Ref = useRef<HTMLDivElement>(null);
  const pointer2Ref = useRef<HTMLDivElement>(null);

  // Touch gesture refs
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touch2StartRef = useRef<{ y: number } | null>(null);
  const isTouchMovedRef = useRef<boolean>(false);
  const touchStartTimeRef = useRef<number>(0);
  const moveThrottleRef = useRef<number | null>(null);
  const scrollThrottleRef = useRef<number | null>(null);

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

  // Determine clean PC display name (never showing raw 'localhost')
  const getDisplayName = (raw: string) => {
    if (!raw || raw.toLowerCase() === 'localhost' || raw.includes('127.0.0.1')) {
      return 'Windows PC';
    }
    return raw;
  };

  // Health check / LAN URL fetch
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
  }, [getApiUrl]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Auto-resize textarea with comfortable vertical height up to 5 lines
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // Min 72px, max 140px (~5 lines)
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 72), 140)}px`;
    }
  };

  // Send Text or Image
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Send attached image if any
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

    // Send text if any
    if (inputText.trim()) {
      const textToSend = inputText;
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '80px';
      }

      try {
        await fetch(getApiUrl('/api/input'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend, action: 'none' }),
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

  // Mouse Action
  const handleSendMouse = async (
    type: 'move' | 'click' | 'scroll',
    params: { dx?: number; dy?: number; button?: 'left' | 'right' } = {}
  ) => {
    try {
      await fetch(getApiUrl('/api/mouse'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...params }),
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

  // Zero-lag Touch Effect & Gestures
  const updatePointerPositions = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!trackpadRef.current) return;
    const rect = trackpadRef.current.getBoundingClientRect();

    if (e.touches.length >= 1 && pointer1Ref.current) {
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      pointer1Ref.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      pointer1Ref.current.style.opacity = '1';
    }

    if (e.touches.length >= 2 && pointer2Ref.current) {
      const x = e.touches[1].clientX - rect.left;
      const y = e.touches[1].clientY - rect.top;
      pointer2Ref.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      pointer2Ref.current.style.opacity = '1';
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    updatePointerPositions(e);
    touchStartTimeRef.current = Date.now();
    isTouchMovedRef.current = false;

    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touch2StartRef.current = null;
    } else if (e.touches.length === 2) {
      // 2-finger scroll anchor
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      touch2StartRef.current = { y: avgY };
      touchStartRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    updatePointerPositions(e);

    // 1-finger mouse cursor movement
    if (e.touches.length === 1 && touchStartRef.current) {
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - touchStartRef.current.x;
      const dy = currentY - touchStartRef.current.y;

      if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) {
        isTouchMovedRef.current = true;
      }

      touchStartRef.current = { x: currentX, y: currentY };

      if (!moveThrottleRef.current) {
        moveThrottleRef.current = window.setTimeout(() => {
          handleSendMouse('move', { dx: dx * 1.7, dy: dy * 1.7 });
          moveThrottleRef.current = null;
        }, 25);
      }
    }

    // 2-finger vertical scroll
    if (e.touches.length === 2 && touch2StartRef.current) {
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dy = avgY - touch2StartRef.current.y;

      if (Math.abs(dy) > 2) {
        isTouchMovedRef.current = true;
        touch2StartRef.current = { y: avgY };

        if (!scrollThrottleRef.current) {
          scrollThrottleRef.current = window.setTimeout(() => {
            handleSendMouse('scroll', { dy: dy * 1.2 });
            scrollThrottleRef.current = null;
          }, 40);
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) {
      if (pointer1Ref.current) pointer1Ref.current.style.opacity = '0';
      if (pointer2Ref.current) pointer2Ref.current.style.opacity = '0';
    } else if (e.touches.length === 1) {
      if (pointer2Ref.current) pointer2Ref.current.style.opacity = '0';
    }

    const duration = Date.now() - touchStartTimeRef.current;

    // Single finger quick tap = Left Click
    if (!isTouchMovedRef.current && duration < 240 && e.changedTouches.length === 1) {
      handleSendMouse('click', { button: 'left' });
    }

    // Two-finger tap = Right Click
    if (!isTouchMovedRef.current && duration < 280 && e.touches.length === 0 && e.changedTouches.length === 2) {
      handleSendMouse('click', { button: 'right' });
    }

    touchStartRef.current = null;
    touch2StartRef.current = null;
    isTouchMovedRef.current = false;
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

  return (
    <div className="h-[100dvh] w-full bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header Bar */}
      <header className="h-12 px-3.5 flex items-center justify-between border-b border-slate-900 bg-slate-950 shrink-0">
        {/* Brand & Connection Status */}
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
              alt="My Input Pc"
              className="w-7 h-7 rounded-full object-contain shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white leading-none">
                My Input Pc
              </span>
              <span className="text-[10px] text-slate-400 font-normal truncate max-w-[120px] mt-0.5">
                {status === 'connected' ? pcName : 'Offline'}
              </span>
            </div>
            {status === 'connected' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 ml-0.5 shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5 shrink-0" />
            )}
          </button>
        </div>

        {/* Right Tools: PWA Install, QR, Settings */}
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

          {/* QR Code Button */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 active:scale-95 transition-all"
            title="Scan QR Code to open on phone"
          >
            <QrCode className="w-4 h-4" />
          </button>

          {/* Settings / IP Button */}
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

      {/* Main Touchpad Area */}
      <main className="flex-1 flex flex-col p-2.5 min-h-0 gap-2">
        {/* Touchpad Surface with Real-time Moving Finger Indicator */}
        <div
          ref={trackpadRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="flex-1 w-full bg-slate-900/90 rounded-2xl border border-slate-800 touch-none flex flex-col items-center justify-center relative cursor-crosshair active:border-blue-500/50 transition-colors overflow-hidden"
        >
          {/* Real-time moving touch circle 1 */}
          <div
            ref={pointer1Ref}
            className="absolute top-0 left-0 w-8 h-8 -ml-4 -mt-4 rounded-full bg-blue-500/30 border-2 border-blue-400 pointer-events-none opacity-0 shadow-md shadow-blue-500/50 will-change-transform transition-opacity duration-150"
          />
          {/* Real-time moving touch circle 2 (for 2 fingers) */}
          <div
            ref={pointer2Ref}
            className="absolute top-0 left-0 w-8 h-8 -ml-4 -mt-4 rounded-full bg-cyan-500/30 border-2 border-cyan-400 pointer-events-none opacity-0 shadow-md shadow-cyan-500/50 will-change-transform transition-opacity duration-150"
          />

          <div className="flex flex-col items-center gap-1 pointer-events-none text-slate-500 text-xs">
            <div className="w-12 h-1 rounded-full bg-slate-800 mb-1" />
            <span className="font-medium tracking-wide">Touchpad</span>
            <span className="text-[10px] text-slate-600">
              1-finger glide · 2-finger scroll
            </span>
          </div>
        </div>

        {/* Physical Mouse Buttons L / R */}
        <div className="grid grid-cols-2 gap-2 h-12 shrink-0">
          <button
            type="button"
            onClick={() => handleSendMouse('click', { button: 'left' })}
            className="rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm font-semibold active:bg-blue-600 active:text-white active:scale-[0.98] transition-all flex items-center justify-center shadow-xs"
          >
            L
          </button>
          <button
            type="button"
            onClick={() => handleSendMouse('click', { button: 'right' })}
            className="rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm font-semibold active:bg-blue-600 active:text-white active:scale-[0.98] transition-all flex items-center justify-center shadow-xs"
          >
            R
          </button>
        </div>
      </main>

      {/* Keyboard Shortcut Icon Bar (Right-aligned, small, without Esc/Tab) */}
      <section className="px-2.5 pb-2 flex items-center justify-end gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => handleSendKey('space')}
          className="h-8 px-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold active:bg-slate-800 active:scale-95 transition-all flex items-center justify-center"
          title="Space"
        >
          ␣
        </button>
        <button
          type="button"
          onClick={() => handleSendKey('backspace')}
          className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 active:bg-slate-800 active:scale-95 transition-all flex items-center justify-center"
          title="Backspace"
        >
          <Delete className="w-3.5 h-3.5" />
        </button>

        {/* Distinct Control+Enter Button */}
        <button
          type="button"
          onClick={() => handleSendKey('ctrl_enter')}
          className="h-8 px-2.5 rounded-lg bg-slate-900 border border-blue-500/40 text-blue-400 font-semibold text-xs active:bg-blue-600 active:text-white active:scale-95 transition-all flex items-center justify-center gap-1 shadow-xs"
          title="Control + Enter"
        >
          <span className="text-[10px] font-mono font-bold bg-blue-500/20 px-1 py-0.5 rounded leading-none">
            Ctrl
          </span>
          <CornerDownLeft className="w-3 h-3" />
        </button>

        <button
          type="button"
          onClick={() => handleSendKey('enter')}
          className="h-8 px-3 rounded-lg bg-blue-600 text-white font-semibold active:bg-blue-700 active:scale-95 transition-all flex items-center justify-center"
          title="Enter"
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* Spacious Input Card with Image & Send inside */}
      <footer className="w-full p-2.5 pb-safe bg-slate-950 border-t border-slate-900 shrink-0">
        {/* Image Preview Thumbnail if attached */}
        {attachedImage && (
          <div className="mb-2 relative inline-flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800">
            <img
              src={attachedImage.url}
              alt="Selected"
              className="w-10 h-10 object-cover rounded-lg"
            />
            <div className="flex flex-col text-xs pr-5">
              <span className="text-slate-200 font-medium text-[11px]">Photo Attached</span>
              <span className="text-[10px] text-slate-400">Pastes to PC Clipboard</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Unified Input Card */}
        <form onSubmit={handleSend} className="relative w-full rounded-2xl bg-slate-900 border-2 border-slate-800 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-inner">
          {/* Textarea with comfortable vertical space and multi-line support up to 5 lines */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            placeholder="Type or voice dictate text here..."
            rows={2}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            className="w-full min-h-[72px] max-h-[140px] p-3 pb-11 bg-transparent text-slate-100 placeholder-slate-500 text-base outline-none resize-none overflow-y-auto leading-relaxed select-text"
          />

          {/* Inside Bottom Left: Image Icon */}
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
            className="absolute bottom-2 left-2.5 h-8 w-8 rounded-lg bg-slate-800/80 text-slate-400 hover:text-blue-400 active:scale-95 transition-all flex items-center justify-center"
            title="Attach photo to paste to PC"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          {/* Inside Bottom Right: Small Send Icon */}
          <button
            type="submit"
            onMouseDown={(e) => e.preventDefault()}
            disabled={!inputText.trim() && !attachedImage}
            className="absolute bottom-2 right-2.5 h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm shadow-blue-600/30 hover:bg-blue-500"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* QR Code Modal for Phone Camera Scanning */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-800 flex flex-col gap-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold">Scan to Open on Phone</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-white rounded-2xl shadow-md">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(
                    lanUrl || window.location.href
                  )}`}
                  alt="QR Code"
                  className="w-48 h-48 rounded-lg"
                />
              </div>

              <p className="text-xs text-slate-400 text-center leading-relaxed">
                Scan with your phone camera to open on mobile without typing any IP address!
              </p>

              <div className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                <span className="truncate">{lanUrl || window.location.href}</span>
                <button
                  type="button"
                  onClick={copyUrlToClipboard}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Copy URL"
                >
                  {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings & IP Reconnect Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-800 flex flex-col gap-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">Server Connection & IP</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {status === 'offline' && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Could not reach PC server. If your Wi-Fi IP changed, enter your computer&apos;s new IP below.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400 font-medium">PC Server Address</label>
              <input
                type="text"
                value={tempHost}
                onChange={(e) => setTempHost(e.target.value)}
                placeholder="e.g. http://192.168.1.5:3000 or http://localhost:5000"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-500">
                Leave blank if accessing directly from PC.
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-200">Unified Project Architecture</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                This app runs directly on your computer via <code>npm start</code> or <code>npm run dev</code>. The same server controls your PC and serves the mobile web app simultaneously.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveHost}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 active:scale-95 transition-all"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
