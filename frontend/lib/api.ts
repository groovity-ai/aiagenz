/**
 * Shared backend URL constant for all API routes.
 * Uses BACKEND_URL env variable, falling back to local Docker compose service name.
 */
export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
export const BACKEND_API = `${BACKEND_URL}/api`;
