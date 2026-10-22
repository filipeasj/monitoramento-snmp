function toCounterBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (Buffer.isBuffer(value)) {
    const text = value.toString('utf8').trim();
    if (/^\d+$/.test(text)) return BigInt(text);
    if (value.length === 8) return value.readBigUInt64BE(0);
    if (value.length === 4) return BigInt(value.readUInt32BE(0));
    throw new Error('O contador SNMP retornou um formato de bytes desconhecido.');
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^\d+$/.test(text)) throw new Error(`Contador SNMP inválido: ${text}`);
    return BigInt(text);
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.trunc(value));
  }
  throw new Error('O contador SNMP não é um número não negativo válido.');
}

function numericValue(value) {
  if (Buffer.isBuffer(value)) value = value.toString('utf8').trim();
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function computeRateBps(current, previous, elapsedSeconds, speedBps = null) {
  if (previous === null || previous === undefined) {
    return { value: null, reason: 'baseline' };
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { value: null, reason: 'invalid-interval' };
  }
  let currentCounter;
  let previousCounter;
  try {
    currentCounter = typeof current === 'bigint' ? current : toCounterBigInt(current);
    previousCounter = typeof previous === 'bigint' ? previous : toCounterBigInt(previous);
  } catch {
    return { value: null, reason: 'invalid-counter' };
  }
  if (currentCounter < previousCounter) {
    return { value: null, reason: 'counter-reset' };
  }
  const delta = currentCounter - previousCounter;
  const rate = (Number(delta) * 8) / elapsedSeconds;
  if (!Number.isFinite(rate) || rate < 0) {
    return { value: null, reason: 'invalid-rate' };
  }
  if (rate > 1e15) {
    return { value: null, reason: 'implausible-rate' };
  }
  if (Number.isFinite(speedBps) && speedBps > 0 && rate > speedBps * 1.25) {
    return { value: null, reason: 'above-interface-speed' };
  }
  return { value: rate, reason: null };
}

module.exports = { toCounterBigInt, numericValue, computeRateBps };
