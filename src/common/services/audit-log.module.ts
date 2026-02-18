import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog], 'audit'),
  ],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule { }
