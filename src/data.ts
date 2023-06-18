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

const VALUE_KEYS = ['rco2', 'pm02', 'tvoc', 'nox', 'atmp', 'rhum'] as const;
const CAPABILITY_KEYS = VALUE_KEYS.map((k) => `has_${k}` as const);

interface SensorReading extends SensorValue {
  id: string;
}

type SensorCapabilities = {
  [K in keyof SensorValue as K extends string ? `has_${K}` : never]?: boolean;
};

type SensorsRow = {
  id: string;
  name?: string;
  is_hidden: number;
} & { [K in keyof SensorCapabilities]?: number };

export interface SensorMetadata extends SensorCapabilities {
  id: string;
  name?: string;
  is_hidden: boolean;
}

export type SensorMetadataUpdate = {
  [K in keyof Omit<SensorMetadata, 'id'>]?: SensorMetadata[K];
};

type SensorMetadataUpdateRow = {
  [K in keyof Omit<SensorMetadata, 'id' | 'name'>]?: number;
} & { name?: string };

export interface QueryParams {
  start?: string;
  end?: string;
  device?: string | string[];
  points?: string;
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

function parseInteger(s?: string) {
  if (s != null && /^\s*\d+\s*$/.test(s)) {
    return parseInt(s, 10);
  }
  return undefined;
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined;
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return 0.5 * (values[0] + values[1]);
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.trunc(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function filterSeries(series: SensorTimePoint[], points: number) {
  if (series.length <= points) {
    return series;
  }
  let baseMS = series[0].time.getTime();
  const spanMS = series[series.length - 1].time.getTime() - baseMS;
  const windowMS = spanMS / points;
  type SensorValues = { [K in keyof SensorValue]-?: number[] };

  const accum: SensorValues = {
    rco2: [],
    pm02: [],
    tvoc: [],
    nox: [],
    atmp: [],
    rhum: [],
  };
  const filtered: SensorTimePoint[] = [];
  const pushValue = (pt: SensorValue) => {
    for (const key of VALUE_KEYS) {
      const value = pt[key];
      if (value != null) {
        accum[key].push(value);
      }
    }
  };
  const applyFilter = (time: Date) => {
    const pt: SensorTimePoint = {
      time,
    };
    let hasKeys = false;
    for (const key of VALUE_KEYS) {
      const m = median(accum[key]);
      if (m != null) {
        pt[key] = m;
        hasKeys = true;
      }
      accum[key] = [];
    }
    if (hasKeys) {
      filtered.push(pt);
    }
  };

  for (let i = 0; i < series.length; i += 1) {
    const { time } = series[i];
    if (time.getTime() >= baseMS + windowMS) {
      baseMS += windowMS;
      applyFilter(new Date(baseMS));
    }
    pushValue(series[i]);
  }

  applyFilter(series[series.length - 1].time);

  return filtered;
}

export class AirQualityDB {
  private readonly _db: Database.Database;

  private readonly insert: Database.Transaction<(_: SensorReading) => void>;

  private readonly devices: Database.Statement<[]>;

  private readonly delete: Database.Transaction<(id: string) => void>;

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

    const deleteReadings = this._db.prepare<string>(`DELETE FROM air_quality_log WHERE id = ?`);
    const deleteSensor = this._db.prepare<string>(`DELETE FROM sensors WHERE id = ?`);

    this.delete = this._db.transaction((id) => {
      deleteReadings.run(id);
      deleteSensor.run(id);
    });
  }

  insertAirQuality(id: string, quality: SensorValue) {
    const data = { id, ...quality };
    for (const key of VALUE_KEYS) {
      if (!(key in data)) {
        data[key] = undefined;
      }
    }
    this.insert(data);
  }

  getDevices() {
    const rows = this.devices.all() as SensorsRow[];
    const result: SensorMetadata[] = [];
    for (const row of rows) {
      const { id, name, is_hidden } = row;
      const metadata: SensorMetadata = { id, name, is_hidden: is_hidden !== 0 };
      for (const key of CAPABILITY_KEYS) {
        const value = row[key];
        if (value != null) {
          metadata[key] = value !== 0;
        }
      }
      result.push(metadata);
    }
    return result;
  }

  updateDeviceMetadata(id: string, metadata: SensorMetadataUpdate) {
    const updates = [];
    const updateValues: SensorMetadataUpdateRow = {};
    for (const key of CAPABILITY_KEYS) {
      if (key in metadata) {
        updates.push(`${key} = $${key}`);
        updateValues[key] = metadata[key] ? 1 : 0;
      }
    }
    if ('is_hidden' in metadata) {
      updates.push(`is_hidden = $is_hidden`);
      updateValues.is_hidden = metadata.is_hidden ? 1 : 0;
    }
    if (updates.length === 0) return;
    const setClause = updates.join(', ');
    this._db.prepare(`UPDATE sensors SET ${setClause} WHERE id = $id`).run({ id, ...updateValues });
  }

  removeDevice(id: string) {
    this.delete(id);
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

    const points = parseInteger(query.points) ?? 1440;

    const result = [];
    for (const [id, series] of seriesById.entries()) {
      result.push({ id, series: filterSeries(series, points) });
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
