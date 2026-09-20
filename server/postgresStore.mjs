import { Pool } from 'pg';
import { initialTeamState } from './store.mjs';

export async function createPostgresStore(connectionString) {
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000 });
  pool.on('error', () => console.error('Database connection interrupted'));
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS shift_planner_state (id INTEGER PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL)');
    await pool.query('INSERT INTO shift_planner_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(initialTeamState())]);
  } catch (error) {
    await pool.end();
    throw error;
  }
  function validate(state) {
    if (state?.version !== 1 || !Array.isArray(state.users)) throw new Error('Unsupported team database state');
    return state;
  }
  return {
    async read() {
      const result = await pool.query('SELECT data FROM shift_planner_state WHERE id = 1');
      return validate(result.rows[0]?.data);
    },
    async update(transform) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT data FROM shift_planner_state WHERE id = 1 FOR UPDATE');
        const next = validate(transform(validate(result.rows[0]?.data)));
        await client.query('UPDATE shift_planner_state SET data = $1::jsonb WHERE id = 1', [JSON.stringify(next)]);
        await client.query('COMMIT');
        return next;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
