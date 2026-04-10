import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly model = 'llama-3.3-70b-versatile';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GROQ_API_KEY') || 
                  this.configService.get<string>('GROK_API_KEY') || '';
  }

  async generateStructuredResponse(systemPrompt: string, userMessage: string): Promise<any> {
    if (!this.apiKey) {
      this.logger.error('AI API Key is missing');
      throw new Error('AI Service Unavailable');
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1, // Low temperature for consistent JSON
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`AI Generation Failed: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response Data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}
