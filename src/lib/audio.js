// ===== 音声 =====
let audioCtx = null;
export function beep(f, d, t = "sine") { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = t; o.frequency.value = f; g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + d); } catch (_) {} }
export function signalBeep(buy) { if (buy) { beep(880, 0.15); setTimeout(() => beep(1100, 0.2), 150); } else { beep(440, 0.15); setTimeout(() => beep(330, 0.25), 150); } }
export function alertBeep(up) { if (up) { beep(1320, 0.1); setTimeout(() => beep(1320, 0.1), 130); setTimeout(() => beep(1760, 0.3), 260); } else { beep(440, 0.1); setTimeout(() => beep(330, 0.1), 130); setTimeout(() => beep(220, 0.3), 260); } }

// ===== OS通知 =====
export let _notifGranted = false;
export async function initNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") { _notifGranted = true; }
  else if (Notification.permission !== "denied") {
    try { const p = await Notification.requestPermission(); _notifGranted = p === "granted"; } catch (_) {}
  }
}
export function sendOsNotification(title, body) {
  if (!_notifGranted) return;
  try { new Notification(title, { body }); } catch (_) {}
}
