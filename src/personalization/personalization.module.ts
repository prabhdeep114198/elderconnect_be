import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserInteraction } from './entities/user-interaction.entity';
import { PersonalizationService } from './personalization.service';
import { PersonalizationController } from './personalization.controller';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([UserInteraction], 'profile'),
        MonitoringModule,
        ProfileModule,
    ],
    controllers: [PersonalizationController],
    providers: [PersonalizationService],
    exports: [PersonalizationService],
})
export class PersonalizationModule { }
