// js/sounds.js — Web Audio API (sons générés) + musique ambient
// Aucun fichier son — tout est généré par oscillateurs.

// Initialiser les globals partagés (ce fichier est chargé en premier)
window.Views = window.Views || {};

let audioCtx = null;
let ambientAudio = null;
let soundsEnabled = true;
let musicEnabled = false;
let soundsVolume = 0.8;
let musicVolume = 0.4;

function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Audio API non supportée');
      return null;
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Joue un son simple : type parmi 'click','move','borne','virage','diagonale','tp','win','lose','rankup','chest_open','friend_request'
function playSound(type) {
  if (!soundsEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = soundsVolume;
  master.connect(ctx.destination);

  function tone(freq, dur, type = 'sine', startOffset = 0, vol = 1) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g);
    g.connect(master);
    const start = now + startOffset;
    g.gain.linearRampToValueAtTime(vol, start + 0.005);
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.start(start);
    osc.stop(start + dur);
  }
  function sweep(f1, f2, dur, type = 'sine', startOffset = 0, vol = 1) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, now + startOffset);
    osc.frequency.linearRampToValueAtTime(f2, now + startOffset + dur);
    g.gain.value = 0;
    osc.connect(g);
    g.connect(master);
    g.gain.linearRampToValueAtTime(vol, now + startOffset + 0.005);
    g.gain.linearRampToValueAtTime(0, now + startOffset + dur);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + dur);
  }

  switch (type) {
    case 'click': tone(800, 0.05, 'square', 0, 0.3); break;
    case 'move': tone(500, 0.08, 'sine', 0, 0.4); break;
    case 'borne': tone(150, 0.15, 'sine', 0, 0.6); tone(120, 0.2, 'sine', 0.05, 0.4); break;
    case 'virage': sweep(400, 800, 0.15, 'sine', 0, 0.4); break;
    case 'diagonale': sweep(600, 1000, 0.18, 'sine', 0, 0.4); break;
    case 'tp': sweep(1000, 200, 0.2, 'sawtooth', 0, 0.4); break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'sine', i * 0.1, 0.5));
      break;
    case 'lose':
      [400, 300, 200].forEach((f, i) => tone(f, 0.25, 'triangle', i * 0.15, 0.5));
      break;
    case 'rankup':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'sine', i * 0.08, 0.6));
      break;
    case 'chest_open':
      // Clinking
      for (let i = 0; i < 5; i++) tone(1200 + Math.random() * 600, 0.05, 'square', i * 0.06, 0.4);
      break;
    case 'friend_request':
      [880, 1100].forEach((f, i) => tone(f, 0.1, 'sine', i * 0.08, 0.4));
      break;
  }
}

function startAmbient() {
  if (!musicEnabled) return;
  if (ambientAudio) return;
  // Tenter de charger /assets/sounds/ambient.mp3
  ambientAudio = new Audio('/assets/sounds/ambient.mp3');
  ambientAudio.loop = true;
  ambientAudio.volume = musicVolume;
  ambientAudio.play().catch(() => {
    // Si le fichier n'existe pas, on génère un ambient synthétisé simple
    ambientAudio = null;
    startSynthAmbient();
  });
}

function startSynthAmbient() {
  const ctx = ensureAudio();
  if (!ctx) return;
  // Drone léger + notes espacées
  const master = ctx.createGain();
  master.gain.value = musicVolume * 0.5;
  master.connect(ctx.destination);
  // Drone
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 110; // A2
  const dg = ctx.createGain();
  dg.gain.value = 0.2;
  drone.connect(dg);
  dg.connect(master);
  drone.start();
  // Notes aléatoires
  function scheduleNote() {
    if (!musicEnabled) return;
    const notes = [220, 277, 330, 440, 554];
    const f = notes[Math.floor(Math.random() * notes.length)];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.value = 0;
    osc.connect(g);
    g.connect(master);
    g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.5);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
    osc.start();
    osc.stop(ctx.currentTime + 3);
    setTimeout(scheduleNote, 3000 + Math.random() * 5000);
  }
  scheduleNote();
  ambientAudio = { synth: true, drone, master };
}

function stopAmbient() {
  if (!ambientAudio) return;
  if (ambientAudio.pause) ambientAudio.pause();
  else if (ambientAudio.synth) {
    try { ambientAudio.master.gain.value = 0; ambientAudio.drone.stop(); } catch (e) {}
  }
  ambientAudio = null;
}

function setSoundsEnabled(v) { soundsEnabled = v; }
function setMusicEnabled(v) {
  musicEnabled = v;
  if (v) startAmbient();
  else stopAmbient();
}
function setSoundsVolume(v) { soundsVolume = v; }
function setMusicVolume(v) {
  musicVolume = v;
  if (ambientAudio && ambientAudio.volume !== undefined) ambientAudio.volume = v;
  else if (ambientAudio && ambientAudio.master) ambientAudio.master.gain.value = v * 0.5;
}

// Init au 1er click (autopolicy)
document.addEventListener('click', () => { ensureAudio(); }, { once: true });

window.Sounds = { playSound, setSoundsEnabled, setMusicEnabled, setSoundsVolume, setMusicVolume };
