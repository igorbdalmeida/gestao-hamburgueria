import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase();
  const { pathname } = request.nextUrl;

  // Se o cliente estiver acessando por um domínio exclusivo de cardápio (ex: monsterburger.vercel.app),
  // bloqueia qualquer tentativa de acessar /gestao ou rotas /api/admin no nível de Edge.
  const isDedicatedCardapioDomain =
    host.startsWith('monsterburger.') ||
    host.startsWith('monster-burger') ||
    host.startsWith('pedir-') ||
    host.startsWith('cardapio-') ||
    host.startsWith('pedido-');
  if (isDedicatedCardapioDomain) {
    if (pathname.startsWith('/gestao') || pathname.startsWith('/api/admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  const response = NextResponse.next();

  // Security headers para blindagem contra clickjacking, MIME sniffing e vazamento de referrer
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  if (pathname.startsWith('/gestao')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.jpg).*)'],
};
