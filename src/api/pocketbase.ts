import PocketBase from 'pocketbase';
import { logger, LogCategory } from '../../services/logger.ts';

const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(pocketbaseUrl);

logger.info(LogCategory.NETWORK, '[PocketBase] 初始化:', {
  url: pocketbaseUrl,
  isValid: pb.authStore.isValid,
  modelId: pb.authStore.model?.id,
  hasToken: !!pb.authStore.token,
});

export async function ensureValidAuth(): Promise<boolean> {
  if (!pb.authStore.isValid) return false;
  try {
    // authRefresh will auto-extend the token
    await pb.collection('users').authRefresh();
    return true;
  } catch {
    // Don't clear auth store on transient network errors.
    // Returning false falls back to offline save; the stale token
    // will be retried next time and eventually cleared server-side.
    return false;
  }
}

// Periodically refresh the auth token every 30 minutes
let refreshInterval: ReturnType<typeof setInterval> | null = null;
export function startTokenRefresh(): void {
  stopTokenRefresh();
  refreshInterval = setInterval(
    async () => {
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh();
          logger.info(LogCategory.NETWORK, '[PocketBase] Token auto-refreshed');
        } catch {
          logger.warn(LogCategory.NETWORK, '[PocketBase] Token refresh failed');
        }
      }
    },
    30 * 60 * 1000,
  );
}

export function stopTokenRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
