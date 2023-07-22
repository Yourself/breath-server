import { utcToZonedTime } from 'date-fns-tz';
import express, { Application, Request, Response } from 'express';
import path from 'path';
import { parseBoolean } from '../utils/parse';
import { AirQualityDB, createDB, hasAQData, isDeviceIdValid } from './database';
import { CAPABILITY_KEYS, DeviceMetadataUpdate, QueryParams } from './types';

export class BreathServer {
  db: AirQualityDB;

  app: Application;

  constructor(dbPath = ':memory:') {
    this.db = createDB(dbPath);
    this.app = express();

    this.app.use(express.json());

    this.app.get('/api', (_, res) => {
      res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
    });
    this.app.get('/api/devices/', this.devices.bind(this));
    this.app.get('/api/query', this.query.bind(this));
    this.app.post('/api/restricted/submit/:device', this.submit.bind(this));
    this.app.put('/api/restricted/update/:device', this.update.bind(this));
    this.app.put('/api/restricted/auto-update/:device', this.autoUpdate.bind(this));
    this.app.delete('/api/restricted/delete/:device', this.delete.bind(this));
    this.app.get('/api/restricted/control/:device', BreathServer.control);
  }

  listen(port: number) {
    this.app.listen(port, () => {
      console.info(`BreathServer listening on port ${port}.`);
    });
  }

  devices(_: Request, res: Response) {
    res.send(this.db.getDevices());
  }

  query(req: Request, res: Response) {
    res.send(this.db.getReadings(req.query as QueryParams));
  }

  private submit(req: Request<{ device: string }>, res: Response) {
    if (!isDeviceIdValid(req.params.device)) {
      res.status(400).send({ error: 'Invalid device ID' });
      return;
    }
    if (!hasAQData(req.body)) {
      res.status(400).send({ error: 'Missing air quality data' });
      return;
    }

    this.db.insertAirQuality(req.params.device.toLowerCase(), req.body);
    res.sendStatus(200);
  }

  private update(req: Request<{ device: string }>, res: Response) {
    const id = req.params.device;
    if (!isDeviceIdValid(id)) {
      res.status(400).send({ error: 'Invalid device ID' });
      return;
    }
    const update: DeviceMetadataUpdate = {};
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

    this.db.updateDeviceMetadata(id.toLowerCase(), update);
    res.sendStatus(200);
  }

  private autoUpdate(req: Request<{ device: string }>, res: Response) {
    const id = req.params.device;
    if (!isDeviceIdValid(id)) {
      res.status(400).send({ error: 'Invalid device ID' });
      return;
    }

    this.db.autoUpdateDevice(id);
    res.sendStatus(200);
  }

  private delete(req: Request<{ device: string }>, res: Response) {
    const id = req.params.device;
    if (!isDeviceIdValid(id)) {
      res.status(400).send({ error: 'Invalid device ID' });
    }
    this.db.removeDevice(id);
    res.sendStatus(200);
  }

  private static getBrightness(time: Date) {
    const hours = (time.getSeconds() / 60 + time.getMinutes()) / 60 + time.getHours();
    if (hours < 8) {
      return 0;
    }
    if (hours < 9) {
      return 1 + Math.round(254 * (hours - 8));
    }
    if (hours > 23) {
      return 1 + Math.round(254 * (24 - hours));
    }
    return 255;
  }

  private static control(req: Request<{ device: string }>, res: Response) {
    // TODO: Add db configuration maybe
    const id = req.params.device;
    if (!isDeviceIdValid(id)) {
      res.status(400).send({ error: 'Invalid device ID' });
    }
    const now = utcToZonedTime(Date.now(), 'America/Boise');

    res.send(BreathServer.getBrightness(now).toString());
  }
}
