import { parseBoolean, parseInteger } from './parse';

describe('parseBoolean', () => {
  test('it handles null', () => {
    expect(parseBoolean()).toBeUndefined();
  });

  test.each(['', 'f', 't', '  ', '0abc', 'f0', 'fail', 't r u e'])("it handles invalid string '%s'", (s) => {
    expect(parseBoolean(s)).toBeUndefined();
  });

  test.each([
    ['0', false],
    ['1', true],
    [' 0 ', false],
    ['\t1', true],
    ['124', true],
  ])("it parses numeric string '%s' => %s", (value, expected) => {
    expect(parseBoolean(value)).toEqual(expected);
  });

  test.each([
    ['true', true],
    ['TRUE', true],
    ['True', true],
    ['TrUe', true],
    ['   true   ', true],
    ['false', false],
    ['FALSE', false],
    ['False', false],
    ['FaLsE', false],
    ['\tfalse  ', false],
  ])("it parses boolean string '%s' => %s", (value, expected) => {
    expect(parseBoolean(value)).toEqual(expected);
  });
});

describe('parseInteger', () => {
  test('it handles null', () => {
    expect(parseInteger()).toBeUndefined();
  });

  test.each(['', 'abc', '  ', 'ten', ' 10s', '0.0', '- 1'])("it handles invalid string '%s'", (s) => {
    expect(parseInteger(s)).toBeUndefined();
  });

  test.each([
    ['0', 0],
    ['1', 1],
    ['-1', -1],
    ['1234', 1234],
    ['  56  ', 56],
    ['-2  ', -2],
    ['  -8', -8],
  ])("it parses '%s' => %s", (value, expected) => {
    expect(parseInteger(value)).toEqual(expected);
  });
});
