import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA 安裝提示 hook
 * - 偵測是否可安裝
 * - 提供安裝觸發函數
 * - 偵測是否已在 standalone 模式（已安裝）
 * - 偵測離線狀態
 */
export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // 偵測是否已安裝（standalone 模式）
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // 偵測 iOS Safari
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isiOS);

    // 攔截 beforeinstallprompt（Android Chrome / Desktop Chrome）
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // 離線偵測
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 已安裝偵測
    const handleInstalled = () => setIsInstalled(true);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
    return outcome === 'accepted';
  }, [installPrompt]);

  return {
    /** 是否可以顯示安裝按鈕（Android/Desktop Chrome） */
    canInstall: !!installPrompt && !isInstalled,
    /** 是否是 iOS（需要手動引導安裝） */
    isIOS: isIOS && !isInstalled,
    /** 是否已安裝為 standalone App */
    isInstalled,
    /** 是否離線 */
    isOffline,
    /** 觸發安裝對話框 */
    triggerInstall,
  };
}
