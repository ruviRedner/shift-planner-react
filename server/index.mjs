import { resolve } from 'node:path';
import { createTeamServer } from './app.mjs';
import { createPostgresStore } from './postgresStore.mjs';

const host = process.env.HOST ?? '127.0.0.1', port = Number(process.env.PORT ?? 3080);
if (process.env.RENDER && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required on Render to preserve data');
const store = process.env.DATABASE_URL ? await createPostgresStore(process.env.DATABASE_URL) : undefined;
const app = createTeamServer({ store, publicEditing: process.env.PUBLIC_EDITING === 'true', dataFile: resolve(process.env.PLANNER_DATA_FILE ?? '.planner-data/team.json'),
  setupToken: process.env.PLANNER_SETUP_TOKEN, secureCookies: process.env.COOKIE_SECURE === '1', appOrigin: process.env.APP_ORIGIN });
const needsSetup = await app.needsSetup();
app.server.listen(port, host, () => {
  console.log(`Team server: http://${host}:${port}`);
  if (needsSetup && process.env.PUBLIC_EDITING !== 'true') console.log(`First administrator setup code: ${app.setupToken}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  app.server.close(async () => { await store?.close(); process.exit(0); });
});
