import axios from 'axios';
import { Chart, ChartData, Legend, LineElement, LinearScale, PointElement, TimeScale, Tooltip } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { addDays, format } from 'date-fns';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { DateRange, DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import ReactModal from 'react-modal';
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
    case 'dewp':
      return <div className="chart-title">Dew Point</div>;
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

type AllChartsData = { [K in keyof SensorValues]: ChartData<'line'> } & { dewp?: ChartData<'line'> };

async function fetchChartData(dateRange?: DateRange) {
  const params: { points: number; sensor: string; start?: Date; end?: Date } = {
    points: 720,
    sensor: 'atmp,rhum,rco2,pm02',
  };

  if (dateRange?.from) {
    if (dateRange.to) {
      const { from, to } = dateRange;
      params.start = from;
      params.end = addDays(to, 1);
    } else {
      const { from } = dateRange;
      const end = addDays(from, 1);
      if (end.getTime() <= Date.now()) {
        params.start = from;
        params.end = end;
      }
    }
  }

  const [devRes, queryRes] = await Promise.all([
    axios.get<DeviceMetadata[]>('/api/devices'),
    axios.get<QueryResponse>('/api/query', { params }),
  ]);

  const allData: AllChartsData = {};
  const devices = devRes.data;
  const query = queryRes.data;

  for (const key of VALUE_KEYS) {
    allData[key] = getChartData(key, devices, query);
  }
  allData.dewp = getChartData('dewp', devices, query);

  return allData;
}

function DatePicker({ range, onSetRange }: { range?: DateRange; onSetRange: (range?: DateRange) => void }) {
  const [localRange, setLocalRange] = useState(range);
  const [showModal, setShowModal] = useState(false);

  let label = <p>Displaying: Today</p>;
  if (range?.from) {
    label = range.to ? (
      <p>
        Displaying: {format(range.from, 'PPP')} - {format(range.to, 'PPP')}
      </p>
    ) : (
      <p>Displaying: {format(range.from, 'PPP')}</p>
    );
  }

  const handleOpenModal = () => {
    setLocalRange(range);
    setShowModal(true);
  };

  const handleToday = () => {
    onSetRange();
    setShowModal(false);
  };
  const handleOk = () => {
    onSetRange(localRange);
    setShowModal(false);
  };
  const handleCancel = () => {
    setShowModal(false);
  };

  const footer = (
    <div style={{ float: 'right' }}>
      <button className="borderless" onClick={handleToday}>
        Today
      </button>
      <button className="borderless" onClick={handleOk}>
        Ok
      </button>
      <button className="borderless" onClick={handleCancel}>
        Cancel
      </button>
    </div>
  );

  return (
    <>
      <div className="card">
        <div className="date-display" style={{ display: 'inline-block', marginRight: '10px' }}>
          {label}
        </div>
        <button className="date-button" onClick={handleOpenModal}>
          &#x1F4C5;
        </button>
      </div>
      <ReactModal
        isOpen={showModal}
        onRequestClose={handleCancel}
        style={{
          content: {
            position: 'absolute',
            top: '50%',
            left: '50%',
            right: 'auto',
            bottom: 'auto',
            transform: 'translate(-50%, -50%)',
          },
        }}
      >
        <DayPicker
          mode="range"
          selected={localRange}
          onSelect={setLocalRange}
          footer={footer}
          showOutsideDays
          fixedWeeks
        />
      </ReactModal>
    </>
  );
}

function AllCharts({ ssData }: { ssData?: AllChartsData }) {
  const [data, setData] = useState<AllChartsData>(ssData ?? {});
  const [loading, setLoading] = useState(ssData == null);
  const [range, setRange] = useState<DateRange | undefined>();

  useEffect(() => {
    if (ssData == null) {
      fetchChartData().then((allData) => {
        setData(allData);
        setLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchChartData(range).then((allData) => {
      setData(allData);
      setLoading(false);
    });
  }, [range]);

  return (
    <>
      <DatePicker range={range} onSetRange={setRange} />
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="chart-container">
          <AQChart sensor="atmp" data={data.atmp} />
          <AQChart sensor="dewp" data={data.dewp} />
          <AQChart sensor="rco2" data={data.rco2} />
          <AQChart sensor="pm02" data={data.pm02} />
        </div>
      )}
    </>
  );
}

type ServerProps = { url: string } & { data?: AllChartsData };

export const getServerSideProps: GetServerSideProps<ServerProps> = async ({ req }) => {
  const proto = req.headers['x-forwarded-proto'] ?? 'http';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
  return {
    props: { url: `${proto}://${host}` },
  };
};

export default function Home({ url, data }: ServerProps) {
  return (
    <>
      <Head>
        <title>Breath Server</title>
        <meta property="og:title" content="Samsara Bar & Grill" />
        <meta property="og:description" content="Live air quality metrics" />
        <meta property="og:image" content={`${url}/android-chrome-512x512.png`} />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </Head>
      <AllCharts ssData={data} />
    </>
  );
}
