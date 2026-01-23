import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

export interface CacheOptions {
    ttl?: number; // Time to live in seconds
}

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);

    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    /**
     * Get a value from cache
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.cacheManager.get<T>(key);
            if (value) {
                this.logger.debug(`Cache HIT: ${key}`);
            } else {
                this.logger.debug(`Cache MISS: ${key}`);
            }
            return value || null;
        } catch (error) {
            this.logger.error(`Cache GET error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Set a value in cache
     */
    async set(key: string, value: any, options?: CacheOptions): Promise<void> {
        try {
            const ttl = options?.ttl ? options.ttl * 1000 : undefined; // Convert to milliseconds
            await this.cacheManager.set(key, value, ttl);
            this.logger.debug(`Cache SET: ${key} (TTL: ${options?.ttl || 'default'}s)`);
        } catch (error) {
            this.logger.error(`Cache SET error for key ${key}:`, error);
        }
    }

    /**
     * Delete a value from cache
     */
    async del(key: string): Promise<void> {
        try {
            await this.cacheManager.del(key);
            this.logger.debug(`Cache DEL: ${key}`);
        } catch (error) {
            this.logger.error(`Cache DEL error for key ${key}:`, error);
        }
    }

    /**
     * Delete multiple keys matching a pattern
     */
    async delPattern(pattern: string): Promise<void> {
        try {
            // Note: This requires ioredis store
            const store = (this.cacheManager as any).store;
            if (store && store.keys) {
                const keys = await store.keys(pattern);
                if (keys && keys.length > 0) {
                    await Promise.all(keys.map((key: string) => this.cacheManager.del(key)));
                    this.logger.debug(`Cache DEL pattern: ${pattern} (${keys.length} keys)`);
                }
            }
        } catch (error) {
            this.logger.error(`Cache DEL pattern error for ${pattern}:`, error);
        }
    }

    /**
     * Reset the entire cache
     */
    async reset(): Promise<void> {
        try {
            // Note: reset() is not in the Cache type definition, use store directly
            const store = (this.cacheManager as any).store;
            if (store && store.client && store.client.flushall) {
                await store.client.flushall();
                this.logger.warn('Cache RESET: All keys deleted');
            } else {
                this.logger.warn('Cache RESET: Not supported by current store');
            }
        } catch (error) {
            this.logger.error('Cache RESET error:', error);
        }
    }

    /**
     * Wrap a function with caching
     */
    async wrap<T>(
        key: string,
        fn: () => Promise<T>,
        options?: CacheOptions,
    ): Promise<T> {
        try {
            const cached = await this.get<T>(key);
            if (cached !== null) {
                return cached;
            }

            const result = await fn();
            await this.set(key, result, options);
            return result;
        } catch (error) {
            this.logger.error(`Cache WRAP error for key ${key}:`, error);
            // If caching fails, still execute the function
            return fn();
        }
    }

    /**
     * Generate cache key for user data
     */
    getUserCacheKey(userId: string, suffix?: string): string {
        return suffix ? `user:${userId}:${suffix}` : `user:${userId}`;
    }

    /**
     * Generate cache key for device data
     */
    getDeviceCacheKey(deviceId: string, suffix?: string): string {
        return suffix ? `device:${deviceId}:${suffix}` : `device:${deviceId}`;
    }

    /**
     * Generate cache key for profile data
     */
    getProfileCacheKey(userId: string): string {
        return `profile:${userId}`;
    }

    /**
     * Invalidate all user-related caches
     */
    async invalidateUserCache(userId: string): Promise<void> {
        await this.delPattern(`user:${userId}:*`);
        await this.del(this.getProfileCacheKey(userId));
    }
}
