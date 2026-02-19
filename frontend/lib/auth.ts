import { cookies } from 'next/headers';

/**
 * Shared auth helper for Next.js API routes.
 * Extracts the JWT token from cookies.
 */
export async function getToken(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get('token')?.value;
}
