import axios from 'axios';
import {
  Chart,
  ChartData,
  ChartOptions,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { DeviceMetadata, QueryResponse, SensorValues, VALUE_KEYS, getCapability } from '../api/types';
import { assertNever } from '../utils/assert';

Chart.register(LinearScale, LineElement, PointElement, Tooltip, Legend, TimeScale);

type Sensor = keyof SensorValues;
type SensorData = { sensor: Sensor };

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

function ChartTitle({ sensor }: SensorData) {
  switch (sensor) {
    case 'rco2':
      return (
        <div className="chart-title">
          CO<sub>2</sub>
        </div>
      );
    case 'atmp':
      return <div className="chart-title">Temperature</div>;
    case 'rhum':
      return <div className="chart-title">Relative Humidity</div>;
    case 'tvoc':
      return <div className="chart-title">TVOC</div>;
    case 'nox':
      return <div className="chart-title">NOX</div>;
    case 'pm01':
      return <div className="chart-title">PM 1 &micro;m</div>;
    case 'pm02':
      return <div className="chart-title">PM 2.5 &micro;m</div>;
    case 'pm10':
      return <div className="chart-title">PM 10 &micro;m</div>;
    case 'pCnt':
      return <div className="chart-title">PM 0.3 &micro;m</div>;
    default:
      assertNever(sensor);
  }
}

function getCommonChartOptions(sensor: Sensor): ChartOptions<'line'> {
  return {
    maintainAspectRatio: false,
    animation: false,
    events: [],
    scales: {
      x: {
        type: 'time',
        ticks: {
          stepSize: 1,
        },
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
        pointStyle: false,
      },
    },
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };
}

function AQChart({ sensor, data }: SensorData & { data?: ChartData<'line'> }) {
  return (
    <div className="aq-chart">
      <ChartTitle sensor={sensor} />
      {data == null ? (
        <div className="no-data">No Data</div>
      ) : (
        <Line options={getCommonChartOptions(sensor)} data={data} />
      )}
    </div>
  );
}

type Series = QueryResponse[0]['series'];

function flattenSeries(sensor: Sensor, pts: Series) {
  return pts.map((pt) => ({ x: new Date(pt.time).getTime(), y: pt[sensor] })).filter(({ y }) => y != null) as {
    x: number;
    y: number;
  }[];
}

function getChartData(sensor: Sensor, devices: DeviceMetadata[], queryData: QueryResponse) {
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

type AllChartsData = { [K in keyof SensorValues]: ChartData<'line'> };

export default function Home() {
  const [data, setData] = useState<AllChartsData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([axios.get<DeviceMetadata[]>('/api/devices'), axios.get<QueryResponse>('/api/query')]).then(
      ([devRes, queryRes]) => {
        const allData: AllChartsData = {};
        const devices = devRes.data;
        const query = queryRes.data;

        for (const key of VALUE_KEYS) {
          allData[key] = getChartData(key, devices, query);
        }

        setData(allData);
        setLoading(false);
      }
    );
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <Head>
        <title>Breath Server</title>
      </Head>
      <AQChart sensor="atmp" data={data.atmp} />
      <AQChart sensor="rhum" data={data.rhum} />
      <AQChart sensor="rco2" data={data.rco2} />
      <h2>Particulate Matter</h2>
      <AQChart sensor="pm01" data={data.pm01} />
      <AQChart sensor="pm02" data={data.pm02} />
      <AQChart sensor="pm10" data={data.pm10} />
    </div>
  );
}
