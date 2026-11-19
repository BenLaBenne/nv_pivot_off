// js/settings.js — paramètres localStorage

const DEFAULTS = {
  sounds: true,
  soundsVolume: 80,
  music: false,
  musicVolume: 40,
  theme: 'dark',
  animations: true,
  lang: 'fr',
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('pivot-settings');
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  localStorage.setItem('pivot-settings', JSON.stringify(s));
}

function applySettings(s) {
  // Thème
  document.documentElement.setAttribute('data-theme', s.theme);
  // Animations
  document.body.classList.toggle('no-animations', !s.animations);
  // Sons
  if (window.Sounds) {
    Sounds.setSoundsEnabled(s.sounds);
    Sounds.setSoundsVolume(s.soundsVolume / 100);
    Sounds.setMusicEnabled(s.music);
    Sounds.setMusicVolume(s.musicVolume / 100);
  }
  // Langue (placeholder : le FR est l'unique langue packagée pour l'instant)
  document.documentElement.lang = s.lang;
}

let currentSettings = loadSettings();
applySettings(currentSettings);

function updateSetting(key, value) {
  currentSettings[key] = value;
  saveSettings(currentSettings);
  applySettings(currentSettings);
}

function getSettings() { return currentSettings; }

// Bind UI
function bindSettingsUI() {
  const s = currentSettings;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const check = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

  check('setting-sounds', s.sounds);
  set('setting-sounds-volume', s.soundsVolume);
  check('setting-music', s.music);
  set('setting-music-volume', s.musicVolume);
  set('setting-theme', s.theme);
  check('setting-animations', s.animations);
  set('setting-lang', s.lang);

  document.getElementById('setting-sounds').onchange = (e) => updateSetting('sounds', e.target.checked);
  document.getElementById('setting-sounds-volume').oninput = (e) => updateSetting('soundsVolume', parseInt(e.target.value, 10));
  document.getElementById('setting-music').onchange = (e) => updateSetting('music', e.target.checked);
  document.getElementById('setting-music-volume').oninput = (e) => updateSetting('musicVolume', parseInt(e.target.value, 10));
  document.getElementById('setting-theme').onchange = (e) => updateSetting('theme', e.target.value);
  document.getElementById('setting-animations').onchange = (e) => updateSetting('animations', e.target.checked);
  document.getElementById('setting-lang').onchange = (e) => updateSetting('lang', e.target.value);
}

window.Settings = { loadSettings, saveSettings, applySettings, updateSetting, getSettings, bindSettingsUI };
