import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

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

export interface SensorMetadata {
  id: string;
  name?: string;
  has_rco2: boolean;
  has_pm02: boolean;
  has_tvoc: boolean;
  has_nox: boolean;
  has_atmp: boolean;
  has_rhum: boolean;
}

export interface QueryParams {
  start?: Date;
  end?: Date;
  device?: string | string[];
}

interface AQLogRow {
  time: string;
  id: string;
  rco2?: number;
  pm02?: number;
  tvoc?: number;
  nox?: number;
  atmp?: number;
  rhum?: number;
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

  private readonly insertAQ: Database.Statement<SensorReading>;

  private readonly insertSensor: Database.Statement<{ id: string }>;

  private readonly devices: Database.Statement<[]>;

  private readonly updateDevice: Database.Statement<SensorMetadata>;

  constructor() {
    this._db = new Database(path.join(__dirname, "..", "data", "data.db"));
    this.insertAQ = this._db.prepare<SensorReading>(`
      INSERT INTO air_quality_log (id, rco2, pm02, tvoc, nox, atmp, rhum)
           VALUES ($id, $rco2, $pm02, $tvoc, $nox, $atmp, $rhum)`);
    this.insertSensor = this._db.prepare<{ id: string }>(`
      INSERT INTO sensors (id)
           SELECT $id WHERE NOT EXISTS (SELECT * FROM sensors WHERE id = $id)`);
    this.devices = this._db.prepare("SELECT * FROM sensors");
    this.updateDevice = this._db.prepare(`
      UPDATE sensors
      SET name = $name,
          has_rco2 = $has_rco2,
          has_pm02 = $has_pm02,
          has_tvoc = $has_tvoc,
          has_nox = $has_nox,
          has_atmp = $has_atmp,
          has_rhum = $has_rhum
      WHERE id = $id`);
  }

  initTables() {
    this._db.exec(
      fs.readFileSync(path.join(__dirname, "..", "schema.sql")).toString()
    );
  }

  insertAirQuality(id: string, quality: SensorValue) {
    this._db.transaction(() => {
      this.insertSensor.run({ id });
      this.insertAQ.run({ id, ...quality });
    });
  }

  getDevices() {
    return this.devices.all() as SensorMetadata[];
  }

  updateDeviceMetadata(metadata: SensorMetadata) {
    this.updateDevice.run(metadata);
  }

  getReadings(query: QueryParams): SensorTimeSeries[] {
    const conditions = [];
    const values = [];

    if (query.start == null && query.end == null) {
      conditions.push("time BETWEEN DATEADD(day, -1, GETDATE()) AND GETDATE()");
    } else if (query.start == null) {
      conditions.push("time BETWEEN DATEADD(day, -1, ?) AND ?");
      values.push(query.end, query.end);
    } else if (query.end == null) {
      conditions.push("time BETWEEN ? AND GETDATE()");
      values.push(query.start);
    } else {
      conditions.push("time BETWEEN ? AND ?");
      values.push(query.start, query.end);
    }

    if (Array.isArray(query.device)) {
      conditions.push(`id IN (${query.device.map((_) => "?").join(", ")})`);
      values.push(...query.device);
    } else if (query.device != null) {
      conditions.push("id = ?");
      values.push(query.device);
    }

    const allConditions = conditions.map((c) => `(${c})`).join(" AND ");
    const sql = `SELECT * FROM air_quality_log WHERE ${allConditions}`;
    const rows = this._db.prepare(sql).all(...values) as AQLogRow[];
    const seriesById = new Map<string, SensorTimePoint[]>();
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

export function hasAQData(obj: NonNullable<unknown>): obj is SensorReading {
  if (!("id" in obj)) return false;

  if ("rco2" in obj) return true;
  if ("pm02" in obj) return true;
  if ("tvoc" in obj) return true;
  if ("nox" in obj) return true;
  if ("atmp" in obj) return true;
  if ("rhum" in obj) return true;

  return false;
}
