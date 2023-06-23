import express from 'express';
import path from 'path';
import { CAPABILITY_KEYS, QueryParams, SensorMetadataUpdate, createDB, hasAQData, isDeviceIdValid } from './data';

/* istanbul ignore next */
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT ?? '3000', 10);

/* istanbul ignore next */
const DB_FILENAME = process.env.NODE_ENV === 'production' ? 'prod.db' : 'dev.db';

/* istanbul ignore next */
const DB_PATH = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, '..', 'data', DB_FILENAME);

function createBreathServer() {
  const db = createDB(DB_PATH);

  const app = express();

  function parseBoolean(val: string): boolean {
    if (/^\s*\d+\s*$/.test(val)) {
      return parseInt(val, 10) !== 0;
    }

    return val.toLowerCase() === 'true';
  }

  app.use(express.json());

  app.get('/api', (_, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
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

  app.put('/api/restricted/update/:device', (req, res) => {
    const id = req.params.device;
    if (!isDeviceIdValid(id)) {
      res.status(400).send({ error: 'Invalid device ID' });
      return;
    }
    const update: SensorMetadataUpdate = {};
    for (const key of CAPABILITY_KEYS) {
      const val = req.query[key];
      if (val != null) {
        update[key] = parseBoolean(val.toString());
      }
    }

    const { is_hidden } = req.query;
    if (is_hidden != null) {
      update.is_hidden = parseBoolean(is_hidden.toString());
    }

    const { channels } = req.query;
    if (channels != null) {
      update.channels = parseInt(channels.toString(), 10);
    }

    const { name } = req.query;
    if (name != null) {
      update.name = name.toString();
    }

    db.updateDeviceMetadata(id.toLowerCase(), update);
    res.sendStatus(200);
  });

  app.put('/api/restricted/auto-update/:device', (req, res) => {
    const id = req.params.device;
    if (!isDeviceIdValid(id)) {
      res.status(400).send({ error: 'Invalid device ID' });
      return;
    }

    db.autoUpdateDevice(id);
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

  return app;
}

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  const app = createBreathServer();
  app.listen(LISTEN_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server started on port ${LISTEN_PORT}.`);
  });
}

export default createBreathServer;
