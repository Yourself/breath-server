import { ChartData, ChartOptions } from 'chart.js';
import { DeviceMetadata, QueryResponse, SensorValues, getCapability } from '../api/types';
import { assertNever } from './assert';

export type Sensor = keyof SensorValues | 'dewp';
type Series<T extends string | Date = string> = QueryResponse<T>[0]['series'];

const palette = [
  '#48beb7',
  '#ffb200',
  '#6b93ff',
  '#93c852',
  '#ff7f00',
  '#47acee',
  '#d3c800',
  '#9375fc',
  '#f1c400',
  '#d63beb',
  '#01cc7e',
  '#f05f34',
  '#7986ff',
  '#90cc00',
  '#ef2fad',
];

function makeRGBA(color: string, alpha: number) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/.exec(color);
  return match
    ? `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${alpha})`
    : undefined;
}

function getDewPoint(T: number | undefined, rhum: number | undefined) {
  if (T == null || rhum == null) return undefined;
  const b = 17.62;
  const c = 243.12;
  const d = 234.5;
  const p = (b - T / d) * (T / (c + T));
  const gamma = Math.log(rhum / 100) + p;
  return (((c * gamma) / (b - gamma)) * 9) / 5 + 32;
}

function getYAxisConverter(sensor: Sensor | 'dewp') {
  if (sensor === 'dewp') {
    return (values: SensorValues) => getDewPoint(values.atmp, values.rhum);
  }
  if (sensor === 'atmp') {
    return (values: SensorValues) => (values.atmp != null ? (values.atmp * 9) / 5 + 32 : undefined);
  }
  return (values: SensorValues) => values[sensor];
}

function flattenSeries<T extends string | Date>(sensor: Sensor | 'dewp', pts: Series<T>) {
  const getY = getYAxisConverter(sensor);
  return pts.map((pt) => ({ x: new Date(pt.time).getTime(), y: getY(pt) })).filter(({ y }) => y != null) as {
    x: number;
    y: number;
  }[];
}

export function getDewPointChartData<T extends string | Date = string>(
  sensor: 'dewp',
  devices: DeviceMetadata[],
  queryData: QueryResponse<T>
) {
  const data: ChartData<'line'> = {
    datasets: [],
  };
  for (let i = 0; i < devices.length; i += 1) {
    const device = devices[i];
    const series = queryData.find((ts) => ts.id === device.id)?.series;
    if (device.has_atmp && device.has_rhum && series) {
      data.datasets.push({
        label: device.name ?? device.id,
        data: flattenSeries(sensor, series),
        borderColor: palette[i],
        backgroundColor: makeRGBA(palette[i], 0.5),
        parsing: false,
      });
    }
  }
  return data;
}

export function getChartData<T extends string | Date = string>(
  sensor: Sensor,
  devices: DeviceMetadata[],
  queryData: QueryResponse<T>
) {
  const data: ChartData<'line'> = {
    datasets: [],
  };
  for (let i = 0; i < devices.length; i += 1) {
    const device = devices[i];
    const series = queryData.find((ts) => ts.id === device.id)?.series;
    const hasSensor = sensor === 'dewp' ? device.has_atmp && device.has_rhum : device[getCapability(sensor)];
    if (hasSensor && series) {
      data.datasets.push({
        label: device.name ?? device.id,
        data: flattenSeries(sensor, series),
        borderColor: palette[i],
        backgroundColor: makeRGBA(palette[i], 0.5),
        parsing: false,
      });
    }
  }
  return data;
}

function getUnits(sensor: Sensor) {
  switch (sensor) {
    case 'rco2':
      return 'ppm';
    case 'atmp':
    case 'dewp':
      return '°F';
    case 'rhum':
      return '%';
    case 'tvoc':
    case 'nox':
      return '';
    case 'pm01':
    case 'pm02':
    case 'pm10':
      return 'µg/m³';
    case 'pCnt':
      return '#/0.1L';
    default:
      assertNever(sensor);
  }
}

export function getCommonChartOptions(sensor: Sensor): ChartOptions<'line'> {
  return {
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
      },
      y: {
        title: {
          display: true,
          text: getUnits(sensor),
        },
      },
    },
    elements: {
      point: {
        radius: 0,
      },
      line: {
        borderWidth: 2,
      },
    },
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };
}
