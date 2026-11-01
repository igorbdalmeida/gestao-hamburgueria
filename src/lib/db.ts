import { neon } from '@neondatabase/serverless';
import { promises as fs } from 'fs';
import path from 'path';
import { INITIAL_STATE } from './initial-data';
import { AppDatabaseState } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __APP_DB_STATE__: AppDatabaseState | undefined;
}

const LOCAL_FILE_PATH = path.join(process.cwd(), '.data-store.json');

function getDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL
  );
}

async function ensurePostgresTable() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return null;
  const sql = neon(dbUrl);
  await sql`
    CREATE TABLE IF NOT EXISTS hamburgueria_app_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  return sql;
}

export async function loadAppState(): Promise<AppDatabaseState> {
  // 1. Try Neon Postgres if configured
  const dbUrl = getDatabaseUrl();
  if (dbUrl) {
    try {
      const sql = await ensurePostgresTable();
      if (sql) {
        const rows = await sql`
          SELECT payload FROM hamburgueria_app_state WHERE id = 'main' LIMIT 1
        `;
        if (rows.length > 0 && rows[0].payload) {
          const state = rows[0].payload as AppDatabaseState;
          global.__APP_DB_STATE__ = state;
          return state;
        } else {
          // Seed initial state into Postgres
          await sql`
            INSERT INTO hamburgueria_app_state (id, payload, updated_at)
            VALUES ('main', ${JSON.stringify(INITIAL_STATE)}::jsonb, NOW())
            ON CONFLICT (id) DO NOTHING
          `;
          global.__APP_DB_STATE__ = INITIAL_STATE;
          return INITIAL_STATE;
        }
      }
    } catch (err) {
      console.error('Postgres load fallback to local/memory:', err);
    }
  }

  // 2. Try local file store
  try {
    const raw = await fs.readFile(LOCAL_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AppDatabaseState;
    global.__APP_DB_STATE__ = parsed;
    return parsed;
  } catch {
    // ignore if file does not exist
  }

  // 3. Fallback to global memory or INITIAL_STATE
  if (!global.__APP_DB_STATE__) {
    global.__APP_DB_STATE__ = structuredClone(INITIAL_STATE);
  }
  return global.__APP_DB_STATE__;
}

export async function saveAppState(newState: AppDatabaseState): Promise<AppDatabaseState> {
  const updated: AppDatabaseState = {
    ...newState,
    updatedAt: new Date().toISOString(),
  };

  global.__APP_DB_STATE__ = updated;

  const dbUrl = getDatabaseUrl();
  if (dbUrl) {
    try {
      const sql = await ensurePostgresTable();
      if (sql) {
        await sql`
          INSERT INTO hamburgueria_app_state (id, payload, updated_at)
          VALUES ('main', ${JSON.stringify(updated)}::jsonb, NOW())
          ON CONFLICT (id) DO UPDATE
          SET payload = EXCLUDED.payload, updated_at = NOW()
        `;
      }
    } catch (err) {
      console.error('Postgres save error:', err);
    }
  }

  try {
    await fs.writeFile(LOCAL_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  } catch {
    // On Vercel serverless read-only filesystem without Postgres, memory cache handles runtime
  }

  return updated;
}
