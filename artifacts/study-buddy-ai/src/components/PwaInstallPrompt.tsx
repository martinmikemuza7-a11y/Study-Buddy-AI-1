import { useEffect, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    let reloading = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          `${import.meta.env.BASE_URL}sw.js`,
          { scope: import.meta.env.BASE_URL },
        );

        if (registration.waiting) setWaitingWorker(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(worker);
            }
          });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
      } catch (error) {
        console.error('[PWA] Service worker registration failed:', error);
      }
    };

    void register();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    setInstalling(true);

    const event = installEvent as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };

    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } finally {
      setInstallEvent(null);
      setInstalling(false);
    }
  };

  const update = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    setWaitingWorker(null);
  };

  if (waitingWorker) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-emerald-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 text-emerald-700" size={20} />
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Study Buddy AI has an update</p>
            <p className="mt-1 text-sm text-slate-600">Update when you are ready. The current page is not refreshed automatically until you choose to update.</p>
            <button onClick={update} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white">
              Update now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-amber-200 bg-white p-3 shadow-xl" role="status">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <WifiOff size={18} className="text-amber-700" />
          <span><strong>Offline.</strong> Only locally available app content can be used. Changes that require the server will not be submitted.</span>
          <button aria-label="Dismiss offline message" onClick={() => setDismissed(true)} className="ml-auto text-slate-400"><X size={18} /></button>
        </div>
      </div>
    );
  }

  if (dismissed || installed) return null;

  if (installEvent) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-emerald-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 text-emerald-700" size={20} />
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Install Study Buddy AI</p>
            <p className="mt-1 text-sm text-slate-600">Install the web app for faster access and a standalone study window.</p>
            <button disabled={installing} onClick={install} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              {installing ? 'Opening…' : 'Install Study Buddy AI'}
            </button>
          </div>
          <button aria-label="Dismiss install prompt" onClick={() => setDismissed(true)} className="text-slate-400"><X size={18} /></button>
        </div>
      </div>
    );
  }

  if (ios) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-emerald-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 text-emerald-700" size={20} />
          <div className="flex-1 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Add Study Buddy AI to Home Screen</p>
            <p className="mt-1">In Safari or another supported iOS browser, use Share → Add to Home Screen. iOS does not expose the Chromium <code>beforeinstallprompt</code> event.</p>
          </div>
          <button aria-label="Dismiss install instructions" onClick={() => setDismissed(true)} className="text-slate-400"><X size={18} /></button>
        </div>
      </div>
    );
  }

  return null;
}
