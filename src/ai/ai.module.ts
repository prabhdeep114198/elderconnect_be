import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEngineService } from './ai-engine.service';
import { XaiService } from './xai.service';
import { XaiController } from './xai.controller';
import { HealthScoreModule } from '../health-score/health-score.module';
import { ProfileModule } from '../profile/profile.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [
    HealthScoreModule,
    ProfileModule,
    MonitoringModule,
  ],
  controllers: [XaiController],
  providers: [AiEngineService, XaiService],
  exports: [XaiService],
})
export class AiModule {}
