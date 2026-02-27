import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VoiceAssistantController } from './voice-assistant.controller';
import { VoiceAssistantService } from './voice-assistant.service';

// Profile entities
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Appointment } from '../profile/entities/appointment.entity';
import { Medication } from '../profile/entities/medication.entity';
import { SocialEvent } from '../profile/entities/social-event.entity';

// Vitals entity
import { Vitals } from '../device/entities/vitals.entity';

@Module({
    imports: [
        // Profile DB repositories
        TypeOrmModule.forFeature(
            [UserProfile, Appointment, Medication, SocialEvent],
            'profile',
        ),
        // Vitals DB repositories
        TypeOrmModule.forFeature([Vitals], 'vitals'),
    ],
    controllers: [VoiceAssistantController],
    providers: [VoiceAssistantService],
    exports: [VoiceAssistantService],
})
export class VoiceAssistantModule { }
