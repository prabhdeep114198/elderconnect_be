
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Vitals } from '../device/entities/vitals.entity';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([User], 'auth'),
        TypeOrmModule.forFeature([UserProfile], 'profile'),
        TypeOrmModule.forFeature([Vitals], 'vitals'),
        MonitoringModule,
    ],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule { }
