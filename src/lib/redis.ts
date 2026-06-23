import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let isRedisAvailable = false;

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60; // 2,592,000
const CACHE_PREFIX = 'price-compare:';

/**
 * Initialize Redis client with connection fallback.
 * Gracefully degrades to cache-disabled mode if Redis is unreachable.
 */
export async function initRedis(): Promise<void> {
  try {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries: number) => {
          if (retries > 3) {
            console.warn('[Redis] Reconnection attempts exhausted, running without cache');
            return false;
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    redisClient.on('error', (err: Error) => {
      console.error('[Redis] Client error:', err.message);
      isRedisAvailable = false;
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
      isRedisAvailable = true;
    });

    redisClient.on('ready', () => {
      isRedisAvailable = true;
    });

    redisClient.on('end', () => {
      console.log('[Redis] Disconnected');
      isRedisAvailable = false;
    });

    await redisClient.connect();
  } catch (error) {
    console.warn('[Redis] Connection failed, running without cache:', (error as Error).message);
    isRedisAvailable = false;
    redisClient = null;
  }
}

/**
 * Build a namespaced cache key for a store + query pair.
 */
export function cacheKey(store: string, query: string): string {
  return `${CACHE_PREFIX}${store.toLowerCase()}:${query.toLowerCase().replace(/\s+/g, '_')}`;
}

/**
 * Retrieve cached data.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable || !redisClient) return null;

  try {
    const raw = await redisClient.get(key);
    if (raw) return JSON.parse(raw) as T;
    return null;
  } catch (error) {
    console.error('[Redis] Get error:', (error as Error).message);
    return null;
  }
}

/**
 * Store data in cache with 30-day TTL.
 */
export async function setCached<T>(key: string, data: T): Promise<boolean> {
  if (!isRedisAvailable || !redisClient) return false;

  try {
    await redisClient.setEx(key, THIRTY_DAYS_IN_SECONDS, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('[Redis] Set error:', (error as Error).message);
    return false;
  }
}

/**
 * Check if Redis is connected.
 */
export function isConnected(): boolean {
  return isRedisAvailable;
}

/**
 * Close the Redis connection gracefully.
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Redis] Connection closed gracefully');
    } catch (error) {
      console.error('[Redis] Error closing connection:', (error as Error).message);
    }
  }
}
