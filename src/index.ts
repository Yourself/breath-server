import path from 'path';
import { BreathServer } from './api/server';

function getDefaultListenPort() {
  return parseInt(process.env.LISTEN_PORT ?? '3000', 10);
}

function getDefaultDbPath() {
  const filename = process.env.NODE_ENV !== 'production' ? 'dev.db' : 'prod.db';
  return path.join(__dirname, '..', 'data', filename);
}

const server = new BreathServer(getDefaultDbPath());
server.listen(getDefaultListenPort());
