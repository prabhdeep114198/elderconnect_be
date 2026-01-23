import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class DeviceAuthGuard extends AuthGuard(['jwt', 'firebase']) {
    constructor(private readonly apiKeyGuard: ApiKeyGuard) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Try API Key first (common for hardware/testing)
        const canActivateWithApiKey = this.apiKeyGuard.canActivate(context);
        if (canActivateWithApiKey) {
            return true;
        }

        // Fallback to standard user auth
        try {
            return (await super.canActivate(context)) as boolean;
        } catch (e) {
            return false;
        }
    }
}
