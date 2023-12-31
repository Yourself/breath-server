export const getCapability = <T extends string>(key: T) => `has_${key}` as const;

export const VALUE_KEYS = ['rco2', 'pm01', 'pm02', 'pm10', 'pCnt', 'tvoc', 'nox', 'atmp', 'rhum'] as const;
export const CAPABILITY_KEYS = VALUE_KEYS.map(getCapability);

export type SensorValues = {
  rco2?: number;
  pm01?: number;
  pm02?: number;
  pm10?: number;
  pCnt?: number;
  tvoc?: number;
  nox?: number;
  atmp?: number;
  rhum?: number;
};

export type DeviceReading = SensorValues & {
  channels?: SensorValues[];
};

export type DeviceCapabilities = {
  [K in keyof SensorValues as K extends string ? `has_${K}` : never]?: boolean;
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
