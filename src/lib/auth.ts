import { cookies } from 'next/headers';
import { loadAppState } from './db';
import { ADMIN_COOKIE_NAME, safeEqual, verifySession } from './session';

export { ADMIN_COOKIE_NAME };

/**
 * Verifies the provided password/PIN against:
 * 1. Custom password saved by the owner in state.settings.adminPassword
 * 2. Environment variable ADMIN_PIN / ADMIN_PASSWORD
 * 3. Initial access key ('monster2026' or '1234' if not customized yet)
 */
export async function verifyAdminCredential(input: string): Promise<boolean> {
  const clean = input.trim();
  if (!clean) return false;

  try {
    const state = await loadAppState();
    const customSaved = state.settings?.adminPassword?.trim();
    if (customSaved && customSaved.length >= 4) {
      return await safeEqual(clean, customSaved);
    }
  } catch {
    // ignore state load error and fallback to env
  }

  const envPin = (process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN || '').trim();
  if (envPin) {
    return await safeEqual(clean, envPin);
  }

  const matchMonster = await safeEqual(clean, 'monster2026');
  const matchLegacy = await safeEqual(clean, '1234');
  return matchMonster || matchLegacy;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    const payload = await verifySession(token, 'admin');
    return payload?.sub === 'admin';
  } catch {
    return false;
  }
}
