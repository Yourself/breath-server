import { ChartData, ChartOptions } from 'chart.js';
import { DeviceMetadata, QueryResponse, SensorValues, VALUE_KEYS, getCapability } from '../api/types';
import { assertNever } from './assert';

export type Sensor = keyof SensorValues | 'dewp';
type Series<T extends string | Date | number = string> = QueryResponse<T>[0]['series'];

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

const spanRatio = 150 / 86400;

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

function flattenSeries<T extends string | Date | number>(sensor: Sensor | 'dewp', series: Series<T>) {
  const plotPts: { x: number; y: number }[] = [];
  const readings = series[sensor === 'dewp' ? 'atmp' : sensor];
  if (readings == null) {
    return plotPts;
  }
  const t0 = new Date(series.time[0]).getTime();
  const tf = new Date(series.time[series.time.length - 1]).getTime();
  const span = Math.max((tf - t0) * spanRatio, 60 * 1000);
  readings.forEach((pt, i) => {
    if (pt == null) return;
    let y: number | undefined;
    if (sensor === 'dewp') {
      const rhum = series.rhum?.[i];
      y = rhum != null ? getDewPoint(pt, rhum) : undefined;
    } else if (sensor === 'atmp') {
      y = (pt * 9) / 5 + 32;
    } else {
      y = pt;
    }
    const x = new Date(series.time[i]).getTime();
    const prev = plotPts[plotPts.length - 1];
    if (prev != null && x - prev.x > span && !Number.isNaN(prev.y)) {
      plotPts.push({ x: 0.5 * (prev.x + x), y: NaN });
    }
    plotPts.push({ x, y: y ?? NaN });
  });

  return plotPts;
}

export function isSensor(name: string): name is Sensor {
  return VALUE_KEYS.some((key) => key === name) || name === 'dewp';
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

export function getChartData<T extends string | Date | number = string>(
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
        spanGaps: false,
      },
    },
    plugins: {
      legend: {
        position: 'top',
      },
    },
    animation: {
      duration: 0,
    },
  };
}
