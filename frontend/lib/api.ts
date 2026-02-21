/**
 * Shared backend URL constant for all API routes.
 * Uses BACKEND_URL env variable, falling back to local Docker compose service name.
 * Trailing slashes are stripped to prevent double-slash 301 redirects from the backend.
 */
export const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:4001').replace(/\/+$/, '');
export const BACKEND_API = `${BACKEND_URL}/api`;
