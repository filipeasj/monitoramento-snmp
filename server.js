require('dotenv').config();
const express = require('express');
const path = require('node:path');
const store = require('./src/store');
const { normalizeAndValidateConfig } = require('./src/config');
const { listInterfaces } = require('./src/snmpClient');
const { Collector } = require('./src/collector');

store.initStore();
const collector = new Collector();
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(PUBLIC_DIR));
app.get('/vendor/chart.umd.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'), (error) => {
    if (error && !res.headersSent) res.status(503).type('text').send('Chart.js indisponível. Execute npm install.');
  });
});

app.get('/api/config', (req, res, next) => {
  try {
    res.json(store.getConfig());
  } catch (error) { next(error); }
});

app.put('/api/config', (req, res, next) => {
  try {
    const config = normalizeAndValidateConfig(req.body);
    store.saveConfig(config);
    collector.configChanged();
    res.json({ message: 'Configuração salva.', config });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/interfaces', async (req, res) => {
  try {
    const submitted = req.body && typeof req.body === 'object' ? req.body : {};
    const current = store.getConfig();
    const config = { ...current, ...submitted, v3: { ...current.v3, ...(submitted.v3 || {}) } };
    if (!String(config.routerHost || '').trim()) throw new Error('Informe o endereço do roteador antes de buscar interfaces.');
    if (config.snmpVersion !== 'v3' && !String(config.community || '').trim()) {
      throw new Error('Informe a comunidade SNMP de leitura antes de buscar interfaces.');
    }
    if (config.snmpVersion === 'v3' && !String(config.v3.username || '').trim()) {
      throw new Error('Informe o usuário SNMPv3 antes de buscar interfaces.');
    }
    const interfaces = await listInterfaces(config);
    res.json({ interfaces });
  } catch (error) {
    res.status(400).json({ error: `Não foi possível consultar as interfaces via SNMP: ${error.message}` });
  }
});

app.get('/api/monitor/status', (req, res) => res.json(collector.status()));
app.post('/api/monitor/start', (req, res) => res.json(collector.start()));
app.post('/api/monitor/pause', (req, res) => res.json(collector.pause()));

app.get('/api/monitor/samples', (req, res, next) => {
  try {
    const afterId = Math.max(0, Number.parseInt(req.query.afterId || '0', 10) || 0);
    const samples = store.getSamples().filter((sample) => Number(sample.id) > afterId).slice(0, 500);
    res.json({ samples });
  } catch (error) { next(error); }
});

app.get('/api/history', (req, res, next) => {
  try {
    const start = req.query.start ? new Date(String(req.query.start)) : null;
    const end = req.query.end ? new Date(String(req.query.end)) : null;
    if (start && Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Data/hora inicial inválida.' });
    if (end && Number.isNaN(end.getTime())) return res.status(400).json({ error: 'Data/hora final inválida.' });
    if (start && end && start > end) return res.status(400).json({ error: 'A data/hora inicial deve ser anterior à data/hora final.' });
    const samples = store.getSamples().filter((sample) => {
      const timestamp = new Date(sample.collectedAt).getTime();
      return (!start || timestamp >= start.getTime()) && (!end || timestamp <= end.getTime());
    });
    res.json({ samples, period: { start: start ? start.toISOString() : null, end: end ? end.toISOString() : null } });
  } catch (error) { next(error); }
});

app.get('/api/events/recent', (req, res, next) => {
  try {
    res.json({ events: store.getEvents().slice(-12) });
  } catch (error) { next(error); }
});

app.get('/api/events/latest', (req, res, next) => {
  try {
    const events = store.getEvents();
    res.json({ latestEventId: events.length ? Number(events[events.length - 1].id) : 0 });
  } catch (error) { next(error); }
});

app.get('/api/events', (req, res, next) => {
  try {
    const afterId = Math.max(0, Number.parseInt(req.query.afterId || '0', 10) || 0);
    const events = store.getEvents().filter((event) => Number(event.id) > afterId).slice(0, 200);
    res.json({ events });
  } catch (error) { next(error); }
});


app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  res.status(500).json({ error: 'Ocorreu um erro interno. Verifique o terminal do servidor.' });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Monitoramento SNMP disponível em http://127.0.0.1:${PORT}`);
  console.log('O servidor está limitado a localhost para não expor a interface de configuração na rede.');
});

function shutDown() {
  collector.pause();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
