const DEFAULT_CONFIG = {
  routerHost: '',
  snmpVersion: '2c',
  snmpPort: 161,
  timeoutMs: 3000,
  community: '',
  interfaceIndex: 1,
  intervalSeconds: 5,
  cpuOid: '1.3.6.1.2.1.25.3.3.1.2',
  thresholdInBps: null,
  thresholdOutBps: null,
  thresholdCpuPercent: null,
  alertPopup: true,
  alertEmail: false,
  emailTo: '',
  v3: {
    username: '',
    securityLevel: 'authPriv',
    authProtocol: 'sha',
    authKey: '',
    privProtocol: 'aes',
    privKey: '',
    context: ''
  }
};

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function optionalNumber(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`O parâmetro ${name} precisa ser um número entre ${min} e ${max}.`);
  }
  return parsed;
}

function normalizeAndValidateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('A configuração recebida é inválida.');
  }

  const v3Input = input.v3 && typeof input.v3 === 'object' ? input.v3 : {};
  const config = {
    ...DEFAULT_CONFIG,
    ...input,
    v3: { ...DEFAULT_CONFIG.v3, ...v3Input }
  };

  config.routerHost = String(config.routerHost || '').trim();
  if (!config.routerHost) throw new Error('Informe o endereço do roteador.');

  if (!['1', '2c', 'v3'].includes(String(config.snmpVersion))) {
    throw new Error('Selecione SNMPv1, SNMPv2c ou SNMPv3.');
  }
  config.snmpVersion = String(config.snmpVersion);
  config.snmpPort = Number(config.snmpPort);
  if (!Number.isInteger(config.snmpPort) || config.snmpPort < 1 || config.snmpPort > 65535) {
    throw new Error('A porta SNMP deve ser um inteiro entre 1 e 65535.');
  }
  config.timeoutMs = Number(config.timeoutMs);
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 500 || config.timeoutMs > 120000) {
    throw new Error('O timeout deve ficar entre 500 e 120000 milissegundos.');
  }

  config.interfaceIndex = Number(config.interfaceIndex);
  if (!Number.isInteger(config.interfaceIndex) || config.interfaceIndex < 1) {
    throw new Error('O índice da interface deve ser um inteiro maior que zero.');
  }

  config.intervalSeconds = Number(config.intervalSeconds);
  if (!Number.isFinite(config.intervalSeconds) || config.intervalSeconds <= 0) {
    throw new Error('O intervalo de coleta deve ser maior que zero.');
  }
  config.cpuOid = String(config.cpuOid || '').trim().replace(/^\./, '');
  if (!/^\d+(\.\d+)*$/.test(config.cpuOid)) {
    throw new Error('Informe um OID de CPU válido, contendo apenas números e pontos.');
  }

  config.thresholdInBps = optionalNumber(config.thresholdInBps, 'threshold de tráfego IN');
  config.thresholdOutBps = optionalNumber(config.thresholdOutBps, 'threshold de tráfego OUT');
  config.thresholdCpuPercent = optionalNumber(config.thresholdCpuPercent, 'threshold de CPU', { min: 0, max: 100 });
  config.alertPopup = Boolean(config.alertPopup);
  config.alertEmail = Boolean(config.alertEmail);
  config.emailTo = String(config.emailTo || '').trim();
  if (config.emailTo && !isValidEmail(config.emailTo)) {
    throw new Error('O endereço de e-mail não está em um formato válido.');
  }
  if (config.alertEmail && !isValidEmail(config.emailTo)) {
    throw new Error('Informe um endereço de e-mail válido para receber alertas.');
  }
  if (config.snmpVersion !== 'v3' && !String(config.community || '').trim()) {
    throw new Error('Informe a comunidade SNMP de leitura.');
  }
  config.community = String(config.community || '');

  config.v3.username = String(config.v3.username || '').trim();
  config.v3.securityLevel = String(config.v3.securityLevel || 'authPriv');
  config.v3.authProtocol = String(config.v3.authProtocol || 'sha');
  config.v3.authKey = String(config.v3.authKey || '');
  config.v3.privProtocol = String(config.v3.privProtocol || 'aes');
  config.v3.privKey = String(config.v3.privKey || '');
  config.v3.context = String(config.v3.context || '');
  if (config.snmpVersion === 'v3') {
    if (!config.v3.username) throw new Error('Informe o usuário SNMPv3.');
    if (!['noAuthNoPriv', 'authNoPriv', 'authPriv'].includes(config.v3.securityLevel)) {
      throw new Error('Nível de segurança SNMPv3 inválido.');
    }
    if (!['md5', 'sha'].includes(config.v3.authProtocol)) {
      throw new Error('Protocolo de autenticação SNMPv3 inválido.');
    }
    if (!['des', 'aes'].includes(config.v3.privProtocol)) {
      throw new Error('Protocolo de privacidade SNMPv3 inválido.');
    }
    if (config.v3.securityLevel !== 'noAuthNoPriv' && !config.v3.authKey) {
      throw new Error('Informe a chave de autenticação SNMPv3.');
    }
    if (config.v3.securityLevel === 'authPriv' && !config.v3.privKey) {
      throw new Error('Informe a chave de privacidade SNMPv3.');
    }
  }

  return config;
}

module.exports = { DEFAULT_CONFIG, normalizeAndValidateConfig, isValidEmail };
