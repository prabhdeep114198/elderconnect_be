import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoCallEntity } from './videocall.entity';
import { VideoCallService } from './videocall.service';
import { VideoCallController } from './videocall.controller';
import { VideoCallGateway } from './videocall.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoCallEntity], 'profile'),
  ],
  controllers: [VideoCallController],
  providers: [VideoCallService, VideoCallGateway],
  exports: [VideoCallService],
})
export class VideoCallModule {}