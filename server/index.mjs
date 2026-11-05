import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createApp } from './app.mjs';
const stations = JSON.parse(
  await readFile(new URL('../web/public/stations.json', import.meta.url), 'utf8'),
);
const server = createApp(stations, {
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:4200',
  staticRoot: fileURLToPath(new URL('../web/dist/web/browser', import.meta.url)),
});
server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Radialla API ready'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
