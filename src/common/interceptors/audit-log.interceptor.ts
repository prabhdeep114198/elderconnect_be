import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from '../services/audit-log.service';
import { AuditAction } from '../enums/user-role.enum';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, body, params, query } = request;

    const action = this.getActionFromMethod(method);
    const resource = this.getResourceFromUrl(url);

    return next.handle().pipe(
      tap({
        next: (response) => {
          this.auditLogService.log({
            userId: user?.id,
            action,
            resource,
            isSuccessful: true,
            details: {
              method,
              url,
              body: this.sanitizeBody(body),
              params,
              query,
              statusCode: 200,
            },
            ipAddress: request.ip,
            userAgent: request.get('User-Agent'),
            timestamp: new Date(),
          });
        },
        error: (error) => {
          this.auditLogService.log({
            userId: user?.id,
            action,
            resource,
            isSuccessful: false,
            errorMessage: error.message,
            details: {
              method,
              url,
              body: this.sanitizeBody(body),
              params,
              query,
              error: error.message,
              statusCode: error.status || 500,
            },
            ipAddress: request.ip,
            userAgent: request.get('User-Agent'),
            timestamp: new Date(),
          });
        },
      }),
    );

  }

  private getActionFromMethod(method: string): AuditAction {
    switch (method.toUpperCase()) {
      case 'POST':
        return AuditAction.CREATE;
      case 'GET':
        return AuditAction.READ;
      case 'PUT':
      case 'PATCH':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      default:
        return AuditAction.READ;
    }
  }

  private getResourceFromUrl(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'unknown';
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey'];

    Object.keys(sanitized).forEach(key => {
      // Redact sensitive fields
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
        return;
      }

      // Truncate large data (like base64 strings)
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
        sanitized[key] = sanitized[key].substring(0, 1000) + '... [TRUNCATED]';
      }
    });

    return sanitized;
  }
}
