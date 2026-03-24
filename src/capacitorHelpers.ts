/**
 * Capacitor helpers for native app integration.
 * These helpers gracefully degrade to web behavior when running in browser.
 */
import { Capacitor } from '@capacitor/core';

/** Check if running inside a native app (iOS/Android) */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Check specific platform */
export const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';
export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';

/**
 * Open a URL — in native app uses Capacitor Browser (in-app browser),
 * in web uses window.open.
 */
export const openUrl = async (url: string, options?: { windowName?: string; windowFeatures?: string }) => {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, toolbarColor: '#FAF8F5' });
  } else {
    window.open(url, options?.windowName || '_blank', options?.windowFeatures || '');
  }
};

/**
 * Open a payment URL (ECPay / LINE Pay) — in native uses in-app browser
 * that will redirect back when done.
 */
export const openPaymentUrl = async (url: string) => {
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({
      url,
      toolbarColor: '#FAF8F5',
      presentationStyle: 'popover',
    });
    // Listen for browser close to handle payment completion
    Browser.addListener('browserFinished', () => {
      // Payment window was closed — user can check order status
    });
  } else {
    const win = window.open(url, '付款', 'width=800,height=600');
    if (!win) {
      alert('無法開啟付款視窗，請檢查瀏覽器設定');
    }
  }
};

/**
 * Initialize native-specific features (StatusBar, SplashScreen, etc.)
 * Call this once on app startup.
 */
export const initNativeApp = async () => {
  if (!isNative()) return;

  try {
    // Configure status bar
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: '#FAF8F5' });
    }
  } catch (e) {
    console.log('StatusBar not available:', e);
  }

  try {
    // Hide splash screen (auto-hides after 2s, but can be explicit)
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (e) {
    console.log('SplashScreen not available:', e);
  }
};

/**
 * Trigger haptic feedback (for button taps, coupon unlock, etc.)
 */
export const hapticLight = async () => {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch { /* silent */ }
};

export const hapticMedium = async () => {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch { /* silent */ }
};

export const hapticSuccess = async () => {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch { /* silent */ }
};
