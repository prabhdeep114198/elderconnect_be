import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VoiceAssistantController } from './voice-assistant.controller';
import { VoiceAssistantService } from './voice-assistant.service';

// Profile entities
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Appointment } from '../profile/entities/appointment.entity';
import { Medication } from '../profile/entities/medication.entity';
import { SocialEvent } from '../profile/entities/social-event.entity';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';

// Vitals entity
import { Vitals } from '../device/entities/vitals.entity';
import { VoiceInteraction } from './entities/voice-interaction.entity';
import { AssistantMemoryService } from './services/assistant-memory.service';
import { PersonalizationModule } from '../personalization/personalization.module';
import { AiModule } from '../ai/ai.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            UserProfile,
            Appointment,
            Medication,
            SocialEvent,
            DailyHealthMetric
        ], 'profile'),
        TypeOrmModule.forFeature([
            Vitals,
            VoiceInteraction
        ], 'vitals'),
        PersonalizationModule,
        AiModule,
    ],
    controllers: [VoiceAssistantController],
    providers: [VoiceAssistantService, AssistantMemoryService],
    exports: [VoiceAssistantService, AssistantMemoryService],
})
export class VoiceAssistantModule { }
