import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getDir } from '../env';
import { assertNever } from '../utils/assert';
import { parseInteger } from '../utils/parse';
import {
  CAPABILITY_KEYS,
  DeviceCalibration,
  DeviceCapabilities,
  DeviceMetadata,
  DeviceMetadataUpdate,
  DeviceReading,
  DeviceTimeSeries,
  QueryParams,
  ReadingTimePoint,
  ReadingTimeSeries,
  SensorValues,
  VALUE_KEYS,
  getCapability,
} from './types';

const MIGRATIONS_PATH = getDir('migrations');
const SCHEMA_PATH = path.join(MIGRATIONS_PATH, 'schema.sql');
const VERSION = 2;

type SensorReading = SensorValues & {
  id: string;
};

type SensorsRow = {
  id: string;
  name?: string;
  channels?: number;
  is_hidden: number;
} & { [K in keyof DeviceCapabilities]?: number };

type SensorMetadataUpdateRow = {
  [K in keyof Omit<DeviceMetadata, 'id' | 'name'>]?: number;
} & { name?: string };

enum QueryMode {
  None = 'none',
  Only = 'only',
  All = 'all',
}

type AQLogRow = SensorValues & {
  time: string;
  id: string;
};

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

function removeNullReadings(series: ReadingTimeSeries) {
  for (const key of VALUE_KEYS) {
    if (!series[key]?.some((x) => x != null)) {
      delete series[key];
    }
  }
  return series;
}

export function filterSeries(
  series: ReadingTimePoint[],
  numPoints: number,
  sensors: ReturnType<typeof getQuerySensors> = VALUE_KEYS
) {
  const filtered: ReadingTimeSeries = { time: [] };
  for (const key of sensors) {
    filtered[key] = [];
  }
  if (series.length <= numPoints) {
    filtered.time = series.map((pt) => pt.time.getTime());
    for (const key of sensors) {
      if (series.some((pt) => pt[key] != null)) {
        filtered[key] = series.map((pt) => pt[key]);
      }
    }
    return filtered;
  }
  let baseMS = series[0].time.getTime();
  const endTime = series[series.length - 1].time;
  const spanMS = endTime.getTime() - baseMS;
  let windowMS = spanMS / numPoints;
  type Accumulator = { [K in keyof SensorValues]-?: number[] };

  const accum: Accumulator = {
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
  const pushValue = (pt: SensorValues) => {
    for (const key of sensors) {
      const value = pt[key];
      if (value != null) {
        accum[key].push(value);
      }
    }
  };
  const applyFilter = (time: Date) => {
    const pt: ReadingTimePoint = {
      time,
    };
    let hasKeys = false;
    for (const key of sensors) {
      const m = median(accum[key]);
      if (m != null) {
        pt[key] = m;
        hasKeys = true;
      }
      accum[key] = [];
    }
    if (hasKeys) {
      filtered.time.push(pt.time.getTime());
      for (const key of sensors) {
        filtered[key]?.push(pt[key]);
      }
    }
    return hasKeys;
  };

  for (let i = 0; i < series.length; i += 1) {
    const remaining = numPoints - filtered.time.length;
    const time = series[i].time.getTime();
    if (time > baseMS + windowMS && remaining > 1) {
      baseMS += windowMS;
      applyFilter(new Date(baseMS));
    }
    if (remaining > series.length - i) {
      applyFilter(new Date(baseMS + windowMS));
      for (const pt of series.slice(i)) {
        filtered.time.push(pt.time.getTime());
        for (const key of sensors) {
          filtered[key]?.push(pt[key]);
        }
      }
      return removeNullReadings(filtered);
    }
    if (time > baseMS + windowMS) {
      baseMS = time;
      windowMS = (endTime.getTime() - baseMS) / remaining;
    }
    pushValue(series[i]);
  }

  applyFilter(endTime);

  return removeNullReadings(filtered);
}

function getQuerySensors({ sensor }: QueryParams) {
  if (sensor == null) return VALUE_KEYS;
  const args = Array.isArray(sensor) ? sensor.flatMap((s) => s.split(',')) : sensor.split(',');
  const sensors = new Set<keyof SensorValues>();
  for (const arg of args) {
    const key = VALUE_KEYS.find((k) => k === arg);
    if (key != null) {
      sensors.add(key);
    }
  }
  return Array.from(sensors);
}

export class AirQualityDB {
  private readonly _db: Database.Database;

  private readonly insertAQ: Database.Statement<SensorReading>;

  private readonly insert: Database.Transaction<(_: { channelCount: number } & SensorReading) => void>;

  private readonly queryRecent: Database.Statement<{ id: string }>;

  private readonly devices: Database.Statement<[]>;

  private readonly delete: Database.Transaction<(id: string) => void>;

  private readonly calibrations: Database.Statement<{ id: string }>;

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

    this.queryRecent = this._db.prepare(
      `SELECT * FROM air_quality_log WHERE id = $id OR id LIKE ($id || '%') ORDER BY rowid DESC LIMIT 1`
    );

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

    this.calibrations = this._db.prepare(`SELECT * FROM calibration WHERE id = $id`);
  }

  getDevices() {
    const rows = this.devices.all() as SensorsRow[];
    const result: DeviceMetadata[] = [];
    for (const row of rows) {
      const { id, name, channels, is_hidden } = row;
      const metadata: DeviceMetadata = { id, name, channels, is_hidden: is_hidden !== 0 };
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

  getCalibration(id: string) {
    const calibrations = this.calibrations.all({ id }) as {
      id: string;
      sensor: keyof SensorValues;
      c0: number;
      c1: number;
    }[];

    const result: DeviceCalibration = {};
    for (const cal of calibrations) {
      result[cal.sensor] = [cal.c0, cal.c1];
    }
    return result;
  }

  getReadings(query: QueryParams): DeviceTimeSeries[] {
    const conditions = [];
    const values = [];

    const sensors = getQuerySensors(query);
    if (sensors.length === 0) {
      throw new Error(`Found no suitable sensors matching query: ${query.sensor}`);
    }

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
    const seriesById = new Map<string, ReadingTimePoint[]>();

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
      let series = seriesById.get(row.id);
      if (series == null) {
        series = [];
        seriesById.set(row.id, series);
      }
      const point: ReadingTimePoint = { time };
      for (const key of sensors) {
        if (row[key] != null) {
          point[key] = row[key];
        }
      }
      series.push(point);
    }

    const points = parseInteger(query.points) ?? 1440;

    const result: DeviceTimeSeries[] = [];
    for (const [id, series] of seriesById.entries()) {
      const channelInfo = /^([^/]+)\/(\d+)$/.exec(id);
      if (channelInfo != null) {
        result.push({
          id: channelInfo[1],
          channel: parseInt(channelInfo[2], 10),
          series: filterSeries(series, points, sensors),
        });
      } else {
        result.push({ id, series: filterSeries(series, points, sensors) });
      }
    }
    return result;
  }

  insertAirQuality(id: string, quality: DeviceReading) {
    const padKeys = (value: SensorValues) => {
      const data: SensorValues = {};
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

  updateDeviceMetadata(id: string, metadata: DeviceMetadataUpdate) {
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

  autoUpdateDevice(id: string) {
    const row = this.queryRecent.get({ id }) as AQLogRow;
    if (row == null) {
      return;
    }

    const updateParams: DeviceMetadataUpdate = {};

    const idComponents = row.id.split('/');
    if (idComponents.length > 1) {
      updateParams.channels = parseInt(idComponents[1], 10) + 1;
    }

    for (const key of VALUE_KEYS) {
      updateParams[getCapability(key)] = row[key] != null;
    }

    this.updateDeviceMetadata(id, updateParams);
  }

  removeDevice(id: string) {
    this.delete(id);
  }
}

export function hasAQData(obj: NonNullable<unknown>): obj is SensorValues {
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
