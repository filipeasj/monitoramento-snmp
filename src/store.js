const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_CONFIG } = require('./config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const SAMPLES_PATH = path.join(DATA_DIR, 'amostras.jsonl');
const EVENTS_PATH = path.join(DATA_DIR, 'eventos.jsonl');
let sampleCache = [];
let eventCache = [];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Não foi possível ler ${path.basename(file)}: ${error.message}`);
  }
}

function writeJsonAtomic(file, value) {
  const temporaryPath = `${file}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporaryPath, file);
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8').trim();
  if (!content) return [];
  return content.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Registro ${index + 1} inválido em ${path.basename(file)}: ${error.message}`);
    }
  });
}

function initStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) writeJsonAtomic(CONFIG_PATH, DEFAULT_CONFIG);
  if (!fs.existsSync(SAMPLES_PATH)) fs.writeFileSync(SAMPLES_PATH, '', 'utf8');
  if (!fs.existsSync(EVENTS_PATH)) fs.writeFileSync(EVENTS_PATH, '', 'utf8');
  sampleCache = readJsonLines(SAMPLES_PATH);
  eventCache = readJsonLines(EVENTS_PATH);
}

function getConfig() {
  const saved = readJson(CONFIG_PATH, DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...saved, v3: { ...DEFAULT_CONFIG.v3, ...(saved.v3 || {}) } };
}

function saveConfig(config) {
  writeJsonAtomic(CONFIG_PATH, config);
  return config;
}

function getSamples() {
  return sampleCache;
}

function appendSample(sample) {
  const id = sampleCache.length ? Number(sampleCache[sampleCache.length - 1].id) + 1 : 1;
  const saved = { id, ...sample };
  fs.appendFileSync(SAMPLES_PATH, `${JSON.stringify(saved)}\n`, 'utf8');
  sampleCache.push(saved);
  return saved;
}

function getEvents() {
  return eventCache;
}

function appendEvent(event) {
  const id = eventCache.length ? Number(eventCache[eventCache.length - 1].id) + 1 : 1;
  const saved = { id, createdAt: new Date().toISOString(), ...event };
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(saved)}\n`, 'utf8');
  eventCache.push(saved);
  return saved;
}

module.exports = { initStore, getConfig, saveConfig, getSamples, appendSample, getEvents, appendEvent };
