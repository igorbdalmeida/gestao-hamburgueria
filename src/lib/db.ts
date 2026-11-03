import { neon } from '@neondatabase/serverless';
import { promises as fs } from 'fs';
import path from 'path';
import { INITIAL_STATE } from './initial-data';
import { AppDatabaseState, CustomerProfile, SaleOrder } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __APP_DB_STATE__: AppDatabaseState | undefined;
  // eslint-disable-next-line no-var
  var __RATE_LIMIT__: Map<string, { count: number; resetAt: number }> | undefined;
}

const LOCAL_FILE_PATH = path.join(process.cwd(), '.data-store.json');

function getDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL
  );
}

/** True when data survives restarts (Postgres configured, or local dev file). */
export function hasPersistentDb(): boolean {
  return Boolean(getDatabaseUrl()) || process.env.NODE_ENV !== 'production';
}

let tablesReady = false;

async function getSql() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) return null;
  const sql = neon(dbUrl);
  if (!tablesReady) {
    await sql`
      CREATE TABLE IF NOT EXISTS hamburgueria_app_state (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS security_rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at TIMESTAMPTZ NOT NULL
      )
    `;
    tablesReady = true;
  }
  return sql;
}

function normalizeState(state: AppDatabaseState): AppDatabaseState {
  return {
    ...structuredClone(INITIAL_STATE),
    ...state,
    settings: { ...INITIAL_STATE.settings, ...(state.settings || {}) },
  };
}

export async function loadAppState(): Promise<AppDatabaseState> {
  // If Postgres is configured, errors must propagate: falling back to seed data here
  // could later overwrite the real database with demo data.
  const sql = await getSql();

  if (sql) {
    const rows = await sql`SELECT payload FROM hamburgueria_app_state WHERE id = 'main' LIMIT 1`;
    if (rows.length > 0 && rows[0].payload) {
      const state = normalizeState(rows[0].payload as AppDatabaseState);
      global.__APP_DB_STATE__ = state;
      return state;
    }
    const seed = structuredClone(INITIAL_STATE);
    await sql`
      INSERT INTO hamburgueria_app_state (id, payload, updated_at)
      VALUES ('main', ${JSON.stringify(seed)}::jsonb, NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    global.__APP_DB_STATE__ = seed;
    return seed;
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const raw = await fs.readFile(LOCAL_FILE_PATH, 'utf-8');
      const parsed = normalizeState(JSON.parse(raw) as AppDatabaseState);
      global.__APP_DB_STATE__ = parsed;
      return parsed;
    } catch {
      // file does not exist yet
    }
  }

  if (!global.__APP_DB_STATE__) {
    global.__APP_DB_STATE__ = structuredClone(INITIAL_STATE);
  }
  return global.__APP_DB_STATE__;
}

export async function saveAppState(newState: AppDatabaseState): Promise<AppDatabaseState> {
  const updated: AppDatabaseState = { ...newState, updatedAt: new Date().toISOString() };
  global.__APP_DB_STATE__ = updated;

  const sql = await getSql();
  if (sql) {
    await sql`
      INSERT INTO hamburgueria_app_state (id, payload, updated_at)
      VALUES ('main', ${JSON.stringify(updated)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  } else if (process.env.NODE_ENV !== 'production') {
    await fs.writeFile(LOCAL_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8').catch(() => {});
  }
  return updated;
}

/**
 * Merge an admin-side save with the latest server state so that orders and customers
 * created by the public menu while the admin had the page open are never overwritten.
 * - Records present in the admin payload win (admin edits status, notes, tags...).
 * - Records that exist only on the server are kept, unless the admin explicitly deleted them.
 */
export function mergeAdminState(
  server: AppDatabaseState,
  incoming: AppDatabaseState,
  deleted: { orderIds?: string[]; customerIds?: string[] }
): AppDatabaseState {
  const deletedOrders = new Set(deleted.orderIds || []);
  const deletedCustomers = new Set(deleted.customerIds || []);

  const incomingOrderIds = new Set(incoming.orders.map((o) => o.id));
  const serverOnlyOrders: SaleOrder[] = server.orders.filter(
    (o) => !incomingOrderIds.has(o.id) && !deletedOrders.has(o.id)
  );

  const serverCustomers = new Map(server.customers.map((c) => [c.id, c]));
  const incomingCustomerIds = new Set(incoming.customers.map((c) => c.id));
  const mergedCustomers: CustomerProfile[] = incoming.customers
    .filter((c) => !deletedCustomers.has(c.id))
    .map((c) => {
      const srv = serverCustomers.get(c.id);
      // Public menu updates order statistics; keep whichever has more orders recorded.
      if (srv && srv.totalOrders > c.totalOrders) {
        return {
          ...srv,
          tags: c.tags,
          adminNotes: c.adminNotes,
          giftHistory: c.giftHistory,
          name: c.name || srv.name,
        };
      }
      return c;
    });
  const serverOnlyCustomers = server.customers.filter(
    (c) => !incomingCustomerIds.has(c.id) && !deletedCustomers.has(c.id)
  );

  return {
    ...incoming,
    orders: [...serverOnlyOrders, ...incoming.orders.filter((o) => !deletedOrders.has(o.id))].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    ),
    customers: [...serverOnlyCustomers, ...mergedCustomers],
  };
}

/**
 * Fixed-window rate limiter. Uses Postgres when available (shared across all serverless
 * instances), otherwise falls back to per-instance memory.
 * Returns true when the request is allowed.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const sql = await getSql();
    if (sql) {
      const rows = await sql`
        INSERT INTO security_rate_limits (key, count, reset_at)
        VALUES (${key}, 1, NOW() + make_interval(secs => ${windowSeconds}))
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN security_rate_limits.reset_at < NOW() THEN 1 ELSE security_rate_limits.count + 1 END,
          reset_at = CASE WHEN security_rate_limits.reset_at < NOW()
            THEN NOW() + make_interval(secs => ${windowSeconds})
            ELSE security_rate_limits.reset_at END
        RETURNING count
      `;
      return Number(rows[0]?.count || 0) <= limit;
    }
  } catch (err) {
    console.error('Rate limit DB error, using memory fallback:', err);
  }

  if (!global.__RATE_LIMIT__) global.__RATE_LIMIT__ = new Map();
  const now = Date.now();
  const entry = global.__RATE_LIMIT__.get(key);
  if (!entry || entry.resetAt < now) {
    global.__RATE_LIMIT__.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export async function resetRateLimit(key: string): Promise<void> {
  try {
    const sql = await getSql();
    if (sql) await sql`DELETE FROM security_rate_limits WHERE key = ${key}`;
  } catch {
    // ignore
  }
  global.__RATE_LIMIT__?.delete(key);
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim();
}
