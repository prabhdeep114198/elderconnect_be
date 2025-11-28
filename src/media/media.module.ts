import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaFile } from './entities/media-file.entity';
import { S3Service } from './services/s3.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog } from '../common/services/entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaFile], 'media'),
    TypeOrmModule.forFeature([AuditLog], 'audit'),
    MulterModule.register({
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, S3Service, AuditLogService],
  exports: [MediaService, S3Service],
})
export class MediaModule {}
