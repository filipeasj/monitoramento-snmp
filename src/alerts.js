const nodemailer = require('nodemailer');
const store = require('./store');

const METRICS = [
  { key: 'inBps', label: 'Tráfego de entrada (IN)', thresholdKey: 'thresholdInBps', unit: 'bps' },
  { key: 'outBps', label: 'Tráfego de saída (OUT)', thresholdKey: 'thresholdOutBps', unit: 'bps' },
  { key: 'cpuPercent', label: 'Utilização da CPU', thresholdKey: 'thresholdCpuPercent', unit: '%' }
];

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getMailerFromEnvironment() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) {
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true';
  const auth = process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS || ''
  } : undefined;
  return nodemailer.createTransport({ host, port, secure, auth });
}

async function sendEmailAlert(config, alert) {
  const transporter = getMailerFromEnvironment();
  if (!transporter) {
    throw new Error('SMTP não configurado. Preencha SMTP_HOST e SMTP_FROM no arquivo .env.');
  }
  const timeText = new Date(alert.timestamp).toLocaleString('pt-BR');
  const valueText = `${Number(alert.value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${alert.unit}`;
  const limitText = `${Number(alert.threshold).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${alert.unit}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: config.emailTo,
    subject: `[Monitoramento SNMP] Limite ultrapassado: ${alert.metricLabel}`,
    text: [
      'Um limite configurado foi ultrapassado durante a coleta SNMP.',
      `Métrica: ${alert.metricLabel}`,
      `Valor observado: ${valueText}`,
      `Limite: ${limitText}`,
      `Horário: ${timeText}`
    ].join('\n')
  });
}

function logAlertError(alert, message) {
  store.appendEvent({
    type: 'email-error',
    metric: alert.metric,
    metricLabel: alert.metricLabel,
    value: alert.value,
    threshold: alert.threshold,
    unit: alert.unit,
    timestamp: alert.timestamp,
    message: `Falha no envio de e-mail: ${message}`
  });
}

function evaluateThresholds(sample, config, state) {
  for (const metric of METRICS) {
    const threshold = config[metric.thresholdKey];
    const value = sample[metric.key];
    if (threshold === null || threshold === undefined || threshold === '') {
      state[metric.key] = false;
      continue;
    }
    if (!Number.isFinite(value)) continue;
    if (!config.alertPopup && !config.alertEmail) {
      state[metric.key] = false;
      continue;
    }

    const exceeded = value > Number(threshold);
    const wasExceeded = Boolean(state[metric.key]);
    state[metric.key] = exceeded;

    if (!exceeded || wasExceeded) continue;

    const alert = {
      metric: metric.key,
      metricLabel: metric.label,
      value,
      threshold: Number(threshold),
      unit: metric.unit,
      timestamp: sample.collectedAt
    };

    if (config.alertPopup) {
      store.appendEvent({ type: 'popup', ...alert });
    }
    if (config.alertEmail) {
      if (!isSmtpConfigured()) {
        logAlertError(alert, 'SMTP não configurado. Preencha SMTP_HOST e SMTP_FROM no arquivo .env.');
      } else {
        sendEmailAlert(config, alert).catch((error) => logAlertError(alert, error.message));
      }
    }
  }
}

module.exports = { evaluateThresholds };
