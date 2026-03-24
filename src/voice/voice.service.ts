import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';


@Injectable()
export class VoiceService {
    private readonly logger = new Logger(VoiceService.name);

    constructor(private configService: ConfigService) { }

    /**
     * Transcribes audio using OpenAI Whisper.
     */
    async transcribe(file: Express.Multer.File): Promise<string> {
        try {
            const openAiKey = this.configService.get<string>('OPENAI_API_KEY');

            if (openAiKey) {
                return this.transcribeOpenAI(file, openAiKey);
            }

            this.logger.warn('No STT API keys found (OPENAI_API_KEY). Returning mock.');
            return "This is a mock transcription because no AI keys are configured.";
        } catch (error) {
            this.logger.error(`Transcription failed: ${error.message}`);
            throw new Error(error instanceof Error ? error.message : 'Failed to transcribe audio.');
        }
    }

    private async transcribeOpenAI(file: Express.Multer.File, apiKey: string): Promise<string> {
        this.logger.log('Transcribing via OpenAI...');
        const formData = new FormData();
        formData.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
        });
        formData.append('model', 'whisper-1');

        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${apiKey}`,
            },
        });
        return response.data.text;
    }


}
