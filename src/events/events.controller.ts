import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('external')
  async getExternalEvents(@Query() query: any) {
    const events = await this.eventsService.fetchExternalEvents(query);

    return {
      success: true,
      count: events.length,
      events,
    };
  }
}