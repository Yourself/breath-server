import next from 'next';
import { OGImageGenerator } from './api/ogimage';
import { BreathServer } from './api/server';
import { getDbPath, isDev } from './env';

function getDefaultListenPort() {
  return parseInt(process.env.LISTEN_PORT ?? '3000', 10);
}

const app = next({ dev: isDev() });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = new BreathServer(getDbPath());
  const ogImage = new OGImageGenerator(server);
  ogImage.bind();

  server.app.all('*', (req, res) => {
    handle(req, res);
  });

  server.listen(getDefaultListenPort());
});
