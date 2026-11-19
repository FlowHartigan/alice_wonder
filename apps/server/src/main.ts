import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeServer } from './server.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const dataDir = resolve(process.env.DATA_DIR ?? resolve(root, '.data'));
mkdirSync(dataDir, { recursive: true });
const server = makeServer({
  database: resolve(dataDir, 'lobbies.sqlite'),
  webRoot: resolve(root, 'apps/web/dist'),
  publicOrigin: process.env.PUBLIC_ORIGIN,
});
server.http.listen(port, host, () => console.log(`Salon : http://${host}:${port}`));
