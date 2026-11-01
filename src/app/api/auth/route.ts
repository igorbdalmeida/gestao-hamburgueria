import { ADMIN_COOKIE_NAME, createSessionToken, getAdminPin, isAdminAuthenticated } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ authenticated });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pin, action } = body;

    if (action === 'logout') {
      const res = NextResponse.json({ ok: true, authenticated: false });
      res.cookies.delete(ADMIN_COOKIE_NAME);
      return res;
    }

    const expectedPin = getAdminPin();
    if (String(pin).trim() !== expectedPin) {
      return NextResponse.json(
        { ok: false, error: 'PIN de acesso incorreto.' },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ ok: true, authenticated: true });
    res.cookies.set(ADMIN_COOKIE_NAME, createSessionToken(expectedPin), {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: 'Erro ao autenticar' }, { status: 400 });
  }
}
