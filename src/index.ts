import express from 'express';
import path from 'path';
import { QueryParams, SensorMetadataUpdate, createDB, hasAQData } from './data';

const LISTEN_PORT = parseInt(process.env.LISTEN_PORT ?? '3000', 10);

const DB_FILENAME = process.env.NODE_ENV === 'development' ? 'dev.db' : 'prod.db';

const db = createDB(path.join(__dirname, '..', 'data', DB_FILENAME));

const app = express();

function isDeviceIdValid(id: string) {
  return !/^\s+$/.test(id);
}

function parseBoolean(val: string | number | boolean): boolean {
  if (typeof val === 'string') {
    if (/^\s*\d+\s*$/.test(val)) {
      return parseInt(val, 10) !== 0;
    }

    return val.toLowerCase() === 'true';
  }

  if (typeof val === 'number') {
    return val !== 0;
  }

  if (typeof val === 'boolean') {
    return val;
  }

  throw new Error(`Could not parse boolean from '${val}'`);
}

app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use('/api', express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

app.get('/api', (_, res) => {
  res.send('Breath Server API');
});

app.post('/api/restricted/submit/:device', (req, res) => {
  if (!isDeviceIdValid(req.params.device)) {
    res.status(400).send({ error: 'Invalid device ID' });
    return;
  }
  if (!hasAQData(req.body)) {
    res.status(400).send({ error: 'Missing air quality data' });
    return;
  }
  db.insertAirQuality(req.params.device.toLowerCase(), req.body);
  res.sendStatus(200);
});

app.put('/api/restricted/update-device/:device', (req, res) => {
  const id = req.params.device;
  if (!isDeviceIdValid(id)) {
    res.status(400).send({ error: 'Invalid device ID' });
    return;
  }
  // const { name, is_hidden, has_rco2, has_pm02, has_tvoc, has_nox, has_atmp, has_rhum } = req.query;
  const update: SensorMetadataUpdate = {};
  const booleanKeys = ['is_hidden', 'has_rco2', 'has_pm02', 'has_tvoc', 'has_nox', 'has_atmp', 'has_rhum'] as const;
  for (const key of booleanKeys) {
    const val = req.query[key];
    if (val != null) {
      update[key] = parseBoolean(val.toString());
    }
  }
  const { name } = req.query;
  if (name != null) {
    update.name = name.toString();
  }
  db.updateDeviceMetadata(id.toLowerCase(), update);
  res.sendStatus(200);
});

app.delete('/api/restricted/delete/:device', (req, res) => {
  const id = req.params.device;
  if (!isDeviceIdValid(id)) {
    res.status(400).send({ error: 'Invalid device ID' });
  }
  db.removeDevice(id);
  res.sendStatus(200);
});

app.get('/api/devices', (_, res) => {
  res.send(db.getDevices());
});

app.get('/api/query', (req, res) => {
  const results = db.getReadings(req.query as QueryParams);
  res.send(results);
});

app.listen(LISTEN_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${LISTEN_PORT}.`);
});
