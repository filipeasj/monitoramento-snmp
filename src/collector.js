const store = require('./store');
const { collectSample } = require('./snmpClient');
const { evaluateThresholds } = require('./alerts');

class Collector {
  constructor() {
    const samples = store.getSamples();
    this.latestSampleId = samples.length ? Number(samples[samples.length - 1].id) : 0;
    this.running = false;
    this.timer = null;
    this.generation = 0;
    this.inFlight = false;
    this.previousCounters = null;
    this.previousCounterTimestamp = null;
    this.thresholdState = { inBps: false, outBps: false, cpuPercent: false };
    this.lastError = null;
    this.lastErrorAt = null;
    this.lastCollectionAt = samples.length ? samples[samples.length - 1].collectedAt : null;
  }

  status() {
    return {
      running: this.running,
      latestSampleId: this.latestSampleId,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
      lastCollectionAt: this.lastCollectionAt
    };
  }

  start() {
    if (this.running) return this.status();
    this.running = true;
    this.generation += 1;
    const generation = this.generation;
    this.schedule(0, generation);
    return this.status();
  }

  pause() {
    this.running = false;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.status();
  }

  schedule(delayMs, generation) {
    if (!this.running || generation !== this.generation) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(generation), delayMs);
  }

  recordError(message) {
    const text = String(message || 'Erro desconhecido na coleta SNMP.');
    this.lastError = text;
    this.lastErrorAt = new Date().toISOString();
    // Registra apenas mudanças de erro para não gerar um evento por tentativa repetida.
    if (this._lastLoggedError !== text) {
      store.appendEvent({ type: 'collector-error', message: text, timestamp: this.lastErrorAt });
      this._lastLoggedError = text;
    }
  }

  clearErrorIfNeeded() {
    if (this.lastError) {
      store.appendEvent({
        type: 'collector-recovered',
        message: 'A coleta SNMP voltou a responder.',
        timestamp: new Date().toISOString()
      });
    }
    this.lastError = null;
    this.lastErrorAt = null;
    this._lastLoggedError = null;
  }

  async tick(generation) {
    if (!this.running || generation !== this.generation) return;
    if (this.inFlight) {
      this.schedule(Math.max(100, Number(store.getConfig().intervalSeconds) * 1000), generation);
      return;
    }

    const tickStartedAt = Date.now();
    this.inFlight = true;
    try {
      const config = store.getConfig();
      const result = await collectSample(config, this.previousCounters, this.previousCounterTimestamp);
      if (!this.running || generation !== this.generation) return;

      if (result.counterReadSucceeded && result.counters) {
        this.previousCounters = result.counters;
        this.previousCounterTimestamp = result.timestampMs;
      }

      const savedSample = store.appendSample(result.sample);
      this.latestSampleId = savedSample.id;
      this.lastCollectionAt = savedSample.collectedAt;

      if (result.sample.errors.length) {
        this.recordError(result.sample.errors.join(' | '));
      } else {
        this.clearErrorIfNeeded();
      }

      evaluateThresholds(savedSample, config, this.thresholdState);
    } catch (error) {
      if (this.running && generation === this.generation) this.recordError(error.message);
    } finally {
      this.inFlight = false;
      if (this.running && generation === this.generation) {
        const config = store.getConfig();
        const configuredIntervalMs = Number(config.intervalSeconds) * 1000;
        const elapsedSinceStartMs = Date.now() - tickStartedAt;
        const delayMs = Math.max(0, configuredIntervalMs - elapsedSinceStartMs);
        this.schedule(delayMs, generation);
      }
    }
  }

  configChanged() {
    if (this.running) {
      this.generation += 1;
      const generation = this.generation;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.schedule(0, generation);
    }
  }
}

module.exports = { Collector };
