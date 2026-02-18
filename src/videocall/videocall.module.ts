import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoCallEntity } from './videocall.entity';
import { VideoGateway } from '../gateway/video.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoCallEntity], 'profile'),
  ],
  providers: [VideoGateway],
  exports: [],
})
export class VideoCallModule {}