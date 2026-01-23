
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { User } from '../auth/entities/user.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Vitals } from '../device/entities/vitals.entity';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([User], 'auth'),
        TypeOrmModule.forFeature([UserProfile], 'profile'),
        TypeOrmModule.forFeature([Vitals], 'vitals'),
    ],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule { }
