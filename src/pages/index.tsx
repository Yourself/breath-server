import axios from 'axios';
import { Chart, ChartData, Legend, LineElement, LinearScale, PointElement, TimeScale, Tooltip } from 'chart.js';
import 'chartjs-adapter-date-fns';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { DeviceMetadata, QueryResponse, SensorValues, VALUE_KEYS } from '../api/types';
import { assertNever } from '../utils/assert';
import { Sensor, getChartData, getCommonChartOptions } from '../utils/chart';

Chart.register(LinearScale, LineElement, PointElement, Tooltip, Legend, TimeScale);

type SensorData = { sensor: Sensor };

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

type AllChartsData = { [K in keyof SensorValues]: ChartData<'line'> };

function AllCharts() {
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

export default function Home() {
  return (
    <>
      <Head>
        <title>Breath Server</title>
        <meta property="og:title" content="Samsara Bar & Grill" />
        <meta property="og:description" content="Live air quality metrics" />
        <meta property="og:image" content="/api/ogimage" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </Head>
      <AllCharts />
    </>
  );
}
