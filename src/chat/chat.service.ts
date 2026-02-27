
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Vitals } from '../device/entities/vitals.entity';
import { HealthAnalyticsService } from '../monitoring/analytics.service';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatRequestDto, ChatResponseDto, ContextScores, N8nPayload, UserContext } from './dto/chat.dto';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly n8nWebhookUrl: string;
    private readonly n8nApiKey: string;

    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(User, 'auth')
        private readonly userRepository: Repository<User>,
        @InjectRepository(UserProfile, 'profile')
        private readonly userProfileRepository: Repository<UserProfile>,
        @InjectRepository(Vitals, 'vitals')
        private readonly vitalsRepository: Repository<Vitals>,
        private readonly analyticsService: HealthAnalyticsService,
    ) {
        this.n8nWebhookUrl = this.configService.get<string>('n8n.webhookUrl') || '';
        this.n8nApiKey = this.configService.get<string>('n8n.apiKey') || '';

        if (!this.n8nWebhookUrl) {
            this.logger.warn('N8N_WEBHOOK_URL is not defined in environment variables');
        }
    }

    async sendMessage(userId: string, request: ChatRequestDto): Promise<ChatResponseDto> {
        const conversationId = randomUUID();
        try {
            this.logger.log(`Processing chat message for user ${userId}`);

            const fullContext = await this.loadUserContext(userId);
            const safeContext = this.summarizeContext(fullContext);

            const payload: N8nPayload = {
                userId,
                conversationId,
                message: request.message,
                context: safeContext,
            };

            // 4. Call N8N Webhook
            const n8nResult = await this.callN8nWebhook(payload);

            // Handle both object and array response from n8n
            const n8nResponse = n8nResult ? (Array.isArray(n8nResult) ? n8nResult[0] : n8nResult) : null;

            // 5. Return Response
            return {
                reply: n8nResponse?.reply ||
                    n8nResponse?.output ||
                    n8nResponse?.text ||
                    (typeof n8nResponse === 'string' && n8nResponse.length > 0 ? n8nResponse : null) ||
                    this.getFallbackMessage(safeContext),
                conversationId: n8nResponse?.conversationId || conversationId,
            };

        } catch (error) {
            this.logger.error(`Error in chat flow: ${error.message}`, error.stack);

            // Fallback response instead of crashing for the user
            return {
                reply: "I'm having a little trouble connecting to my brain right now, but I'm still here for you. Could you repeat that?",
                conversationId,
            };
        }
    }

    private getFallbackMessage(context: UserContext): string {
        const mood = context.lastMood;
        if (mood === 'content' || mood === 'happy') {
            return "It's good to hear you're feeling well! What's on your mind? I'm here to listen.";
        }
        if (context.riskLevel === 'high') {
            return "I'm here for you. It sounds like you might be going through a tough time. Would you like to talk more about how you're feeling?";
        }
        return "I'm listening. Tell me more about what's on your mind. How can I help you today?";
    }



    private async loadUserContext(userId: string): Promise<any> {
        // Fetch User basic info
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            this.logger.warn(`User ${userId} not found when loading context`);
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        // Fetch User Profile for medical info
        const profile = await this.userProfileRepository.findOne({ where: { userId } });

        // Fetch recent vitals (last 10 readings)
        const recentVitals = await this.vitalsRepository.find({
            where: { userId },
            order: { recordedAt: 'DESC' },
            take: 10
        });

        // Map Vitals to simplified format
        const vitals = recentVitals.map(v => ({
            type: this.formatVitalType(v.vitalType),
            value: this.extractVitalValue(v),
            unit: v.unit || '',
            timestamp: v.recordedAt.toISOString()
        }));

        // Fetch real wellness scores from analytics service
        const wellnessProfile = profile
            ? await this.analyticsService.getWellnessProfile(userId, profile.id)
            : { physicalScore: 70, mentalScore: 70, sleepScore: 70, socialScore: 70, dietScore: 70, exerciseScore: 70 };

        return {
            userId,
            name: `${user.firstName} ${user.lastName}`,
            diaryEntries: [],
            metrics: wellnessProfile,
            lastMood: "neutral",
            vitals,
            conditions: profile?.medicalConditions || [],
            emergencyContact: profile?.emergencyContactPhone || ""
        };
    }

    private formatVitalType(type: string): string {
        return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    private extractVitalValue(vital: Vitals): number | string {
        switch (vital.vitalType) {
            case 'blood_pressure':
                const bp = vital.bloodPressureReading;
                return bp ? `${bp.systolic}/${bp.diastolic}` : 0;
            case 'heart_rate':
                return vital.heartRate || 0;
            case 'temperature':
                return vital.temperature || 0;
            case 'weight':
                return vital.weight || 0;
            case 'blood_sugar':
                return vital.bloodSugar || 0;
            case 'oxygen_saturation':
                return vital.oxygenSaturation || 0;
            default:
                // Try to find a numeric value in reading
                const reading = vital.reading || {};
                const firstValue = Object.values(reading).find(v => typeof v === 'number');
                return (firstValue as number) || 0;
        }
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
            this.logger.debug('No N8N URL configured. Returning mock response.');
            return { reply: "I see. Tell me more about how you are feeling (Mock Response - N8N not connected)." };
        }

        try {
            const targetUrl = this.n8nWebhookUrl;

            this.logger.debug(`Calling N8N Webhook: ${targetUrl}`);

            // Add 'text' field for better compatibility with default n8n AI nodes
            const enrichedPayload = {
                ...payload,
                text: payload.message // Some n8n nodes expect 'text' instead of 'message'
            };

            this.logger.debug(`Payload sent to N8N: ${JSON.stringify(enrichedPayload)}`);

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.n8nApiKey ? { 'X-API-KEY': this.n8nApiKey } : {}),
                },
                body: JSON.stringify(enrichedPayload),
            });



            const responseText = await response.text();
            this.logger.debug(`N8N Status: ${response.status}`);

            // Log headers to see n8n internal hints
            const headers: Record<string, string> = {};
            response.headers.forEach((val, key) => headers[key] = val);
            this.logger.debug(`N8N Response Headers: ${JSON.stringify(headers)}`);

            this.logger.debug(`N8N Raw Response: "${responseText}"`);

            if (!response.ok) {
                this.logger.error(`N8N Error (${response.status}): ${responseText}`);
                throw new Error(`N8N responded with status: ${response.status}`);
            }

            if (!responseText || responseText.trim() === '') {
                this.logger.warn('N8N returned an empty response');
                return null;
            }

            try {
                return JSON.parse(responseText);
            } catch (e) {
                this.logger.warn(`Failed to parse N8N response as JSON. Raw response: ${responseText}`);
                return responseText; // Return as raw string
            }
        } catch (error) {
            this.logger.error(`Failed to call N8N: ${error.message}`);
            // propagate error to be caught by sendMessage catch block
            throw error;
        }
    }

}
