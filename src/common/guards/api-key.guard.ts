import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(private readonly configService: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key'];

        // In local development, we might want to allow a default key if not set
        const validApiKey = this.configService.get<string>('DEVICE_API_KEY') || 'dev-device-key-123';

        if (apiKey && apiKey === validApiKey) {
            return true;
        }

        return false;
    }
}
