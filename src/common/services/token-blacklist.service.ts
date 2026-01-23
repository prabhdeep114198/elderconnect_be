import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class TokenBlacklistService {
    private readonly logger = new Logger(TokenBlacklistService.name);
    private readonly BLACKLIST_PREFIX = 'token:blacklist:';
    private readonly REFRESH_TOKEN_PREFIX = 'token:refresh:';

    constructor(private readonly cacheService: CacheService) { }

    /**
     * Blacklist a token (for logout/revocation)
     */
    async blacklistToken(token: string, expiresIn: number): Promise<void> {
        const key = `${this.BLACKLIST_PREFIX}${token}`;
        await this.cacheService.set(key, true, { ttl: expiresIn });
        this.logger.log(`Token blacklisted: ${token.substring(0, 20)}...`);
    }

    /**
     * Check if a token is blacklisted
     */
    async isTokenBlacklisted(token: string): Promise<boolean> {
        const key = `${this.BLACKLIST_PREFIX}${token}`;
        const blacklisted = await this.cacheService.get<boolean>(key);
        return blacklisted === true;
    }

    /**
     * Store refresh token
     */
    async storeRefreshToken(
        userId: string,
        refreshToken: string,
        expiresIn: number,
    ): Promise<void> {
        const key = `${this.REFRESH_TOKEN_PREFIX}${userId}`;
        await this.cacheService.set(key, refreshToken, { ttl: expiresIn });
        this.logger.log(`Refresh token stored for user: ${userId}`);
    }

    /**
     * Get stored refresh token
     */
    async getRefreshToken(userId: string): Promise<string | null> {
        const key = `${this.REFRESH_TOKEN_PREFIX}${userId}`;
        return await this.cacheService.get<string>(key);
    }

    /**
     * Validate refresh token
     */
    async validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
        const storedToken = await this.getRefreshToken(userId);
        return storedToken === refreshToken;
    }

    /**
     * Revoke refresh token
     */
    async revokeRefreshToken(userId: string): Promise<void> {
        const key = `${this.REFRESH_TOKEN_PREFIX}${userId}`;
        await this.cacheService.del(key);
        this.logger.log(`Refresh token revoked for user: ${userId}`);
    }

    /**
     * Revoke all tokens for a user (logout from all devices)
     */
    async revokeAllUserTokens(userId: string): Promise<void> {
        await this.cacheService.delPattern(`${this.REFRESH_TOKEN_PREFIX}${userId}*`);
        this.logger.log(`All tokens revoked for user: ${userId}`);
    }
}
