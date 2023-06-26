import { ChartData, ChartOptions } from 'chart.js';
import { DeviceMetadata, QueryResponse, SensorValues, getCapability } from '../api/types';
import { assertNever } from './assert';

export type Sensor = keyof SensorValues;
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

function flattenSeries<T extends string | Date>(sensor: Sensor, pts: Series<T>) {
  return pts.map((pt) => ({ x: new Date(pt.time).getTime(), y: pt[sensor] })).filter(({ y }) => y != null) as {
    x: number;
    y: number;
  }[];
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
    if (device[getCapability(sensor)] && series) {
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
      return '°C';
    case 'rhum':
      return '%';
    case 'tvoc':
    case 'nox':
      return '';
    case 'pm01':
    case 'pm02':
    case 'pm10':
      return 'µg/mL';
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
    },
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };
}