type ToCapabilityKey<K extends string> = `has_${K}`;

export const getCapability = <T extends string>(key: T): ToCapabilityKey<T> => `has_${key}` as const;

export const VALUE_KEYS = ['rco2', 'pm01', 'pm02', 'pm10', 'pCnt', 'tvoc', 'nox', 'atmp', 'rhum'] as const;
export type ValueKey = (typeof VALUE_KEYS)[number];

type CapabilityKeys<T extends readonly string[]> = T extends readonly [
  infer F extends string,
  ...infer Rest extends readonly string[]
]
  ? readonly [ToCapabilityKey<F>, ...CapabilityKeys<Rest>]
  : T;

export const CAPABILITY_KEYS = VALUE_KEYS.map(getCapability) as unknown as CapabilityKeys<typeof VALUE_KEYS>;
export type CapabilityKey = CapabilityKeys<typeof VALUE_KEYS>[number];

export type SensorValues = { [K in ValueKey]?: number };
export type DeviceReading = SensorValues & {
  channels?: SensorValues[];
};

export type DeviceCapabilities = {
  [K in CapabilityKey]?: boolean;
};

export type DeviceCalibration = {
  [K in keyof SensorValues]?: number[];
};

export type DeviceCalibrationWithId = { id: string } & DeviceCalibration;

export type DeviceMetadata = DeviceCapabilities & {
  id: string;
  name?: string;
  channels?: number;
  is_hidden: boolean;
};

export type DeviceMetadataUpdate = {
  [K in keyof Omit<DeviceMetadata, 'id'>]?: DeviceMetadata[K];
};

export type QueryParams = {
  start?: string;
  end?: string;
  device?: string | string[];
  sensor?: string | string[];
  mode?: string;
  points?: string;
};

export function isQueryParams(params: Record<string, unknown>): params is QueryParams {
  const simpleKeys = ['start', 'end', 'mode', 'points'] as const;
  for (const key of simpleKeys) {
    if (key in params && typeof params[key] !== 'string') {
      return false;
    }
  }

  if ('device' in params && typeof params.device !== 'string' && !Array.isArray(params.device)) {
    return false;
  }

  if ('sensor' in params && typeof params.sensor !== 'string' && !Array.isArray(params.sensor)) {
    return false;
  }

  return true;
}

export function parseQuerySensors({ sensor }: { sensor?: string | string[] }) {
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

export type CorrelationParams = {
  devices?: string[];
  sensors: readonly (keyof SensorValues)[];
  resolution: number;
};

export function parseCorrelationParams(params: Record<string, unknown>): CorrelationParams | undefined {
  if (!('sensor' in params)) return undefined;
  const devices = ((): string[] | undefined => {
    if (!('device' in params)) {
      return undefined;
    }
    if (Array.isArray(params.device)) {
      return typeof params.device[0] === 'string' ? params.device : undefined;
    }
    return typeof params.device === 'string' ? params.device.split(',') : undefined;
  })();
  const sensors = parseQuerySensors(params);
  const resolution = Number(params?.resolution ?? '600000');
  return { devices, sensors, resolution };
}

export type SensorValuesSeries = {
  [K in keyof SensorValues]?: (number | undefined)[];
};

export type ReadingTimePoint = SensorValues & {
  time: Date;
};

export type ReadingTimeSeries = SensorValuesSeries & {
  time: number[];
};

export type DeviceTimeSeries = {
  id: string;
  channel?: number;
  series: ReadingTimeSeries;
};

export type QueryResponse<T extends string | Date | number = string> = {
  id: string;
  channel?: number;
  series: SensorValuesSeries & { time: T[] };
}[];
