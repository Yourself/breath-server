import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export interface AirQualityData {
  id: string;
  rco2?: number;
  pm02?: number;
  tvoc?: number;
  nox?: number;
  atmp?: number;
  rhum?: number;
}

export interface SensorData {
  id: string;
  name: string;
  rco2: boolean;
  pm02: boolean;
  tvoc: boolean;
  nox: boolean;
  atmp: boolean;
  rhum: boolean;
}

export interface QueryParams {
  start?: Date;
  end?: Date;
  device?: string | string[];
}

export class AirQualityDB {
  private readonly _db: Database.Database;

  private readonly insertAQ: Database.Statement<AirQualityData>;

  private readonly insertSensor: Database.Statement<{ id: string }>;

  private readonly devices: Database.Statement<[]>;

  constructor() {
    this._db = new Database(path.join(__dirname, '..', 'data', 'data.db'));
    this.insertAQ = this._db.prepare<AirQualityData>(`
      INSERT INTO air_quality_log (id, rco2, pm02, tvoc, nox, atmp, rhum)
           VALUES ($id, $rco2, $pm02, $tvoc, $nox, $atmp, $rhum)`);
    this.insertSensor = this._db.prepare<{ id: string }>(`
      INSERT INTO sensors (id)
           SELECT $id WHERE NOT EXISTS (SELECT * FROM sensors WHERE id = $id)`);
    this.devices = this._db.prepare('SELECT * FROM sensors');
  }

  initTables() {
    this._db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql')).toString());
  }

  insertAirQuality(quality: AirQualityData) {
    this._db.transaction(() => {
      this.insertSensor.run(quality);
      this.insertAQ.run(quality);
    });
  }

  getDevices() {
    return this.devices.all() as string[];
  }

  getAQData(query: QueryParams) {
    const conditions = [];
    const values = [];

    if (query.start == null && query.end == null) {
      conditions.push('time BETWEEN DATEADD(day, -1, GETDATE()) AND GETDATE()');
    } else if (query.start == null) {
      conditions.push('time BETWEEN DATEADD(day, -1, ?) AND ?');
      values.push(query.end, query.end);
    } else if (query.end == null) {
      conditions.push('time BETWEEN ? AND GETDATE()');
      values.push(query.start);
    } else {
      conditions.push('time BETWEEN ? AND ?');
      values.push(query.start, query.end);
    }

    if (Array.isArray(query.device)) {
      conditions.push(`id IN (${query.device.map((_) => '?').join(', ')})`);
      values.push(...query.device);
    } else if (query.device != null) {
      conditions.push('id = ?');
      values.push(query.device);
    }

    const allConditions = conditions.map((c) => `(${c})`).join(' AND ');
    const sql = `SELECT * FROM air_quality_log WHERE ${allConditions}`;
    const rows = this._db.prepare(sql).all(...values);
  }
}

export function hasAQData(obj: NonNullable<unknown>): obj is AirQualityData {
  if (!('id' in obj)) return false;

  if ('rco2' in obj) return true;
  if ('pm02' in obj) return true;
  if ('tvoc' in obj) return true;
  if ('nox' in obj) return true;
  if ('atmp' in obj) return true;
  if ('rhum' in obj) return true;

  return false;
}
