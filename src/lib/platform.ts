// Headset/browser detection shared by App (renderer defaults, XR store
// options) and GraphView (troika text workarounds).

export function isVisionProSafari() {
  if (typeof navigator === 'undefined' || navigator.xr == null) return false;

  return /Vision|visionOS|AppleVision/i.test(navigator.userAgent)
    || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export function isQuestBrowser() {
  return typeof navigator !== 'undefined' && /(OculusBrowser|Quest|Meta Quest)/i.test(navigator.userAgent);
}

export function shouldDefaultToWebGLForXR() {
  return typeof navigator !== 'undefined' && navigator.xr != null && (isQuestBrowser() || isVisionProSafari());
}
