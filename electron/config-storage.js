/**
 * Gespeicherte Server-URL in userData (easymeet-electron-config.json).
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_NAME = 'easymeet-electron-config.json';

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_NAME);
}

function readConfig() {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writeConfig(obj) {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

/**
 * @param {string} input
 * @returns {string} Normalisierte URL (href)
 */
function normalizeBaseUrl(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('INVALID_SCHEME');
  }
  return u.href;
}

function getSavedBaseUrl() {
  const v = readConfig().baseUrl;
  if (typeof v !== 'string' || !v.trim()) return null;
  try {
    return normalizeBaseUrl(v.trim());
  } catch {
    return null;
  }
}

function setSavedBaseUrl(urlOrEmpty) {
  const cfg = readConfig();
  if (!urlOrEmpty || !String(urlOrEmpty).trim()) {
    delete cfg.baseUrl;
  } else {
    cfg.baseUrl = normalizeBaseUrl(urlOrEmpty);
  }
  writeConfig(cfg);
  return cfg.baseUrl ?? null;
}

module.exports = {
  readConfig,
  getSavedBaseUrl,
  setSavedBaseUrl,
  normalizeBaseUrl,
};
