export function parseBoolean(s?: string) {
  if (s == null) {
    return undefined;
  }

  if (/^\s*\d+\s*$/.test(s)) {
    return parseInt(s, 10) !== 0;
  }

  if (/^\s*false\s*$/i.test(s)) {
    return false;
  }

  if (/^\s*true\s*$/i.test(s)) {
    return true;
  }

  return undefined;
}

export function parseInteger(s?: string) {
  if (s != null && /^\s*-?\d+\s*$/.test(s)) {
    return parseInt(s, 10);
  }
  return undefined;
}
