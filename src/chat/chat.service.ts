
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRequestDto, ChatResponseDto, UserContext, N8nPayload, ContextScores, VitalRecord } from './dto/chat.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly n8nWebhookUrl: string;
    private readonly n8nApiKey: string;

    constructor(private readonly configService: ConfigService) {
        this.n8nWebhookUrl = this.configService.get<string>('N8N_WEBHOOK_URL') || '';
        this.n8nApiKey = this.configService.get<string>('N8N_API_KEY') || '';

        if (!this.n8nWebhookUrl) {
            this.logger.warn('N8N_WEBHOOK_URL is not defined in environment variables');
        }
    }

    async sendMessage(userId: string, request: ChatRequestDto): Promise<ChatResponseDto> {
        try {
            this.logger.log(`Processing chat message for user ${userId}`);

            const fullContext = await this.mockLoadUserContext(userId);

            const safeContext = this.summarizeContext(fullContext);

            const conversationId = randomUUID();
            const payload: N8nPayload = {
                userId,
                conversationId,
                message: request.message,
                context: safeContext,
            };

            // 4. Call N8N Webhook
            const n8nResult = await this.callN8nWebhook(payload);

            // Handle both object and array response from n8n
            const n8nResponse = Array.isArray(n8nResult) ? n8nResult[0] : n8nResult;

            // 5. Return Response
            return {
                reply: n8nResponse?.reply || n8nResponse?.output || n8nResponse?.text || "I'm here to listen. How can I help you further?",
                conversationId: n8nResponse?.conversationId || conversationId,
            };

        } catch (error) {
            this.logger.error(`Error in chat flow: ${error.message}`, error.stack);
            throw new HttpException(
                'Unable to process chat message at this time',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }

    private async mockLoadUserContext(userId: string): Promise<any> {
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
            userId,
            name: "Elder Smith",
            // Sensitive data that should NOT be forwarded raw if not needed
            diaryEntries: [
                "I felt a bit dizzy this morning.",
                "Had a good lunch with my grandson."
            ],
            // Health metrics
            metrics: {
                physicalScore: 85,
                mentalScore: 72,
                sleepScore: 65,
                socialScore: 90,
                dietScore: 80,
                exerciseScore: 40
            },
            lastMood: "content",
            vitals: [
                { type: "Heart Rate", value: 78, unit: "bpm", timestamp: new Date().toISOString() },
                { type: "Blood Pressure", value: 120, unit: "mmHg", timestamp: new Date().toISOString() }, // Simplified
                { type: "SpO2", value: 98, unit: "%", timestamp: new Date().toISOString() }
            ],
            conditions: ["Hypertension"], // Potentially sensitive
            emergencyContact: "+15550199" // PII
        };
    }

    /**
     * Filters and sanitizes the full context to ensure only safe/relevant info reaches N8N.
     */
    private summarizeContext(fullData: any): UserContext {
        // Logic to calculate overall risk could go here.
        // For now, simple mapping.

        // Extract scores
        const scores: ContextScores = {
            physical: fullData.metrics.physicalScore,
            mental: fullData.metrics.mentalScore,
            sleep: fullData.metrics.sleepScore,
            social: fullData.metrics.socialScore,
            diet: fullData.metrics.dietScore,
            exercise: fullData.metrics.exerciseScore,
        };

        // Determine risk level based on scores (Simple logic for demo)
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (scores.physical < 50 || scores.mental < 50) riskLevel = 'medium';
        if (scores.physical < 30 || scores.mental < 30) riskLevel = 'high';

        return {
            scores,
            lastMood: fullData.lastMood,
            recentVitals: fullData.vitals.slice(0, 3), // Limit to 3 most recent
            riskLevel
        };
    }

    /**
     * Sends the payload to the private N8N webhook.
     */
    private async callN8nWebhook(payload: N8nPayload): Promise<any> {
        if (!this.n8nWebhookUrl) {
            // Fallback for development if no URL is set
            this.logger.debug('No N8N URL configured. Returning mock response.');
            return { reply: "I see. Tell me more about how you are feeling (Mock Response - N8N not connected)." };
        }

        try {
            const response = await fetch(this.n8nWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': this.n8nApiKey || '', // Secure handshake
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`N8N responded with status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            this.logger.error(`Failed to call N8N: ${error.message}`);
            throw error;
        }
    }
}
