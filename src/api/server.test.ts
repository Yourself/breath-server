import { faker } from '@faker-js/faker';
import request from 'supertest';
import { BreathServer } from './server';
import { DeviceMetadata, DeviceMetadataUpdate, DeviceTimeSeries, SensorValues, VALUE_KEYS } from './types';

function toQuery<T extends NonNullable<unknown>>(obj: T) {
  const params = [];
  for (const key in obj) {
    const value = obj[key];
    if (Array.isArray(value)) {
      params.push(...value.map((v) => `${key}=${v}`));
    } else {
      params.push(`${key}=${value}`);
    }
  }
  return params.join('&');
}

function expectJsonObject<T extends object = NonNullable<unknown>>(res: request.Response, ...keys: (keyof T)[]): T {
  expect(res.type).toEqual('application/json');
  for (const key of keys) {
    expect(res.body).toHaveProperty(key as string);
  }
  return res.body as T;
}

function expectJsonArray<T extends object = NonNullable<unknown>>(
  res: request.Response,
  length = 0,
  ...keys: (keyof T)[]
): T[] {
  expect(res.type).toEqual('application/json');
  expect(res.body).toHaveLength(length);
  for (const item of res.body) {
    for (const key of keys) {
      expect(item).toHaveProperty(key as string);
    }
  }
  return res.body as T[];
}

faker.seed(0);

function createId() {
  return faker.string.hexadecimal({ length: 8, casing: 'lower', prefix: '' });
}

function createSensorValue(capabilities: DeviceMetadataUpdate) {
  const params: SensorValues = {};
  if (capabilities.has_rco2 ?? false) params.rco2 = faker.number.float({ min: 400, max: 2000 });
  if (capabilities.has_pm01 ?? false) params.pm01 = faker.number.float({ min: 0, max: 100 });
  if (capabilities.has_pm02 ?? false) params.pm02 = faker.number.float({ min: 0, max: 100 });
  if (capabilities.has_pm10 ?? false) params.pm10 = faker.number.float({ min: 0, max: 100 });
  if (capabilities.has_pCnt ?? false) params.pCnt = faker.number.float({ min: 0, max: 100 });
  if (capabilities.has_tvoc ?? false) params.tvoc = faker.number.float({ min: 0, max: 100 });
  if (capabilities.has_nox ?? false) params.nox = faker.number.float({ min: 0, max: 100 });
  if (capabilities.has_atmp ?? false) params.atmp = faker.number.float({ min: -20, max: 30 });
  if (capabilities.has_rhum ?? false) params.rhum = faker.number.float({ min: 0, max: 100 });
  return params;
}

function getAverage(...values: SensorValues[]) {
  const result: SensorValues = {};
  const sums = VALUE_KEYS.map(
    (key) =>
      [
        key,
        values
          .map((v) => v[key])
          .reduce((total, v) => {
            if (total == null) {
              return v;
            }
            return total + (v ?? 0);
          }, undefined),
      ] as const
  );
  for (const [key, sum] of sums) {
    if (sum != null) {
      result[key] = sum / values.length;
    }
  }
  return result;
}

function createSensorChannels(capabilities: DeviceMetadataUpdate, numChannels: number) {
  const channels = [];
  for (let i = 0; i < numChannels; i += 1) {
    channels.push(createSensorValue(capabilities));
  }

  return { ...getAverage(...channels), channels };
}

describe('public routes', () => {
  const server = new BreathServer();
  const { app } = server;
  test('/api', async () => {
    const res = await request(app).get('/api');
    expect(res.type).toEqual('text/html');
    expect(res.text).toMatch(/Breath Server API/i);
  });

  describe('empty db', () => {
    test('/api/devices', async () => {
      const res = await request(app).get('/api/devices');
      expect(res.type).toEqual('application/json');
      expect(res.body).toHaveLength(0);
    });

    test('/api/query', async () => {
      const res = await request(app).get(`/api/query`);
      expect(res.type).toEqual('application/json');
      expect(res.body).toHaveLength(0);
    });
  });
});

describe('mutable routes', () => {
  describe('invalid id', () => {
    const server = new BreathServer();
    const { app } = server;

    test('submit', async () => {
      const id = 'invalid id';
      const res = await request(app).post(`/api/restricted/submit/${id}`);
      expect(res.error).toBeTruthy();
      const { error } = expectJsonObject<{ error: string }>(res, 'error');
      expect(error).toMatch(/invalid/i);
    });

    test('update', async () => {
      const id = 'invalid id';
      const res = await request(app).put(`/api/restricted/update/${id}`);
      expect(res.error).toBeTruthy();
      const { error } = expectJsonObject<{ error: string }>(res, 'error');
      expect(error).toMatch(/invalid/i);
    });

    test('delete', async () => {
      const id = 'invalid id';
      const res = await request(app).delete(`/api/restricted/delete/${id}`);
      expect(res.error).toBeTruthy();
      const { error } = expectJsonObject<{ error: string }>(res, 'error');
      expect(error).toMatch(/invalid/i);
    });
  });

  test('missing data AQ data', async () => {
    const server = new BreathServer();
    const { app } = server;

    const id = createId();
    const res = await request(app).post(`/api/restricted/submit/${id}`);
    expect(res.error).toBeTruthy();
    const { error } = expectJsonObject<{ error: string }>(res, 'error');
    expect(error).toMatch(/missing/i);
  });

  describe('single channel', () => {
    test('insert and delete device', async () => {
      const server = new BreathServer();
      const { app } = server;

      const id = createId();
      const name = faker.word.words();
      const payload = { rco2: 1, pm02: 2, tvoc: 3, nox: 4, atmp: 5, rhum: 6 };
      {
        const res = await request(app)
          .post(`/api/restricted/submit/${id}`)
          .send(payload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json');
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<{ id: string }>(res, 1, 'id');
        expect(body[0].id).toEqual(id);
      }
      {
        const res = await request(app).get('/api/query');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceTimeSeries>(res, 1, 'id', 'series');
        expect(body[0].id).toEqual(id);
        const { series } = body[0];
        expect(series.time).toHaveLength(1);
      }
      {
        const res = await request(app).put(`/api/restricted/update/${id}?name=${name}&is_hidden=1`);
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        expect(res.type).toEqual('application/json');
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'name', 'is_hidden');
        expect(body[0].id).toEqual(id);
        expect(body[0].name).toEqual(name);
        expect(body[0].is_hidden).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/query');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray(res);
        expect(body).toHaveLength(0);
      }
      {
        const res = await request(app).delete(`/api/restricted/delete/${id}`);
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        expectJsonArray(res);
      }
    });

    describe('multiple device readings', () => {
      const numPts = 10;
      const id = createId();
      const capabilities = {
        has_rco2: true,
        has_pm02: true,
        has_atmp: true,
        has_rhum: true,
        has_tvoc: false,
        has_nox: false,
      };
      const payloads = Array.from(Array(numPts)).map((_) => createSensorValue(capabilities));

      async function submitFakeData<T>(app: T) {
        const responses = [];
        for (const payload of payloads) {
          // Need to ensure these are inserted in order, so synchronously await each one
          responses.push(
            // eslint-disable-next-line no-await-in-loop
            await request(app)
              .post(`/api/restricted/submit/${id}`)
              .send(payload)
              .set('Content-Type', 'application/json')
              .set('Accept', 'application/json')
          );
        }
        return responses;
      }

      test('it can insert', async () => {
        const server = new BreathServer();
        const { app } = server;

        const allRes = await submitFakeData(app);
        expect(allRes).toHaveLength(numPts);
        for (const res of allRes) {
          expect(res.ok).toBeTruthy();
        }
        {
          const res = await request(app).get('/api/devices');
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
          expect(body[0].id).toEqual(id);
          expect(body[0].is_hidden).toBeFalsy();
        }
        {
          const res = await request(app).get('/api/query');
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray<DeviceTimeSeries>(res, 1, 'id', 'series');
          expect(body[0].id).toEqual(id);
          expect(body[0].series.time).toHaveLength(numPts);
        }
      });

      test('it can update device', async () => {
        const server = new BreathServer();
        const { app } = server;

        const allRes = await submitFakeData(app);
        expect(allRes).toHaveLength(numPts);
        for (const res of allRes) {
          expect(res.ok).toBeTruthy();
        }
        {
          const res = await request(app).put(`/api/restricted/update/${id}?${toQuery(capabilities)}`);
          expect(res.ok).toBeTruthy();
        }
        {
          const res = await request(app).get('/api/devices');
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
          expect(body[0].id).toEqual(id);
          expect(body[0].is_hidden).toBeFalsy();
          expect(body[0]).toMatchObject(capabilities);
        }
      });

      test('it can auto update device', async () => {
        const server = new BreathServer();
        const { app } = server;

        const allRes = await submitFakeData(app);
        expect(allRes).toHaveLength(numPts);
        for (const res of allRes) {
          expect(res.ok).toBeTruthy();
        }
        {
          const res = await request(app).put(`/api/restricted/auto-update/${id}`);
          expect(res.ok).toBeTruthy();
        }
        {
          const res = await request(app).get('/api/devices');
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
          expect(body[0].id).toEqual(id);
          expect(body[0].is_hidden).toBeFalsy();
          expect(body[0]).toMatchObject(capabilities);
        }
      });

      describe('query parameters', () => {
        test('it can query with start', async () => {
          const server = new BreathServer();
          const { app } = server;

          const allRes = await submitFakeData(app);
          expect(allRes).toHaveLength(numPts);
          for (const res of allRes) {
            expect(res.ok).toBeTruthy();
          }

          const query = { start: new Date(Date.now() - 10000) };
          const res = await request(app).get(`/api/query?${toQuery(query)}`);
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray<DeviceTimeSeries>(res, 1, 'id', 'series');
          const { id: receivedId, series } = body[0];
          expect(receivedId).toEqual(id);
          expect(series.time).toHaveLength(numPts);
        });

        test('it can query with end', async () => {
          const server = new BreathServer();
          const { app } = server;

          const allRes = await submitFakeData(app);
          expect(allRes).toHaveLength(numPts);
          for (const res of allRes) {
            expect(res.ok).toBeTruthy();
          }
          const query = { end: new Date(Date.now() - 10000) };
          const res = await request(app).get(`/api/query?${toQuery(query)}}`);
          expect(res.ok).toBeTruthy();
          expectJsonArray(res);
        });

        test('it can query with start and end', async () => {
          const server = new BreathServer();
          const { app } = server;

          const allRes = await submitFakeData(app);
          expect(allRes).toHaveLength(numPts);
          for (const res of allRes) {
            expect(res.ok).toBeTruthy();
          }

          const query = { start: new Date(Date.now() - 10000), end: new Date() };
          const res = await request(app).get(`/api/query?${toQuery(query)}`);
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray(res, 1, 'id', 'series');
          const { id: receivedId, series } = body[0];
          expect(receivedId).toEqual(id);
          expect(series.time).toHaveLength(numPts);
        });

        test('it can query with device', async () => {
          const server = new BreathServer();
          const { app } = server;

          const allRes = await submitFakeData(app);
          expect(allRes).toHaveLength(numPts);
          for (const res of allRes) {
            expect(res.ok).toBeTruthy();
          }

          const query = { device: id };
          const res = await request(app).get(`/api/query?${toQuery(query)}`);
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray(res, 1, 'id', 'series');
          const { id: receivedId, series } = body[0];
          expect(receivedId).toEqual(id);
          expect(series.time).toHaveLength(numPts);
        });

        test('it can query with multiple devices', async () => {
          const otherId = createId();
          const server = new BreathServer();
          const { app } = server;

          const allRes = await submitFakeData(app);
          expect(allRes).toHaveLength(numPts);
          for (const res of allRes) {
            expect(res.ok).toBeTruthy();
          }

          const query = { device: [id, otherId] };
          const res = await request(app).get(`/api/query?${toQuery(query)}`);
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray(res, 2, 'id', 'series');
          const { id: receivedId, series } = body[0];
          expect(receivedId).toEqual(id);
          expect(series.time).toHaveLength(numPts);
          expect(body[1]).toMatchObject({ id: otherId, series: { time: [] } });
        });

        test('it can query with points', async () => {
          const server = new BreathServer();
          const { app } = server;

          const allRes = await submitFakeData(app);
          expect(allRes).toHaveLength(numPts);
          for (const res of allRes) {
            expect(res.ok).toBeTruthy();
          }

          const query = { points: Math.round(numPts) };
          const res = await request(app).get(`/api/query?${toQuery(query)}`);
          expect(res.ok).toBeTruthy();
          const body = expectJsonArray(res, 1, 'id', 'series');
          expect(body[0].id).toEqual(id);
          expect(body[0].series.time).toHaveLength(query.points);
        });
      });

      test('it can be deleted', async () => {
        const server = new BreathServer();
        const { app } = server;

        const allRes = await submitFakeData(app);
        expect(allRes).toHaveLength(numPts);
        for (const res of allRes) {
          expect(res.ok).toBeTruthy();
        }
        {
          const res = await request(app).delete(`/api/restricted/delete/${id}`);
          expect(res.ok).toBeTruthy();
        }
        {
          const res = await request(app).get(`/api/query`);
          expect(res.ok).toBeTruthy();
          expectJsonArray(res, 0);
        }
      });
    });
  });

  describe('multi channel', () => {
    const numPts = 10;
    const numChannels = 2;
    const id = createId();
    const capabilities = {
      has_rco2: true,
      has_pm02: true,
      has_atmp: true,
      has_rhum: true,
    };
    const payloads = Array.from(Array(numPts)).map((_) => createSensorChannels(capabilities, numChannels));

    async function submitFakeData<T>(app: T) {
      const responses = [];
      for (const payload of payloads) {
        // Need to ensure these are inserted in order, so synchronously await each one
        responses.push(
          // eslint-disable-next-line no-await-in-loop
          await request(app)
            .post(`/api/restricted/submit/${id}`)
            .send(payload)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
        );
      }
      return responses;
    }

    test('it can insert', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
        expect(body[0].id).toEqual(id);
        expect(body[0].is_hidden).toBeFalsy();
      }
      {
        const res = await request(app).get('/api/query');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceTimeSeries>(res, 1, 'id', 'series');
        expect(body[0].id).toEqual(id);
        expect(body[0].series.time).toHaveLength(numPts);
      }
    });

    test('it can delete', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).delete(`/api/restricted/delete/${id}`);
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/query?mode=all');
        expect(res.ok).toBeTruthy();
        expectJsonArray(res);
      }
    });

    test('it can update channels metadata', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const query = { channels: numChannels };
        const res = await request(app).put(`/api/restricted/update/${id}?${toQuery(query)}`);
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get(`/api/devices`);
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'channels');
        expect(body[0].id).toEqual(id);
        expect(body[0].channels).toEqual(numChannels);
      }
    });

    test('it can auto update metadata', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).put(`/api/restricted/auto-update/${id}`);
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get(`/api/devices`);
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'channels');
        expect(body[0].id).toEqual(id);
        expect(body[0].channels).toEqual(numChannels);
        expect(body[0]).toMatchObject(capabilities);
      }
    });

    test('it can query without channels', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
        expect(body[0].id).toEqual(id);
        expect(body[0].is_hidden).toBeFalsy();
      }
      {
        const res = await request(app).get('/api/query?channels=none');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceTimeSeries>(res, 1, 'id', 'series');
        expect(body[0].id).toEqual(id);
        expect(body[0].series.time).toHaveLength(numPts);
      }
    });

    test('it can query only channels', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
        expect(body[0].id).toEqual(id);
        expect(body[0].is_hidden).toBeFalsy();
      }
      {
        const res = await request(app).get('/api/query?mode=only');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceTimeSeries>(res, 2, 'id', 'channel', 'series');
        for (let channel = 0; channel < numChannels; channel += 1) {
          expect(body[channel].id).toEqual(id);
          expect(body[channel].channel).toEqual(channel);
          expect(body[channel].series.time).toHaveLength(numPts);
        }
      }
    });

    test('it can query mode all', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
        expect(body[0].id).toEqual(id);
        expect(body[0].is_hidden).toBeFalsy();
      }
      {
        const res = await request(app).get('/api/query?mode=all');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceTimeSeries>(res, 3, 'id', 'series');
        expect(body[0].id).toEqual(id);
        expect(body[0].series.time).toHaveLength(numPts);
      }
    });

    test('invalid query mode', async () => {
      const server = new BreathServer();
      const { app } = server;

      const allRes = await submitFakeData(app);
      expect(allRes).toHaveLength(numPts);
      for (const res of allRes) {
        expect(res.ok).toBeTruthy();
      }
      {
        const res = await request(app).get('/api/devices');
        expect(res.ok).toBeTruthy();
        const body = expectJsonArray<DeviceMetadata>(res, 1, 'id', 'is_hidden');
        expect(body[0].id).toEqual(id);
        expect(body[0].is_hidden).toBeFalsy();
      }
      {
        const res = await request(app).get('/api/query?mode=fake');
        expect(res.error).toBeTruthy();
      }
    });
  });
});
