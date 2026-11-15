// Sounds, all synthesized with WebAudio: no audio files, no network. One
// AudioContext, created on the first user gesture, and one pre-made noise
// buffer reused by every shot, explosion and footstep. Each sound is a short
// oscillator/noise envelope; nothing is scheduled more than a second ahead.

export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function tone(freq, dur, type, gain, slideTo) {
    const c = ensure();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur + 0.02);
  }

  function noise(dur, gain, freq) {
    const c = ensure();
    if (!c || muted || !noiseBuf) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    shot(kind) {
      if (kind === 'sniper') { noise(0.28, 0.5, 900); tone(120, 0.22, 'sawtooth', 0.25, 40); }
      else if (kind === 'smg') { noise(0.09, 0.28, 1800); tone(220, 0.07, 'square', 0.12, 90); }
      else if (kind === 'pistol') { noise(0.12, 0.32, 1400); tone(180, 0.09, 'square', 0.14, 70); }
      else { noise(0.14, 0.4, 1200); tone(160, 0.11, 'sawtooth', 0.2, 55); }
    },
    enemyShot(distance) {
      const gain = Math.max(0.05, 0.3 - distance * 0.008);
      noise(0.12, gain, 1000);
      tone(140, 0.09, 'sawtooth', gain * 0.5, 50);
    },
    dryClick() {
      tone(900, 0.04, 'square', 0.08);
    },
    reload() {
      tone(500, 0.05, 'square', 0.1);
      setTimeout(() => tone(350, 0.05, 'square', 0.1), 220);
    },
    hit() {
      tone(1200, 0.05, 'sine', 0.18);
    },
    kill() {
      tone(880, 0.08, 'sine', 0.2);
      setTimeout(() => tone(1320, 0.1, 'sine', 0.2), 80);
    },
    hurt() {
      tone(140, 0.15, 'sawtooth', 0.22, 70);
    },
    plantBeep() {
      tone(1000, 0.07, 'sine', 0.16);
    },
    defuseBeep() {
      tone(700, 0.07, 'sine', 0.16);
    },
    explosion() {
      noise(0.7, 0.7, 300);
      tone(70, 0.6, 'sine', 0.5, 30);
    },
    buy() {
      tone(660, 0.07, 'sine', 0.15);
      setTimeout(() => tone(990, 0.09, 'sine', 0.15), 70);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.2), i * 120));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.18), i * 130));
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
  };
}
