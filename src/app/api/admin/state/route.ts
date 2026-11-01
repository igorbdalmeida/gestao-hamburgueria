import { isAdminAuthenticated } from '@/lib/auth';
import { loadAppState, saveAppState } from '@/lib/db';
import { INITIAL_STATE } from '@/lib/initial-data';
import { AppDatabaseState } from '@/lib/types';
import { NextResponse } from 'next/server';

export async function GET() {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const state = await loadAppState();
  return NextResponse.json({
    state,
    hasCloudDb: Boolean(
      process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL
    ),
  });
}

export async function POST(request: Request) {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.action === 'reset_demo') {
      const saved = await saveAppState(structuredClone(INITIAL_STATE));
      return NextResponse.json({ state: saved });
    }

    const newState = body.state as AppDatabaseState;
    if (!newState || !Array.isArray(newState.ingredients) || !Array.isArray(newState.products)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    const saved = await saveAppState(newState);
    return NextResponse.json({ state: saved });
  } catch (err) {
    console.error('Error saving state:', err);
    return NextResponse.json({ error: 'Falha ao salvar estado' }, { status: 500 });
  }
}
