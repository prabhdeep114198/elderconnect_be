import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [HttpModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}