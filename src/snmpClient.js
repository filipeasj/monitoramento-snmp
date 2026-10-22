const snmp = require('net-snmp');
const { numericValue, toCounterBigInt, computeRateBps } = require('./metrics');

const OIDS = {
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6',
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
  ifHighSpeed: '1.3.6.1.2.1.31.1.1.1.15'
};

function createSession(config) {
  const options = {
    port: Number(config.snmpPort || 161),
    retries: 1,
    timeout: Number(config.timeoutMs || 3000),
    backoff: 1,
    transport: 'udp4'
  };

  if (config.snmpVersion === 'v3') {
    const v3 = config.v3 || {};
    const user = {
      name: v3.username,
      level: snmp.SecurityLevel[v3.securityLevel || 'authPriv']
    };
    if (v3.securityLevel !== 'noAuthNoPriv') {
      user.authProtocol = snmp.AuthProtocols[v3.authProtocol || 'sha'];
      user.authKey = v3.authKey;
    }
    if (v3.securityLevel === 'authPriv') {
      user.privProtocol = snmp.PrivProtocols[v3.privProtocol || 'aes'];
      user.privKey = v3.privKey;
    }
    return snmp.createV3Session(config.routerHost, user, { ...options, context: v3.context || '' });
  }

  return snmp.createSession(config.routerHost, config.community, {
    ...options,
    version: config.snmpVersion === '1' ? snmp.Version1 : snmp.Version2c
  });
}

function getVarbinds(session, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => error ? reject(error) : resolve(varbinds || []));
  });
}

function getVarbindValue(varbind) {
  if (!varbind) throw new Error('A resposta SNMP não contém o OID solicitado.');
  if (snmp.isVarbindError(varbind)) throw new Error(snmp.varbindError(varbind));
  return varbind.value;
}

function subtree(session, oid) {
  return new Promise((resolve, reject) => {
    const values = [];
    session.subtree(oid, 20, (varbinds) => {
      for (const varbind of varbinds) {
        if (snmp.isVarbindError(varbind)) continue;
        values.push(varbind);
      }
    }, (error) => error ? reject(error) : resolve(values));
  });
}

async function listInterfaces(config) {
  const session = createSession(config);
  try {
    const varbinds = await subtree(session, OIDS.ifDescr);
    const interfaces = varbinds.map((item) => {
      const indexText = item.oid.slice(`${OIDS.ifDescr}.`.length);
      return { index: Number(indexText), description: String(item.value) };
    }).filter((item) => Number.isInteger(item.index) && item.index > 0)
      .sort((a, b) => a.index - b.index);
    if (!interfaces.length) {
      throw new Error('Nenhuma interface foi retornada pela IF-MIB. Verifique o acesso SNMP do equipamento.');
    }
    return interfaces;
  } finally {
    session.close();
  }
}

function getCounter(varbind) {
  const value = getVarbindValue(varbind);
  return toCounterBigInt(value);
}

async function readTraffic(session, config, previousCounters, previousTimestamp, signature) {
  const index = Number(config.interfaceIndex);
  let rawIn;
  let rawOut;
  let counterKind;

  // Consulta os contadores HC separadamente para que a ausência desses OIDs não impeça
  // SNMPv1 ou equipamentos antigos de responder aos contadores clássicos.
  try {
    const highCapacity = await getVarbinds(session, [
      `${OIDS.ifHCInOctets}.${index}`,
      `${OIDS.ifHCOutOctets}.${index}`
    ]);
    rawIn = getCounter(highCapacity[0]);
    rawOut = getCounter(highCapacity[1]);
    counterKind = '64';
  } catch {
    const classic = await getVarbinds(session, [
      `${OIDS.ifInOctets}.${index}`,
      `${OIDS.ifOutOctets}.${index}`
    ]);
    rawIn = getCounter(classic[0]);
    rawOut = getCounter(classic[1]);
    counterKind = '32';
  }

  // Marca a leitura no momento em que os contadores já foram recebidos.
  const counterTimestampMs = Date.now();
  let speedBps = null;
  try {
    const [speedVarbind] = await getVarbinds(session, [`${OIDS.ifHighSpeed}.${index}`]);
    const speedMbps = numericValue(getVarbindValue(speedVarbind));
    if (speedMbps !== null && speedMbps > 0) speedBps = speedMbps * 1_000_000;
  } catch {
    // Alguns equipamentos não implementam ifHighSpeed; tenta ifSpeed abaixo.
  }
  if (!Number.isFinite(speedBps) || speedBps <= 0) {
    try {
      const [speedVarbind] = await getVarbinds(session, [`${OIDS.ifSpeed}.${index}`]);
      const speed = numericValue(getVarbindValue(speedVarbind));
      if (speed !== null && speed > 0) speedBps = speed;
    } catch {
      speedBps = null;
    }
  }

  const sameBaseline = previousCounters && previousCounters.signature === signature && previousCounters.counterKind === counterKind;
  const elapsedSeconds = sameBaseline && previousTimestamp ? (counterTimestampMs - previousTimestamp) / 1000 : null;
  const inResult = computeRateBps(rawIn, sameBaseline ? previousCounters.rawIn : null, elapsedSeconds, speedBps);
  const outResult = computeRateBps(rawOut, sameBaseline ? previousCounters.rawOut : null, elapsedSeconds, speedBps);

  return {
    inBps: inResult.value,
    outBps: outResult.value,
    counters: { rawIn, rawOut, counterKind, signature },
    reasons: { in: inResult.reason, out: outResult.reason },
    speedBps: Number.isFinite(speedBps) && speedBps > 0 ? speedBps : null,
    counterTimestampMs
  };
}

async function readCpuPercent(session, cpuOid) {
  const cleanedOid = String(cpuOid || '').replace(/^\./, '');
  try {
    const [varbind] = await getVarbinds(session, [cleanedOid]);
    const number = numericValue(getVarbindValue(varbind));
    if (number !== null && number >= 0 && number <= 100) return number;
  } catch {
    // Se o OID informado for a raiz de uma tabela, tenta percorrer suas instâncias.
  }

  const varbinds = await subtree(session, cleanedOid);
  const values = varbinds.map((item) => numericValue(item.value))
    .filter((value) => value !== null && value >= 0 && value <= 100);
  if (!values.length) {
    throw new Error(`O OID de CPU ${cleanedOid} não retornou valores percentuais válidos. O equipamento pode não suportar esse OID; configure o OID da MIB de CPU suportada.`);
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function collectSample(config, previousCounters, previousTimestamp) {
  const session = createSession(config);
  const signature = `${config.routerHost}|${config.snmpPort}|${config.snmpVersion}|${config.interfaceIndex}`;
  let traffic = { inBps: null, outBps: null, counters: previousCounters, reasons: { in: 'collection-error', out: 'collection-error' }, speedBps: null, counterTimestampMs: null };
  let counterReadSucceeded = false;
  let cpuPercent = null;
  const errors = [];
  try {
    try {
      traffic = await readTraffic(session, config, previousCounters, previousTimestamp, signature);
      counterReadSucceeded = true;
    } catch (error) {
      errors.push(`Tráfego: ${error.message}`);
    }
    try {
      cpuPercent = await readCpuPercent(session, config.cpuOid);
    } catch (error) {
      errors.push(`CPU: ${error.message}`);
    }
  } finally {
    session.close();
  }

  const collectedAtMs = Date.now();
  return {
    sample: {
      collectedAt: new Date(collectedAtMs).toISOString(),
      inBps: traffic.inBps,
      outBps: traffic.outBps,
      cpuPercent,
      errors,
      rateReasons: traffic.reasons,
      interfaceSpeedBps: traffic.speedBps || null
    },
    counters: traffic.counters,
    counterReadSucceeded,
    timestampMs: traffic.counterTimestampMs || collectedAtMs
  };
}

module.exports = { OIDS, createSession, listInterfaces, collectSample };
