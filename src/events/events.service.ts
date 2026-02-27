import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class EventsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async fetchExternalEvents(query: any) {
  const token = this.configService.get<string>('PREDICTHQ_TOKEN');

  const response = await firstValueFrom(
    this.httpService.get('https://api.predicthq.com/v1/events/', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        country: 'IN',
        'start.gte': new Date().toISOString(),
        limit: 20,
      },
    }),
  );

  return response.data.results.map((e: any) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    start: e.start,
    end: e.end,
    category: e.category,

    
    location:
  e.geo?.address?.formatted_address ||
  e.entities?.[0]?.formatted_address ||
  "Location details available on request",
  }));
}
}