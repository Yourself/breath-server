import path from 'path';

export function isDev() {
  return process.env.NODE_ENV !== 'production';
}

export function getDir(...relative: string[]) {
  return path.resolve(process.cwd(), ...relative);
}

export function getDbPath() {
  const filename = isDev() ? 'dev.db' : 'prod.db';
  const dirname = getDir('data');
  return path.join(dirname, filename);
}
