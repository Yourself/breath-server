import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import assertNever from './assert';

const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');
const MIGRATIONS_PATH = path.join(__dirname, '..', 'migrations');
const VERSION = 1;

export interface SensorValue {
  rco2?: number;
  pm01?: number;
  pm02?: number;
  pm10?: number;
  pCnt?: number;
  tvoc?: number;
  nox?: number;
  atmp?: number;
  rhum?: number;
}

export interface SensorInsertParams extends SensorValue {
  channels?: SensorValue[];
}

export const VALUE_KEYS = ['rco2', 'pm01', 'pm02', 'pm10', 'pCnt', 'tvoc', 'nox', 'atmp', 'rhum'] as const;
export const CAPABILITY_KEYS = VALUE_KEYS.map((k) => `has_${k}` as const);

interface SensorReading extends SensorValue {
  id: string;
}

type SensorCapabilities = {
  [K in keyof SensorValue as K extends string ? `has_${K}` : never]?: boolean;
};

type SensorsRow = {
  id: string;
  name?: string;
  channels?: number;
  is_hidden: number;
} & { [K in keyof SensorCapabilities]?: number };

export interface SensorMetadata extends SensorCapabilities {
  id: string;
  name?: string;
  channels?: number;
  is_hidden: boolean;
}

export type SensorMetadataUpdate = {
  [K in keyof Omit<SensorMetadata, 'id'>]?: SensorMetadata[K];
};

type SensorMetadataUpdateRow = {
  [K in keyof Omit<SensorMetadata, 'id' | 'name'>]?: number;
} & { name?: string };

enum QueryMode {
  None = 'none',
  Only = 'only',
  All = 'all',
}

export interface QueryParams {
  start?: string;
  end?: string;
  device?: string | string[];
  mode?: string;
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
  channel?: number;
  series: SensorTimePoint[];
}

function parseInteger(s?: string) {
  if (s != null && /^\s*\d+\s*$/.test(s)) {
    return parseInt(s, 10);
  }
  return undefined;
}

function parseQueryMode(s?: string) {
  if (s != null) {
    if (/^none$/i.test(s)) return QueryMode.None;
    if (/^only$/i.test(s)) return QueryMode.Only;
    if (/^all$/i.test(s)) return QueryMode.All;

    throw new Error(`Invalid query mode: '${s}'`);
  }
  return QueryMode.None;
}

export function isDeviceIdValid(id: string) {
  return !/[\s/]+/.test(id);
}

export function median(values: number[]) {
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

export function filterSeries(series: SensorTimePoint[], numPoints: number) {
  if (series.length <= numPoints) {
    return series;
  }
  let baseMS = series[0].time.getTime();
  const endTime = series[series.length - 1].time;
  const spanMS = endTime.getTime() - baseMS;
  let windowMS = spanMS / numPoints;
  type SensorValues = { [K in keyof SensorValue]-?: number[] };

  const accum: SensorValues = {
    rco2: [],
    pm01: [],
    pm02: [],
    pm10: [],
    pCnt: [],
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
    return hasKeys;
  };

  for (let i = 0; i < series.length; i += 1) {
    const remaining = numPoints - filtered.length;
    const time = series[i].time.getTime();
    if (time > baseMS + windowMS && remaining > 1) {
      baseMS += windowMS;
      if (!applyFilter(new Date(baseMS))) {
        baseMS = time;
        windowMS = (endTime.getTime() - baseMS) / remaining;
      }
    }
    if (remaining > series.length - i) {
      applyFilter(new Date(baseMS + windowMS));
      filtered.push(...series.slice(i));
      return filtered;
    }
    pushValue(series[i]);
  }

  applyFilter(endTime);

  return filtered;
}

export class AirQualityDB {
  private readonly _db: Database.Database;

  private readonly insertAQ: Database.Statement<SensorReading>;

  private readonly insert: Database.Transaction<(_: { channelCount: number } & SensorReading) => void>;

  private readonly devices: Database.Statement<[]>;

  private readonly delete: Database.Transaction<(id: string) => void>;

  constructor(db: Database.Database) {
    this._db = db;

    const insertSensor = this._db.prepare<{ id: string; channelCount: number }>(`
      INSERT INTO sensors (id, channels)
           SELECT $id, $channelCount WHERE NOT EXISTS (SELECT * FROM sensors WHERE id = $id)`);
    this.insertAQ = this._db.prepare<SensorReading>(`
      INSERT INTO air_quality_log (id, ${VALUE_KEYS.join(', ')})
          VALUES ($id, ${VALUE_KEYS.map((k) => `$${k}`).join(', ')})`);

    this.insert = this._db.transaction((reading) => {
      insertSensor.run(reading);
      this.insertAQ.run(reading);
    });

    this.devices = this._db.prepare('SELECT * FROM sensors');

    db.function('regexp', { deterministic: true }, (regex, text) =>
      new RegExp(regex as string).test(text as string) ? 1 : 0
    );

    const deleteReadings = this._db.prepare<string>(`DELETE FROM air_quality_log WHERE id REGEXP (? || '(/\\d+)?')`);
    const deleteSensor = this._db.prepare<string>(`DELETE FROM sensors WHERE id = ?`);

    this.delete = this._db.transaction((id) => {
      deleteReadings.run(id);
      deleteSensor.run(id);
    });
  }

  insertAirQuality(id: string, quality: SensorInsertParams) {
    const padKeys = (value: SensorValue) => {
      const data: SensorValue = {};
      for (const key of VALUE_KEYS) {
        data[key] = value[key];
      }
      return data;
    };

    this._db.transaction(() => {
      this.insert({ id, channelCount: quality.channels?.length ?? 1, ...padKeys(quality) });

      if (quality.channels != null && quality.channels.length > 1) {
        for (let i = 0; i < quality.channels.length; i += 1) {
          this.insertAQ.run({ id: `${id}/${i}`, ...padKeys(quality.channels[i]) });
        }
      }
    })();
  }

  getDevices() {
    const rows = this.devices.all() as SensorsRow[];
    const result: SensorMetadata[] = [];
    for (const row of rows) {
      const { id, name, channels, is_hidden } = row;
      const metadata: SensorMetadata = { id, name, channels, is_hidden: is_hidden !== 0 };
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
    if ('name' in metadata) {
      updates.push(`name = $name`);
      updateValues.name = metadata.name;
    }
    if ('channels' in metadata) {
      updates.push(`channels = $channels`);
      updateValues.channels = metadata.channels;
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

    const normalizeDate = (dateStr: string) => new Date(dateStr).getTime() / 1000;

    const { start, end } = query;
    if (start == null && end == null) {
      conditions.push("time BETWEEN DATETIME('now', '-1 day') AND DATETIME('now')");
    } else if (start == null) {
      conditions.push("time BETWEEN DATETIME(?, 'unixepoch') AND DATETIME(?, 'unixepoch')");
      const endNorm = normalizeDate(end!);
      values.push(endNorm - 24 * 60 * 60, endNorm);
    } else if (end == null) {
      conditions.push("time BETWEEN DATETIME(?, 'unixepoch') AND DATETIME('now')");
      values.push(normalizeDate(start));
    } else {
      conditions.push(`time BETWEEN DATETIME(?, 'unixepoch') AND DATETIME(?, 'unixepoch')`);
      values.push(normalizeDate(start), normalizeDate(end));
    }

    if (Array.isArray(query.device)) {
      conditions.push(`id IN (${query.device.map((_) => '?').join(', ')})`);
      values.push(...query.device);
    } else if (query.device != null) {
      conditions.push('id = ?');
      values.push(query.device);
    } else {
      const mode = parseQueryMode(query.mode);
      switch (mode) {
        case QueryMode.None:
          conditions.push('id IN (SELECT id FROM sensors WHERE is_hidden = 0)');
          break;
        case QueryMode.Only:
          conditions.push(`instr(id, '/') != 0`);
          conditions.push(`substr(id, 1, instr(id, '/') - 1) IN (SELECT id FROM sensors WHERE is_hidden = 0)`);
          break;
        case QueryMode.All:
          conditions.push(
            `IIF(instr(id, '/') == 0, id, substr(id, 1, instr(id, '/') - 1)) IN (SELECT id FROM sensors WHERE is_hidden = 0)`
          );
          break;
        default:
          /* istanbul ignore next */
          assertNever(mode);
      }
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
      const time = new Date(`${row.time} GMT+0000`);
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
      const channelInfo = /^([^/]+)\/(\d+)$/.exec(id);
      if (channelInfo != null) {
        result.push({
          id: channelInfo[1],
          channel: parseInt(channelInfo[2], 10),
          series: filterSeries(series, points),
        });
      } else {
        result.push({ id, series: filterSeries(series, points) });
      }
    }
    return result;
  }
}

export function hasAQData(obj: NonNullable<unknown>): obj is SensorValue {
  for (const key of VALUE_KEYS) {
    if (key in obj) return true;
  }

  return false;
}

export function createDB(dbPath: string, options?: Database.Options) {
  const db = new Database(dbPath, options);
  db.exec(fs.readFileSync(SCHEMA_PATH).toString());
  let version = db.pragma('user_version', { simple: true }) as number;
  while (version < VERSION) {
    version += 1;
    db.exec(fs.readFileSync(path.join(MIGRATIONS_PATH, `v${version}.sql`)).toString());
  }
  return new AirQualityDB(db);
}
