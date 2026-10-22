const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, normalizeAndValidateConfig } = require('../src/config');

function validConfig(overrides = {}) {
  return normalizeAndValidateConfig({
    ...DEFAULT_CONFIG,
    routerHost: '192.0.2.1',
    snmpVersion: '2c',
    community: 'somente-leitura',
    interfaceIndex: 1,
    intervalSeconds: 5,
    v3: { ...DEFAULT_CONFIG.v3 },
    ...overrides
  });
}

test('aceita configuração básica válida e normaliza parâmetros numéricos', () => {
  const config = validConfig({ snmpPort: '161', intervalSeconds: '2.5', thresholdCpuPercent: '75' });
  assert.equal(config.snmpPort, 161);
  assert.equal(config.intervalSeconds, 2.5);
  assert.equal(config.thresholdCpuPercent, 75);
});

test('rejeita intervalo de coleta igual a zero', () => {
  assert.throws(() => validConfig({ intervalSeconds: 0 }), /intervalo de coleta deve ser maior que zero/i);
});

test('rejeita threshold de CPU acima de 100%', () => {
  assert.throws(() => validConfig({ thresholdCpuPercent: 101 }), /threshold de CPU/i);
});

test('valida formato do e-mail antes de salvar', () => {
  assert.throws(() => validConfig({ emailTo: 'endereco-invalido' }), /endereço de e-mail/i);
});

test('exige endereço de destino quando o alerta por e-mail está habilitado', () => {
  assert.throws(() => validConfig({ alertEmail: true, emailTo: '' }), /endereço de e-mail válido/i);
});
