import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { NostalgiaController } from './nostalgia.controller';
import { NostalgiaService } from './nostalgia.service';
import { CognitiveAnalysisService } from './services/cognitive-analysis.service';
import { NostalgiaMemory } from './entities/nostalgia-memory.entity';
import { CognitiveAssessment } from './entities/cognitive-assessment.entity';
import { User } from '../auth/entities/user.entity';
import { VoiceInteraction } from '../voice-assistant/entities/voice-interaction.entity';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NostalgiaMemory, CognitiveAssessment, User], 'auth'),
    TypeOrmModule.forFeature([VoiceInteraction], 'vitals'),
    ConfigModule,
    AiModule,
  ],
  controllers: [NostalgiaController],
  providers: [NostalgiaService, CognitiveAnalysisService],
  exports: [NostalgiaService, CognitiveAnalysisService],
})
export class NostalgiaModule {}
