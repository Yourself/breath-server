import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');

export interface SensorValue {
  rco2?: number;
  pm02?: number;
  tvoc?: number;
  nox?: number;
  atmp?: number;
  rhum?: number;
}

interface SensorReading extends SensorValue {
  id: string;
}

type SensorCapabilities = {
  [K in keyof SensorValue as K extends string ? `has_${K}` : never]-?: boolean;
};

export interface SensorMetadata extends SensorCapabilities {
  id: string;
  name?: string;
  is_hidden: boolean;
}

export type SensorMetadataUpdate = {
  [K in keyof Omit<SensorMetadata, 'id'>]?: SensorMetadata[K];
};

export interface QueryParams {
  start?: Date;
  end?: Date;
  device?: string | string[];
}

interface AQLogRow extends SensorValue {
  time: string;
  id: string;
}

export interface SensorTimePoint extends SensorValue {
  time: Date;
}

export interface SensorTimeSeries {
  id: string;
  series: SensorTimePoint[];
}

export class AirQualityDB {
  private readonly _db: Database.Database;

  private readonly insert: Database.Transaction<(_: SensorReading) => void>;

  private readonly devices: Database.Statement<[]>;

  constructor(db: Database.Database) {
    this._db = db;

    const insertSensor = this._db.prepare<{ id: string }>(`
      INSERT INTO sensors (id)
           SELECT $id WHERE NOT EXISTS (SELECT * FROM sensors WHERE id = $id)`);
    const insertAQ = this._db.prepare<SensorReading>(`
           INSERT INTO air_quality_log (id, rco2, pm02, tvoc, nox, atmp, rhum)
                VALUES ($id, $rco2, $pm02, $tvoc, $nox, $atmp, $rhum)`);

    this.insert = this._db.transaction((reading) => {
      insertSensor.run(reading);
      insertAQ.run(reading);
    });

    this.devices = this._db.prepare('SELECT * FROM sensors');
  }

  insertAirQuality(id: string, quality: SensorValue) {
    const data = { id, ...quality };
    const keys = ['rco2', 'pm02', 'tvoc', 'nox', 'atmp', 'rhum'] as const;
    for (const key of keys) {
      if (!(key in data)) {
        data[key] = undefined;
      }
    }
    this.insert(data);
  }

  getDevices() {
    return this.devices.all() as SensorMetadata[];
  }

  updateDeviceMetadata(id: string, metadata: SensorMetadataUpdate) {
    const keys = ['rco2', 'pm02', 'tvoc', 'nox', 'atmp', 'rhum'];
    const updates = [];
    for (const key of keys) {
      if (key in metadata) {
        updates.push(`${key} = $${key}`);
      }
    }
    if (updates.length === 0) return;
    const setClause = updates.join(', ');
    this._db.prepare(`UPDATE devices SET ${setClause} WHERE id = $id`).run({ id, ...metadata });
  }

  getReadings(query: QueryParams): SensorTimeSeries[] {
    const conditions = [];
    const values = [];

    if (query.start == null && query.end == null) {
      conditions.push("time BETWEEN DATETIME('now', '-1 day') AND DATETIME('now')");
    } else if (query.start == null) {
      conditions.push("time BETWEEN DATETIME(?, '-1 day') AND ?");
      values.push(query.end, query.end);
    } else if (query.end == null) {
      conditions.push("time BETWEEN ? AND DATETIME('now')");
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
    } else {
      conditions.push('id IN (SELECT id FROM sensors WHERE is_hidden = 0)');
    }

    const allConditions = conditions.map((c) => `(${c})`).join(' AND ');
    const sql = `SELECT * FROM air_quality_log WHERE ${allConditions}`;
    const rows = this._db.prepare(sql).all(...values) as AQLogRow[];
    const seriesById = new Map<string, SensorTimePoint[]>();

    if (query.device != null) {
      if (Array.isArray(query.device)) {
        for (const device of query.device) {
          seriesById.set(device, []);
        }
      } else {
        seriesById.set(query.device, []);
      }
    }

    for (const row of rows) {
      const time = new Date(row.time);
      const { rco2, pm02, tvoc, nox, atmp, rhum } = row;
      const point = { time, rco2, pm02, tvoc, nox, atmp, rhum };
      let series = seriesById.get(row.id);
      if (series == null) {
        series = [];
        seriesById.set(row.id, series);
      }
      series.push(point);
    }

    const result = [];
    for (const [id, series] of seriesById.entries()) {
      result.push({ id, series });
    }
    return result;
  }
}

export function hasAQData(obj: NonNullable<unknown>): obj is SensorValue {
  if ('rco2' in obj) return true;
  if ('pm02' in obj) return true;
  if ('tvoc' in obj) return true;
  if ('nox' in obj) return true;
  if ('atmp' in obj) return true;
  if ('rhum' in obj) return true;

  return false;
}

export function createDB(dbPath: string) {
  const db = new Database(dbPath);
  db.exec(fs.readFileSync(SCHEMA_PATH).toString());
  return new AirQualityDB(db);
}
