import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';
import * as fs from 'fs';

@Injectable()
export class VoiceService {
    private readonly logger = new Logger(VoiceService.name);

    constructor(private configService: ConfigService) { }

    /**
     * Transcribes audio using OpenAI Whisper (or Hugging Face Inference Providers).
     * Prefers OPENAI_API_KEY; falls back to HUGGINGFACE_API_KEY / HF_TOKEN / N8N_API_KEY for HF.
     */
    async transcribe(file: Express.Multer.File): Promise<string> {
        // Read file into buffer immediately so cleanup cannot race with streaming
        let audioBuffer: Buffer | null = null;
        try {
            if (file?.path && fs.existsSync(file.path)) {
                audioBuffer = fs.readFileSync(file.path);
            }
        } catch (readErr) {
            this.logger.error(`Failed to read uploaded audio file: ${readErr.message}`);
            throw new Error('Could not read uploaded audio file.');
        } finally {
            // Safe to delete now — buffer is already in memory
            try {
                if (file?.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            } catch (_) { /* ignore cleanup errors */ }
        }

        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Uploaded audio file is empty or missing.');
        }

        try {
            const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
            const hfToken =
                this.configService.get<string>('HUGGINGFACE_API_KEY') ||
                this.configService.get<string>('HF_TOKEN') ||
                this.configService.get<string>('N8N_API_KEY');

            if (openAiKey) {
                return await this.transcribeOpenAI(audioBuffer, file, openAiKey);
            }
            if (hfToken) {
                return await this.transcribeHuggingFace(audioBuffer, file, hfToken);
            }
            this.logger.warn('No STT API keys found (OPENAI_API_KEY or HUGGINGFACE_API_KEY). Returning mock.');
            return 'This is a mock transcription because no AI keys are configured.';
        } catch (error) {
            this.logger.error(`Transcription failed: ${error.message}`);
            throw new Error(error instanceof Error ? error.message : 'Failed to transcribe audio.');
        }
    }

    private async transcribeOpenAI(audioBuffer: Buffer, file: Express.Multer.File, apiKey: string): Promise<string> {
        this.logger.log('Transcribing via OpenAI...');
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: file.originalname || 'audio.m4a',
            contentType: file.mimetype || 'audio/mpeg',
        });
        formData.append('model', 'whisper-1');

        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                Authorization: `Bearer ${apiKey}`,
            },
            timeout: 60000,
        });
        return response.data.text;
    }

    /**
     * Uses Hugging Face Inference Providers (router.huggingface.co).
     * Uses OpenAI-compatible /v1/audio/transcriptions endpoint with multipart FormData.
     */
    private async transcribeHuggingFace(audioBuffer: Buffer, file: Express.Multer.File, token: string): Promise<string> {
        this.logger.log(`Transcribing via Hugging Face Inference API (Model: openai/whisper-large-v3)...`);
        try {
            const response = await axios.post<{ text: string }>(
                'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3',
                audioBuffer,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': file.mimetype || 'audio/m4a',
                    },
                    timeout: 60000,
                },
            );

            return response.data.text;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;
                const body = error.response.data;
                const errorSnippet = JSON.stringify(body).substring(0, 1000);
                this.logger.error(`Hugging Face Router API Error (${status}): ${errorSnippet}`);

                if (status === 401 || status === 403) {
                    throw new Error('Invalid or expired Hugging Face token. Please check HUGGINGFACE_API_KEY.');
                }
                if (status === 404) {
                    throw new Error('Hugging Face transcription endpoint not found. Check the model name or API URL.');
                }
                if (status === 503) {
                    throw new Error('Voice transcription service is busy. Please try again in a moment.');
                }

                const msg = body?.error?.message || body?.message || 'Hugging Face service error';
                throw new Error(msg);
            }
            this.logger.error(`Hugging Face Request Failed: ${error.message}`);
            throw error;
        }
    }
}
