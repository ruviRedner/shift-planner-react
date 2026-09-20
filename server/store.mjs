import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { makeInitialData } from '../src/domain/planner.ts';

export function initialTeamState() {
  return {
    version: 1, revision: 0, planner: makeInitialData(), users: [], invitations: [], requests: [], audit: [],
  };
}

export function createTeamStore(file) {
  let state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : initialTeamState();
  if (state.version !== 1 || !Array.isArray(state.users)) throw new Error('Unsupported team data file');
  return {
    read: () => state,
    update(transform) {
      const next = transform(structuredClone(state));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
      state = next;
      return state;
    },
  };
}
