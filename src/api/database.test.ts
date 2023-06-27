import { faker } from '@faker-js/faker';
import { filterSeries, median } from './database';
import { ReadingTimePoint } from './types';

describe('median', () => {
  test('it handles empty', () => {
    expect(median([])).toBeUndefined();
  });

  test('it handles one element', () => {
    expect(median([1])).toEqual(1);
  });

  test('it handles two elements', () => {
    expect(median([1, 3])).toEqual(2);
  });

  test.each([
    [[1, 2, 3], 2],
    [[2, 4, 6, 8], 5],
    [[1, 2, 3, 4, 5], 3],
    [[2, 4, 6, 8, 10, 100], 7],
  ])('it handles many elements', (values, expected) => {
    expect(median(values)).toEqual(expected);
  });
});

describe('filtering', () => {
  const refDate = new Date();
  describe('uniform distribution', () => {
    const numPoints = 1000;
    const points: ReadingTimePoint[] = [];
    faker.seed(0);
    while (points.length < numPoints) {
      points.push({
        time: faker.date.recent({ refDate }),
        atmp: faker.number.float({ min: -20, max: 30 }),
      });
    }
    points.sort((a, b) => a.time.getTime() - b.time.getTime());

    test.each([1, 2, 10, 99, 100, 500, 501, 900, 999])('it returns the correct number of points', (desiredPts) => {
      const filtered = filterSeries(points, desiredPts);
      expect(filtered).toHaveLength(Math.min(desiredPts, points.length));
    });
  });

  describe('dense towards present', () => {
    const numPoints = 1000;
    const points: ReadingTimePoint[] = [];
    faker.seed(0);
    while (points.length < numPoints - 10) {
      points.push({
        time: faker.date.recent({ days: 0.5, refDate }),
        atmp: faker.number.float({ min: -20, max: 30 }),
      });
    }

    while (points.length < numPoints) {
      points.push({
        time: faker.date.recent({ refDate }),
        atmp: faker.number.float({ min: -20, max: 30 }),
      });
    }

    test.each([1, 2, 10, 99, 100, 500, 501, 900, 999])('it returns the correct number of points', (desiredPts) => {
      const filtered = filterSeries(points, desiredPts);
      expect(filtered).toHaveLength(Math.min(desiredPts, points.length));
    });
  });

  describe('dense towards past', () => {
    const numPoints = 1000;
    const points: ReadingTimePoint[] = [];
    faker.seed(0);
    while (points.length < numPoints - 10) {
      points.push({
        time: faker.date.recent({ days: 0.5, refDate: refDate.getTime() - 12 * 3600 }),
        atmp: faker.number.float({ min: -20, max: 30 }),
      });
    }

    while (points.length < numPoints) {
      points.push({
        time: faker.date.recent({ refDate }),
        atmp: faker.number.float({ min: -20, max: 30 }),
      });
    }

    test.each([1, 2, 10, 99, 100, 500, 501, 900, 999])('it returns the correct number of points', (desiredPts) => {
      const filtered = filterSeries(points, desiredPts);
      expect(filtered).toHaveLength(Math.min(desiredPts, points.length));
    });
  });
});
