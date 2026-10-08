// A small bell chime synthesised with the Web Audio API — no audio files, no third-party service.
// Browsers only allow sound after the user has interacted with the page, so the first chime
// may be silent; that's expected and harmless. The user can turn the sound off (remembered
// in this browser only).

const PREF_KEY = 'atlas.bellSound';
let context = null;

export function soundEnabled() {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable — the choice lasts for this page only */
  }
}

function audioContext() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  return context;
}

// Two soft, decaying bell partials, struck twice — a gentle "ding-ding".
export function playChime() {
  if (!soundEnabled()) return;
  const ctx = audioContext();
  if (!ctx) return;
  const strike = (at, base) => {
    for (const [ratio, gain] of [
      [1, 0.16],
      [2.76, 0.05],
      [5.4, 0.02],
    ]) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      amp.gain.setValueAtTime(0.0001, at);
      amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      osc.connect(amp).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.95);
    }
  };
  const play = () => {
    const now = ctx.currentTime + 0.02;
    strike(now, 1318.5); // E6
    strike(now + 0.16, 1568); // G6
  };
  // A suspended context (no user gesture yet) simply stays silent.
  if (ctx.state === 'suspended') ctx.resume().then(play).catch(() => {});
  else play();
}
