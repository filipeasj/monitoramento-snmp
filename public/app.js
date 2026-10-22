const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `A requisição falhou (${response.status}).`);
  return payload;
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function dateTimeText(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function shortTimeText(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('pt-BR');
}

function numberText(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits, minimumFractionDigits: 0 });
}

function localSampleLabel(sample) {
  const date = new Date(sample.collectedAt);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function chartBaseOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, padding: 18, color: '#64748b', font: { size: 10 } } },
      tooltip: { callbacks: { label(context) { return `${context.dataset.label}: ${numberText(context.parsed.y)} ${unit}`; } } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#8794a4', font: { size: 9 }, maxTicksLimit: 7, maxRotation: 0, autoSkip: true } },
      y: { beginAtZero: true, grid: { color: '#edf1f5' }, ticks: { color: '#8794a4', font: { size: 9 }, maxTicksLimit: 5 }, title: { display: true, text: unit, color: '#8794a4', font: { size: 10 } } }
    },
    spanGaps: false
  };
}

function makeTrafficChart(canvasId) {
  return new Chart($(canvasId), {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'IN', data: [], borderColor: '#2265d8', backgroundColor: 'rgba(34,101,216,.10)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25, fill: false },
      { label: 'OUT', data: [], borderColor: '#8964d8', backgroundColor: 'rgba(137,100,216,.10)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25, fill: false }
    ] },
    options: chartBaseOptions('bps')
  });
}

function makeCpuChart(canvasId) {
  const options = chartBaseOptions('%');
  options.scales.y.max = 100;
  return new Chart($(canvasId), {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'CPU', data: [], borderColor: '#14816a', backgroundColor: 'rgba(20,129,106,.10)', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25, fill: true }
    ] },
    options
  });
}

const charts = {
  liveTraffic: null,
  liveCpu: null,
  historyTraffic: null,
  historyCpu: null
};
let currentConfig = null;
let latestStatus = null;
let lastSeenSampleId = 0;
let lastSeenEventId = 0;
let resetEpoch = 0;
let liveSamples = [];
let eventCache = [];
let historyLoaded = false;
let pollInProgress = false;

function initCharts() {
  if (typeof Chart === 'undefined') {
    showToast('Biblioteca de gráficos indisponível', 'Execute npm install e recarregue a página.', true);
    return;
  }
  charts.liveTraffic = makeTrafficChart('liveTrafficChart');
  charts.liveCpu = makeCpuChart('liveCpuChart');
  charts.historyTraffic = makeTrafficChart('historyTrafficChart');
  charts.historyCpu = makeCpuChart('historyCpuChart');
}

function setTrafficData(chart, samples) {
  chart.data.labels = samples.map((sample) => shortTimeText(sample.collectedAt));
  chart.data.datasets[0].data = samples.map((sample) => Number.isFinite(sample.inBps) ? sample.inBps : null);
  chart.data.datasets[1].data = samples.map((sample) => Number.isFinite(sample.outBps) ? sample.outBps : null);
  chart.update('none');
}

function setCpuData(chart, samples) {
  chart.data.labels = samples.map((sample) => shortTimeText(sample.collectedAt));
  chart.data.datasets[0].data = samples.map((sample) => Number.isFinite(sample.cpuPercent) ? sample.cpuPercent : null);
  chart.update('none');
}

function renderLiveCharts() {
  if (!charts.liveTraffic || !charts.liveCpu) return;
  const visible = liveSamples.slice(-120);
  setTrafficData(charts.liveTraffic, visible);
  setCpuData(charts.liveCpu, visible);
  const latest = visible.length ? visible[visible.length - 1] : null;
  $('currentIn').textContent = latest && Number.isFinite(latest.inBps) ? numberText(latest.inBps) : (latest?.rateReasons?.in === 'baseline' ? 'Calculando…' : '—');
  $('currentOut').textContent = latest && Number.isFinite(latest.outBps) ? numberText(latest.outBps) : (latest?.rateReasons?.out === 'baseline' ? 'Calculando…' : '—');
  $('currentCpu').textContent = latest && Number.isFinite(latest.cpuPercent) ? `${numberText(latest.cpuPercent)}%` : '—';
}

function showToast(title, message, isError = false, timestamp = null) {
  const region = $('toastRegion');
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' toast-error' : ''}`;
  const heading = document.createElement('strong');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  toast.append(heading, paragraph);
  if (timestamp) {
    const time = document.createElement('small');
    time.textContent = dateTimeText(timestamp);
    toast.append(time);
  }
  region.append(toast);
  while (region.children.length > 4) region.firstElementChild.remove();
  setTimeout(() => toast.remove(), 9000);
}

function eventDescription(event) {
  if (event.type === 'popup') {
    return `${event.metricLabel}: observado ${numberText(event.value)} ${event.unit}; limite ${numberText(event.threshold)} ${event.unit}.`;
  }
  return event.message || event.metricLabel || 'Evento registrado.';
}

function eventTitle(event) {
  if (event.type === 'popup') return `Limite ultrapassado: ${event.metricLabel}`;
  if (event.type === 'email-error') return 'Falha no envio de e-mail';
  if (event.type === 'collector-error') return 'Falha na coleta SNMP';
  if (event.type === 'collector-recovered') return 'Coleta recuperada';
  return 'Evento do sistema';
}

function eventTime(event) {
  return event.timestamp || event.createdAt || null;
}

function renderRecentEvents() {
  const container = $('recentEvents');
  container.replaceChildren();
  const visible = eventCache.slice(-12).reverse();
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-line';
    empty.textContent = 'Nenhum evento registrado.';
    container.append(empty);
    return;
  }
  for (const event of visible) {
    const item = document.createElement('div');
    const errorEvent = ['email-error', 'collector-error'].includes(event.type);
    item.className = `event-item${event.type === 'popup' ? ' event-alert' : ''}${errorEvent ? ' event-error' : ''}`;
    const text = document.createElement('div');
    text.className = 'event-text';
    const title = document.createElement('strong');
    title.textContent = eventTitle(event);
    const detail = document.createElement('span');
    detail.textContent = eventDescription(event);
    const time = document.createElement('span');
    time.className = 'event-time';
    time.textContent = dateTimeText(eventTime(event));
    text.append(title, detail, time);
    item.append(text);
    container.append(item);
  }
}

function appendNewEvents(events) {
  for (const event of events) {
    eventCache.push(event);
    if (event.type === 'popup') {
      showToast(eventTitle(event), eventDescription(event), false, eventTime(event));
    } else if (event.type === 'email-error' || event.type === 'collector-error') {
      showToast(eventTitle(event), eventDescription(event), true, eventTime(event));
    } else if (event.type === 'collector-recovered') {
      showToast(eventTitle(event), eventDescription(event), false, eventTime(event));
    }
  }
  if (eventCache.length > 50) eventCache = eventCache.slice(-50);
  renderRecentEvents();
}

function renderStatus(status) {
  latestStatus = status;
  const indicator = $('statusIndicator');
  indicator.classList.toggle('status-running', status.running);
  indicator.classList.toggle('status-stopped', !status.running);
  indicator.innerHTML = `<span class="status-dot"></span>${status.running ? 'Coleta ativa' : 'Coleta pausada'}`;
  $('lastCollection').textContent = status.lastCollectionAt ? `Última coleta: ${dateTimeText(status.lastCollectionAt)}` : 'Nenhuma coleta realizada';
  $('collectorError').textContent = status.lastError || '';
  $('collectorError').classList.toggle('hidden', !status.lastError);
  $('startBtn').disabled = Boolean(status.running);
  $('pauseBtn').disabled = !status.running;

  if (currentConfig) {
    $('statusHost').textContent = currentConfig.routerHost || 'Não configurado';
    $('statusInterface').textContent = currentConfig.interfaceIndex ? `ifIndex ${currentConfig.interfaceIndex}` : '—';
    $('statusInterval').textContent = currentConfig.intervalSeconds ? `${numberText(currentConfig.intervalSeconds)} s` : '—';
  }
  if (status.lastError) {
    $('liveMessage').className = 'inline-message inline-error';
    $('liveMessage').textContent = `A coleta informou uma falha: ${status.lastError}`;
  } else if (status.running) {
    $('liveMessage').className = 'inline-message';
    $('liveMessage').textContent = 'Coleta ativa. Os dados válidos serão registrados e exibidos à medida que chegarem.';
  } else if (currentConfig?.routerHost) {
    $('liveMessage').className = 'inline-message';
    $('liveMessage').textContent = 'Coleta pausada. As amostras já gravadas permanecem disponíveis no histórico.';
  } else {
    $('liveMessage').className = 'inline-message';
    $('liveMessage').textContent = 'Configure o equipamento na aba Configuração antes de iniciar a coleta.';
  }
}

function setV3FieldsVisibility() {
  const v3Selected = $('snmpVersion').value === 'v3';
  $('v3Fields').classList.toggle('hidden', !v3Selected);
  $('communityField').classList.toggle('hidden', v3Selected);
  const level = $('v3SecurityLevel').value;
  const needsAuth = level !== 'noAuthNoPriv';
  const needsPriv = level === 'authPriv';
  $('v3AuthProtocolField').classList.toggle('hidden', !needsAuth);
  $('v3AuthKeyField').classList.toggle('hidden', !needsAuth);
  $('v3PrivProtocolField').classList.toggle('hidden', !needsPriv);
  $('v3PrivKeyField').classList.toggle('hidden', !needsPriv);
}

function inputNumberOrNull(id) {
  const value = $(id).value.trim();
  return value === '' ? null : Number(value);
}

function formConfig() {
  return {
    routerHost: $('routerHost').value.trim(),
    snmpVersion: $('snmpVersion').value,
    snmpPort: Number($('snmpPort').value),
    timeoutMs: Number($('timeoutMs').value),
    community: $('community').value,
    interfaceIndex: Number($('interfaceIndex').value),
    intervalSeconds: Number($('intervalSeconds').value),
    cpuOid: $('cpuOid').value.trim(),
    thresholdInBps: inputNumberOrNull('thresholdInBps'),
    thresholdOutBps: inputNumberOrNull('thresholdOutBps'),
    thresholdCpuPercent: inputNumberOrNull('thresholdCpuPercent'),
    alertPopup: $('alertPopup').checked,
    alertEmail: $('alertEmail').checked,
    emailTo: $('emailTo').value.trim(),
    v3: {
      username: $('v3Username').value.trim(),
      securityLevel: $('v3SecurityLevel').value,
      authProtocol: $('v3AuthProtocol').value,
      authKey: $('v3AuthKey').value,
      privProtocol: $('v3PrivProtocol').value,
      privKey: $('v3PrivKey').value,
      context: $('v3Context').value.trim()
    }
  };
}

function renderConfig(config) {
  currentConfig = config;
  $('routerHost').value = config.routerHost || '';
  $('snmpVersion').value = config.snmpVersion || '2c';
  $('snmpPort').value = config.snmpPort ?? 161;
  $('timeoutMs').value = config.timeoutMs ?? 3000;
  $('community').value = config.community || '';
  $('interfaceIndex').value = config.interfaceIndex || 1;
  $('intervalSeconds').value = config.intervalSeconds ?? 5;
  $('cpuOid').value = config.cpuOid || '1.3.6.1.2.1.25.3.3.1.2';
  $('thresholdInBps').value = config.thresholdInBps ?? '';
  $('thresholdOutBps').value = config.thresholdOutBps ?? '';
  $('thresholdCpuPercent').value = config.thresholdCpuPercent ?? '';
  $('alertPopup').checked = Boolean(config.alertPopup);
  $('alertEmail').checked = Boolean(config.alertEmail);
  $('emailTo').value = config.emailTo || '';
  const v3 = config.v3 || {};
  $('v3Username').value = v3.username || '';
  $('v3SecurityLevel').value = v3.securityLevel || 'authPriv';
  $('v3AuthProtocol').value = v3.authProtocol || 'sha';
  $('v3AuthKey').value = v3.authKey || '';
  $('v3PrivProtocol').value = v3.privProtocol || 'aes';
  $('v3PrivKey').value = v3.privKey || '';
  $('v3Context').value = v3.context || '';
  setV3FieldsVisibility();
}

function setConfigMessage(message, isError = false) {
  const element = $('configMessage');
  element.textContent = message;
  element.classList.remove('hidden', 'inline-error');
  if (isError) element.classList.add('inline-error');
}

async function loadConfig() {
  try {
    const config = await api('/api/config');
    renderConfig(config);
  } catch (error) {
    setConfigMessage(error.message, true);
  }
}

function showView(name) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));
  document.querySelectorAll('.view').forEach((view) => {
    const active = view.id === `view-${name}`;
    view.classList.toggle('active', active);
    view.hidden = !active;
  });
  if (name === 'history' && !historyLoaded) loadHistory();
}

function initHistoryDates() {
  const now = new Date();
  $('historyEnd').value = localDateTimeValue(now);
  $('historyStart').value = localDateTimeValue(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

async function loadHistory() {
  const errorBox = $('historyError');
  errorBox.classList.add('hidden');
  const parameters = new URLSearchParams();
  if ($('historyStart').value) parameters.set('start', new Date($('historyStart').value).toISOString());
  if ($('historyEnd').value) parameters.set('end', new Date($('historyEnd').value).toISOString());
  try {
    const result = await api(`/api/history?${parameters.toString()}`);
    historyLoaded = true;
    renderHistory(result.samples);
    const startText = $('historyStart').value ? $('historyStart').value.replace('T', ' ') : 'desde o início do histórico';
    const endText = $('historyEnd').value ? $('historyEnd').value.replace('T', ' ') : 'até agora';
    $('historyPeriod').textContent = `Período: ${startText} — ${endText}`;
    $('historyCount').textContent = `${result.samples.length} ${result.samples.length === 1 ? 'amostra' : 'amostras'}`;
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  }
}

function renderHistory(samples) {
  const hasData = samples.length > 0;
  $('noDataHistory').hidden = hasData;
  $('historyCharts').hidden = !hasData;
  $('historyTablePanel').hidden = !hasData;
  if (charts.historyTraffic && charts.historyCpu) {
    setTrafficData(charts.historyTraffic, samples);
    setCpuData(charts.historyCpu, samples);
  }
  const tbody = $('historyRows');
  tbody.replaceChildren();
  for (const sample of samples) {
    const row = document.createElement('tr');
    const values = [
      dateTimeText(sample.collectedAt),
      numberText(sample.inBps),
      numberText(sample.outBps),
      sample.cpuPercent === null || sample.cpuPercent === undefined ? '—' : `${numberText(sample.cpuPercent)}%`,
      Array.isArray(sample.errors) && sample.errors.length ? sample.errors.join(' | ') : ''
    ];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  }
}

async function poll() {
  if (pollInProgress) return;
  pollInProgress = true;
  const epochAtStart = resetEpoch;
  try {
    const status = await api('/api/monitor/status');
    renderStatus(status);
    const sampleResult = await api(`/api/monitor/samples?afterId=${lastSeenSampleId}`);
    if (epochAtStart === resetEpoch) {
      for (const sample of sampleResult.samples) {
        liveSamples.push(sample);
        lastSeenSampleId = Math.max(lastSeenSampleId, Number(sample.id));
      }
      if (liveSamples.length > 120) liveSamples = liveSamples.slice(-120);
      if (sampleResult.samples.length) renderLiveCharts();
    }
    const eventResult = await api(`/api/events?afterId=${lastSeenEventId}`);
    if (eventResult.events.length) {
      for (const event of eventResult.events) lastSeenEventId = Math.max(lastSeenEventId, Number(event.id));
      appendNewEvents(eventResult.events);
    }
  } catch (error) {
    $('liveMessage').className = 'inline-message inline-error';
    $('liveMessage').textContent = `Não foi possível atualizar a interface: ${error.message}`;
  } finally {
    pollInProgress = false;
  }
}

async function startCollection() {
  try {
    const status = await api('/api/monitor/start', { method: 'POST', body: '{}' });
    renderStatus(status);
    showToast('Coleta iniciada', 'A aplicação consultará o equipamento no intervalo configurado.');
    await poll();
  } catch (error) {
    showToast('Não foi possível iniciar a coleta', error.message, true);
  }
}

async function pauseCollection() {
  try {
    const status = await api('/api/monitor/pause', { method: 'POST', body: '{}' });
    renderStatus(status);
    showToast('Coleta pausada', 'Os dados já coletados foram preservados.');
  } catch (error) {
    showToast('Não foi possível pausar a coleta', error.message, true);
  }
}

async function resetLiveView() {
  resetEpoch += 1;
  liveSamples = [];
  try {
    const status = await api('/api/monitor/status');
    lastSeenSampleId = Number(status.latestSampleId || 0);
    renderStatus(status);
  } catch {
    // A visualização pode ser limpa mesmo se uma consulta de estado falhar.
  }
  renderLiveCharts();
  $('liveMessage').className = 'inline-message';
  $('liveMessage').textContent = 'Visualização em tempo real limpa. O histórico persistido não foi apagado.';
}

async function discoverInterfaces() {
  const button = $('discoverInterfacesBtn');
  const help = $('interfaceHelp');
  button.disabled = true;
  button.textContent = 'Consultando…';
  help.textContent = 'Consultando a IF-MIB do equipamento.';
  try {
    const result = await api('/api/interfaces', { method: 'POST', body: JSON.stringify(formConfig()) });
    const datalist = $('interfaceOptions');
    datalist.replaceChildren();
    for (const networkInterface of result.interfaces) {
      const option = document.createElement('option');
      option.value = String(networkInterface.index);
      option.label = `${networkInterface.index} — ${networkInterface.description}`;
      datalist.append(option);
    }
    const current = Number($('interfaceIndex').value);
    if (!result.interfaces.some((item) => item.index === current)) {
      $('interfaceIndex').value = String(result.interfaces[0].index);
    }
    help.textContent = `${result.interfaces.length} interface(s) encontrada(s). Selecione um índice no campo.`;
    showToast('Interfaces carregadas', 'Confira a descrição da interface e o índice selecionado.');
  } catch (error) {
    help.textContent = error.message;
    showToast('Consulta de interfaces falhou', error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Buscar interfaces via SNMP';
  }
}

async function saveConfiguration(event) {
  event.preventDefault();
  const button = $('saveConfigBtn');
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const result = await api('/api/config', { method: 'PUT', body: JSON.stringify(formConfig()) });
    renderConfig(result.config);
    setConfigMessage('Configuração salva com sucesso. As novas opções serão utilizadas pela coleta.');
    $('configSaveHint').textContent = 'Configuração salva localmente.';
    showToast('Configuração salva', 'Os parâmetros foram gravados em data/config.json.');
    if (latestStatus) renderStatus({ ...latestStatus, running: latestStatus.running });
  } catch (error) {
    setConfigMessage(error.message, true);
    showToast('Não foi possível salvar a configuração', error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar configuração';
  }
}

function populateRecentEvents(events) {
  eventCache = events.slice(-12);
  renderRecentEvents();
}

function wireEvents() {
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  $('startBtn').addEventListener('click', startCollection);
  $('pauseBtn').addEventListener('click', pauseCollection);
  $('resetBtn').addEventListener('click', resetLiveView);
  $('historyFilter').addEventListener('submit', (event) => { event.preventDefault(); loadHistory(); });
  $('configForm').addEventListener('submit', saveConfiguration);
  $('discoverInterfacesBtn').addEventListener('click', discoverInterfaces);
  $('snmpVersion').addEventListener('change', setV3FieldsVisibility);
  $('v3SecurityLevel').addEventListener('change', setV3FieldsVisibility);
}

async function boot() {
  initCharts();
  wireEvents();
  initHistoryDates();
  await loadConfig();
  try {
    const [status, eventCursor, recentResult] = await Promise.all([
      api('/api/monitor/status'),
      api('/api/events/latest'),
      api('/api/events/recent')
    ]);
    lastSeenSampleId = Number(status.latestSampleId || 0);
    lastSeenEventId = Number(eventCursor.latestEventId || 0);
    renderStatus(status);
    populateRecentEvents(recentResult.events || []);
  } catch (error) {
    $('liveMessage').className = 'inline-message inline-error';
    $('liveMessage').textContent = `Não foi possível carregar o estado inicial: ${error.message}`;
  }
  setInterval(poll, 1000);
}

boot();
