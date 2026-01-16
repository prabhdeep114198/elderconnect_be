
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
    imports: [ConfigModule],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule { }
