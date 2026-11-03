import { isAdminAuthenticated, verifyAdminCredential } from '@/lib/auth';
import { checkRateLimit, getClientIp, loadAppState, resetRateLimit, saveAppState } from '@/lib/db';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  signSession,
} from '@/lib/session';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS_PER_IP = 5; // 5 tentativas a cada 15 minutos por IP
const MAX_ATTEMPTS_GLOBAL = 30; // 30 tentativas por hora global

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ authenticated });
}

export async function POST(request: Request) {
  let body: { pin?: unknown; action?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 });
  }

  if (body.action === 'logout') {
    const res = NextResponse.json({ ok: true, authenticated: false });
    res.cookies.set(ADMIN_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return res;
  }

  if (body.action === 'change_password') {
    const isAuth = await isAdminAuthenticated();
    if (!isAuth) {
      return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
    }
    const nextPass = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';
    if (nextPass.length < 4) {
      return NextResponse.json(
        { ok: false, error: 'A nova senha/PIN deve ter pelo menos 4 caracteres.' },
        { status: 400 }
      );
    }
    const state = await loadAppState();
    state.settings = { ...state.settings, adminPassword: nextPass };
    await saveAppState(state);
    return NextResponse.json({ ok: true, message: 'Senha de acesso atualizada com sucesso.' });
  }

  const ip = getClientIp(request);
  const ipKey = `login:ip:${ip}`;
  const [ipAllowed, globalAllowed] = await Promise.all([
    checkRateLimit(ipKey, MAX_ATTEMPTS_PER_IP, 15 * 60),
    checkRateLimit('login:global', MAX_ATTEMPTS_GLOBAL, 60 * 60),
  ]);
  if (!ipAllowed || !globalAllowed) {
    return NextResponse.json(
      { ok: false, error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
      { status: 429 }
    );
  }

  const pin = typeof body.pin === 'string' ? body.pin.trim().slice(0, 64) : '';
  const valid = await verifyAdminCredential(pin);

  if (!valid) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ ok: false, error: 'Credencial de acesso inválida.' }, { status: 401 });
  }

  await resetRateLimit(ipKey);
  const token = await signSession('admin', ADMIN_SESSION_MAX_AGE, 'admin');
  const res = NextResponse.json({ ok: true, authenticated: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return res;
}
