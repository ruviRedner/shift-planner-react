import { resolve } from 'node:path';
import { createTeamServer } from './app.mjs';

const host = process.env.HOST ?? '127.0.0.1', port = Number(process.env.PORT ?? 3080);
const app = createTeamServer({ dataFile: resolve(process.env.PLANNER_DATA_FILE ?? '.planner-data/team.json'),
  setupToken: process.env.PLANNER_SETUP_TOKEN, secureCookies: process.env.COOKIE_SECURE === '1', appOrigin: process.env.APP_ORIGIN });
app.server.listen(port, host, () => {
  console.log(`Team server: http://${host}:${port}`);
  if (app.needsSetup()) console.log(`First administrator setup code: ${app.setupToken}`);
});
