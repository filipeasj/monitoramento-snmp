const test = require('node:test');
const assert = require('node:assert/strict');
const { computeRateBps, toCounterBigInt } = require('../src/metrics');

test('converte diferença de bytes em bits por segundo usando o tempo real', () => {
  const result = computeRateBps(1250n, 1125n, 5, 1_000_000_000);
  assert.equal(result.value, 200);
  assert.equal(result.reason, null);
});

test('primeira leitura estabelece baseline e não inventa uma taxa', () => {
  const result = computeRateBps(1000n, null, 5);
  assert.equal(result.value, null);
  assert.equal(result.reason, 'baseline');
});

test('contador menor do que a leitura anterior é tratado como reinicialização', () => {
  const result = computeRateBps(50n, 500n, 5);
  assert.equal(result.value, null);
  assert.equal(result.reason, 'counter-reset');
});

test('taxa acima da velocidade informada da interface não é aceita', () => {
  const result = computeRateBps(10_000n, 1_000n, 1, 10_000);
  assert.equal(result.value, null);
  assert.equal(result.reason, 'above-interface-speed');
});

test('contador SNMP em buffer de oito bytes é interpretado como Counter64', () => {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(1234567890123n);
  assert.equal(toCounterBigInt(value), 1234567890123n);
});
