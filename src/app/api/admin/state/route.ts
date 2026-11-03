import { isAdminAuthenticated } from '@/lib/auth';
import { hasPersistentDb, loadAppState, mergeAdminState, saveAppState } from '@/lib/db';
import { INITIAL_STATE } from '@/lib/initial-data';
import { AppDatabaseState } from '@/lib/types';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const isAuth = await isAdminAuthenticated();
  if (!isAuth) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const state = await loadAppState();
  return NextResponse.json({
    state,
    hasCloudDb: hasPersistentDb(),
    hasAiConfigured: Boolean(
      process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        state.settings?.geminiApiKey
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

    const incomingState = body.state as AppDatabaseState;
    if (
      !incomingState ||
      !Array.isArray(incomingState.ingredients) ||
      !Array.isArray(incomingState.products)
    ) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    const currentServerState = await loadAppState();
    // Preserve server-side adminPassword if not explicitly modified
    if (!incomingState.settings.adminPassword && currentServerState.settings?.adminPassword) {
      incomingState.settings.adminPassword = currentServerState.settings.adminPassword;
    }
    if (!incomingState.settings.geminiApiKey && currentServerState.settings?.geminiApiKey) {
      incomingState.settings.geminiApiKey = currentServerState.settings.geminiApiKey;
    }

    const merged = mergeAdminState(currentServerState, incomingState, {
      orderIds: body.deletedOrderIds,
      customerIds: body.deletedCustomerIds,
    });

    const saved = await saveAppState(merged);
    return NextResponse.json({ state: saved });
  } catch (err) {
    console.error('Error saving state:', err);
    return NextResponse.json({ error: 'Falha ao salvar estado' }, { status: 500 });
  }
}
