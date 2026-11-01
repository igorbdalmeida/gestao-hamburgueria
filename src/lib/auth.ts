import { cookies } from 'next/headers';

export const ADMIN_COOKIE_NAME = 'brutus_admin_session';

export function getAdminPin(): string {
  return process.env.ADMIN_PIN || '1234';
}

export function createSessionToken(pin: string): string {
  // Simple deterministic token hash
  return Buffer.from(`admin_auth_verified:${pin}:hamburgueria_secret`).toString('base64');
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return false;
    return token === createSessionToken(getAdminPin());
  } catch {
    return false;
  }
}
