import next from 'next';
import path from 'path';
import { OGImageGenerator } from './api/ogimage';
import { BreathServer } from './api/server';

const dev = process.env.NODE_ENV !== 'production';

function getDefaultListenPort() {
  return parseInt(process.env.LISTEN_PORT ?? '3000', 10);
}

function getDefaultDbPath() {
  const filename = dev ? 'dev.db' : 'prod.db';
  return path.join(__dirname, '..', 'data', filename);
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = new BreathServer(getDefaultDbPath());
  const ogImage = new OGImageGenerator(server);
  ogImage.bind();

  server.app.all('*', (req, res) => {
    handle(req, res);
  });

  server.listen(getDefaultListenPort());
});
