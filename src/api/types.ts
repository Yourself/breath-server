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
  mode?: string;
  points?: string;
};

export type ReadingTimePoint = SensorValues & {
  time: Date;
};

export type DeviceTimeSeries = {
  id: string;
  channel?: number;
  series: ReadingTimePoint[];
};

export type QueryResponse<T extends string | Date = string> = {
  id: string;
  channel?: number;
  series: (SensorValues & { time: T })[];
}[];
