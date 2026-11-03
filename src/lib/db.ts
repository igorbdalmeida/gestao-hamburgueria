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

// IDs fictícios antigos de demonstração que devem ser removidos automaticamente
const LEGACY_DEMO_ORDER_IDS = new Set(['ord-101', 'ord-102']);
const LEGACY_DEMO_CUSTOMER_IDS = new Set(['cust-1', 'cust-2']);
const LEGACY_DEMO_INVOICE_IDS = new Set([
  'inv-nov-01',
  'inv-nov-02',
  'inv-nov-03',
  'inv-nov-04',
  'inv-nov-05',
  'inv-nov-06',
  'inv-nov-07',
]);

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
  if (!state) return structuredClone(INITIAL_STATE);

  const merged: AppDatabaseState = {
    ingredients: Array.isArray(state.ingredients) ? state.ingredients : INITIAL_STATE.ingredients,
    products: Array.isArray(state.products) ? state.products : INITIAL_STATE.products,
    invoices: Array.isArray(state.invoices) ? state.invoices : [],
    fixedCosts: Array.isArray(state.fixedCosts) ? state.fixedCosts : INITIAL_STATE.fixedCosts,
    orders: Array.isArray(state.orders) ? state.orders : [],
    customers: Array.isArray(state.customers) ? state.customers : [],
    settings: {
      ...INITIAL_STATE.settings,
      ...(state.settings || {}),
    },
    updatedAt: state.updatedAt || new Date().toISOString(),
  };

  // Remove automaticamente os dados fictícios de demonstração antigos caso estivessem salvos
  merged.orders = merged.orders.filter((o) => !LEGACY_DEMO_ORDER_IDS.has(o.id));
  merged.customers = merged.customers.filter((c) => !LEGACY_DEMO_CUSTOMER_IDS.has(c.id));
  merged.invoices = merged.invoices.filter((inv) => !LEGACY_DEMO_INVOICE_IDS.has(inv.id));

  return merged;
}

export async function loadAppState(): Promise<AppDatabaseState> {
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
  return normalizeState(global.__APP_DB_STATE__);
}

export async function saveAppState(newState: AppDatabaseState): Promise<AppDatabaseState> {
  const cleaned = normalizeState(newState);
  const updated: AppDatabaseState = { ...cleaned, updatedAt: new Date().toISOString() };
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
 * Salva o estado enviado pelo painel administrativo respeitando integralmente
 * todas as exclusões de pedidos, clientes, notas, produtos e insumos feitas pelo gestor.
 * Preserva apenas pedidos recém-criados pelo cardápio público nos últimos 15 segundos
 * que ainda não tenham sido sincronizados na tela do gestor.
 */
export function mergeAdminState(
  server: AppDatabaseState,
  incoming: AppDatabaseState,
  deleted?: { orderIds?: string[]; customerIds?: string[]; allowFullReplace?: boolean }
): AppDatabaseState {
  if (deleted?.allowFullReplace !== false) {
    // O estado enviado pelo painel administrativo tem autoridade total sobre exclusões.
    // Só preserva pedidos do servidor se tiverem acabado de chegar nos últimos 12 segundos via Cardápio Virtual
    const deletedOrders = new Set(deleted?.orderIds || []);
    const deletedCustomers = new Set(deleted?.customerIds || []);
    const nowMs = Date.now();

    const incomingOrderIds = new Set((incoming.orders || []).map((o) => o.id));
    const brandNewPublicOrders: SaleOrder[] = (server.orders || []).filter((o) => {
      if (incomingOrderIds.has(o.id) || deletedOrders.has(o.id)) return false;
      const createdMs = new Date(o.createdAt).getTime();
      return !Number.isNaN(createdMs) && nowMs - createdMs < 12000;
    });

    const incomingCustomerIds = new Set((incoming.customers || []).map((c) => c.id));
    const brandNewPublicCustomers: CustomerProfile[] = (server.customers || []).filter((c) => {
      if (incomingCustomerIds.has(c.id) || deletedCustomers.has(c.id)) return false;
      const createdMs = new Date(c.createdAt).getTime();
      return !Number.isNaN(createdMs) && nowMs - createdMs < 12000;
    });

    return {
      ...incoming,
      orders: [
        ...brandNewPublicOrders,
        ...(incoming.orders || []).filter((o) => !deletedOrders.has(o.id)),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      customers: [
        ...brandNewPublicCustomers,
        ...(incoming.customers || []).filter((c) => !deletedCustomers.has(c.id)),
      ],
    };
  }

  return incoming;
}

/**
 * Fixed-window rate limiter.
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
