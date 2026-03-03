import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';

/** New Hugging Face Inference Providers base URL (old api-inference.huggingface.co returns 410 Gone). */
const HF_INFERENCE_ASR_URL = 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3';

@Injectable()
export class VoiceService {
    private readonly logger = new Logger(VoiceService.name);

    constructor(private configService: ConfigService) { }

    /**
     * Transcribes audio using OpenAI Whisper (or Hugging Face Inference Providers).
     * Prefers OPENAI_API_KEY; falls back to HUGGINGFACE_API_KEY / HF_TOKEN / N8N_API_KEY for HF.
     */
    async transcribe(file: Express.Multer.File): Promise<string> {
        try {
            const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
            const hfToken =
                this.configService.get<string>('HUGGINGFACE_API_KEY') ||
                this.configService.get<string>('HF_TOKEN') ||
                this.configService.get<string>('N8N_API_KEY');

            if (openAiKey) {
                return this.transcribeOpenAI(file, openAiKey);
            }
            if (hfToken) {
                return this.transcribeHuggingFace(file, hfToken);
            }
            this.logger.warn('No STT API keys found (OPENAI_API_KEY or HUGGINGFACE_API_KEY/HF_TOKEN/N8N_API_KEY). Returning mock.');
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

    /**
     * Uses Hugging Face Inference Providers (router.huggingface.co).
     * Old api-inference.huggingface.co is deprecated (410 Gone).
     */
    private async transcribeHuggingFace(file: Express.Multer.File, token: string): Promise<string> {
        this.logger.log(`Transcribing via Hugging Face (Model: whisper-large-v3, Mime: ${file.mimetype})...`);
        try {
            const audioBuffer = file.buffer;

            const response = await axios.post<{ text?: string; transcript?: string }>(
                HF_INFERENCE_ASR_URL,
                audioBuffer,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': file.mimetype || 'audio/mpeg',
                        'Accept': 'application/json', // Override axios default to be strict
                    },
                    timeout: 60000,
                },
            );

            const data = response.data;
            if (data?.text) return data.text;
            if (data?.transcript) return data.transcript;
            if (typeof data === 'string') return data;

            this.logger.debug(`Unexpected HF response format: ${JSON.stringify(data).substring(0, 500)}`);
            throw new Error('Unexpected response format from speech recognition.');
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;
                const body = error.response.data;
                const errorSnippet = JSON.stringify(body).substring(0, 1000);
                this.logger.error(`Hugging Face API Error (${status}): ${errorSnippet}`);

                if (status === 410) {
                    throw new Error('Voice recognition service has been updated. Please use a Hugging Face token with Inference Providers permission.');
                }
                if (status === 401 || status === 403) {
                    throw new Error('Invalid or expired Hugging Face token. Please check HUGGINGFACE_API_KEY.');
                }
                if (status === 503 || (typeof body === 'object' && body?.error?.includes?.('loading'))) {
                    throw new Error('Voice service is warming up. Please try again in 30 seconds.');
                }

                const msg = typeof body?.error === 'string' ? body.error : (body?.message || 'Hugging Face service error');
                throw new Error(msg);
            }
            this.logger.error(`Hugging Face Request Failed: ${error.message}`);
            throw error;
        }
    }
}
