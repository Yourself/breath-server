import express from 'express';
import path from 'path';
import { QueryParams, createDB, hasAQData } from './data';

const LISTEN_PORT = parseInt(process.env.LISTEN_PORT ?? '3000', 10);

const DB_FILENAME = process.env.NODE_ENV === 'development' ? 'dev.db' : 'prod.db';

const db = createDB(path.join(__dirname, '..', 'data', DB_FILENAME));

const app = express();

function isDeviceIdValid(id: string) {
  return !/^\s+$/.test(id);
}

app.use(express.static(path.join(__dirname, '..', 'dist')));
app.use(express.json());

app.get('/', (_, res) => {
  res.send('Breath Server');
});

app.post('/restricted/submit/:device', (req, res) => {
  if (!isDeviceIdValid(req.params.device)) {
    res.status(400).send({ error: 'Invalid device ID' });
    return;
  }
  if (!hasAQData(req.body)) {
    res.status(400).send({ error: 'Missing air quality data' });
    return;
  }
  db.insertAirQuality(req.params.device, req.body);
  res.sendStatus(200);
});

app.put('/restriced/update-device/:device', (req, res) => {
  const id = req.params.device;
  if (!isDeviceIdValid(id)) {
    res.status(400).send({ error: 'Invalid device ID' });
    return;
  }
  db.updateDeviceMetadata(id, req.query);
});

app.get('/devices', (_, res) => {
  res.send(db.getDevices());
});

app.get('/query', (req, res) => {
  const results = db.getReadings(req.query as QueryParams);
  res.send(results);
});

app.listen(LISTEN_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on port ${LISTEN_PORT}.`);
});
