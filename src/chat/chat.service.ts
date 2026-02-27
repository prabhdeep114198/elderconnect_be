
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import axios from 'axios';
import { User } from '../auth/entities/user.entity';
import { Vitals } from '../device/entities/vitals.entity';
import { HealthAnalyticsService } from '../monitoring/analytics.service';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatRequestDto, ChatResponseDto, ContextScores, UserContext, VitalRecord } from './dto/chat.dto';

// ─── HuggingFace Config ───────────────────────────────────────────────────────
const HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODEL = 'deepseek-ai/DeepSeek-V3-0324';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly hfApiKey: string;

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
        // Use the HF key from N8N workflow (HUGGINGFACE_API_KEY or N8N_API_KEY as fallback)
        this.hfApiKey =
            this.configService.get<string>('HUGGINGFACE_API_KEY') ||
            this.configService.get<string>('N8N_API_KEY') ||
            '';

        if (!this.hfApiKey) {
            this.logger.warn('[ChatService] No HuggingFace API key configured (HUGGINGFACE_API_KEY / N8N_API_KEY)');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MAIN ENTRY: replaces the full N8N "ElderConnectChatbot" workflow
    // ═══════════════════════════════════════════════════════════════════════════
    async sendMessage(userId: string, request: ChatRequestDto): Promise<ChatResponseDto> {
        const conversationId = randomUUID();

        try {
            this.logger.log(`[ChatService] Processing message for user ${userId}: "${request.message}"`);

            // ── Step 1: Load context from DB ──────────────────────────────────
            // (replicates N8N "Code in JavaScript1" context building)
            const fullContext = await this.loadUserContext(userId);
            const safeContext = this.summarizeContext(fullContext);

            // ── Step 2: Build system prompt ────────────────────────────────────
            // (exact same logic as N8N "Code in JavaScript1" node)
            const { systemPrompt, userMessage } = this.buildPrompt(request.message, safeContext);

            // ── Step 3: Call HuggingFace DeepSeek-V3 ────────────────────────────
            // (replicates N8N "HTTP Request" node)
            const aiReply = await this.callHuggingFace(systemPrompt, userMessage);

            // ── Step 4: Format response ────────────────────────────────────────
            // (replicates N8N "Code in JavaScript2" node)
            const finalReply = this.formatReply(aiReply, safeContext.riskLevel);

            this.logger.log(`[ChatService] Reply generated for user ${userId} (risk: ${safeContext.riskLevel})`);

            return { reply: finalReply, conversationId };

        } catch (error) {
            this.logger.error(`[ChatService] Error in chat flow: ${error.message}`, error.stack);

            // Graceful fallback — never crash the user experience
            return {
                reply: "I'm having a little trouble connecting to my brain right now, but I'm still here for you. Could you repeat that?",
                conversationId,
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Step 1: Build system prompt + extract user message
    // Replicates N8N "Code in JavaScript1" node exactly
    // ═══════════════════════════════════════════════════════════════════════════
    private buildPrompt(message: string, context: UserContext): { systemPrompt: string; userMessage: string } {
        const scores = context.scores || { physical: 0, mental: 0, sleep: 0 };
        const lastMood = context.lastMood || 'neutral';
        const recentVitals = context.recentVitals || [];
        const riskLevel = context.riskLevel || 'low';

        // Convert recent vitals array to string (same logic as N8N)
        const recentVitalsStr =
            recentVitals.length > 0
                ? recentVitals.map((v: VitalRecord) => `${v.type}: ${v.value} ${v.unit}`).join(', ')
                : 'None';

        const systemPrompt = `You are a supportive health assistant for an elderly care application.

RULES:
- Do NOT give medical diagnoses
- Do NOT prescribe or change medications
- Encourage professional help when risk is medium or high
- Use simple, reassuring language
- Never be alarming

USER CONTEXT:
Physical score: ${scores.physical}
Mental score: ${scores.mental}
Sleep score: ${scores.sleep}
Last mood: ${lastMood}
Recent vitals: ${recentVitalsStr}
Risk level: ${riskLevel}

Respond to the user message below.`;

        const userMessage = message && message.trim() !== '' ? message.trim() : 'Hello!';

        return { systemPrompt, userMessage };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Step 2: Call HuggingFace DeepSeek-V3 (replaces N8N "HTTP Request" node)
    // ═══════════════════════════════════════════════════════════════════════════
    private async callHuggingFace(systemPrompt: string, userMessage: string): Promise<string> {
        if (!this.hfApiKey) {
            this.logger.warn('[ChatService] No HF API key — returning fallback message');
            return "I'm here to help. I see you've been keeping an eye on your health — that's wonderful! What's on your mind today?";
        }

        const payload = {
            model: HF_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
        };

        this.logger.debug(`[ChatService] Calling HuggingFace model: ${HF_MODEL}`);

        try {
            const response = await axios.post(HF_API_URL, payload, {
                headers: {
                    Authorization: `Bearer ${this.hfApiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });

            // Extract content from DeepSeek / OpenAI-compatible response
            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                this.logger.warn('[ChatService] Unexpected HF response format: No content in response. Full response:', JSON.stringify(response.data).substring(0, 500));
                return "I'm here to help. Could you tell me more?";
            }

            return content.trim();
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;
                const body = error.response.data;
                const errorSnippet = JSON.stringify(body).substring(0, 1000);
                this.logger.error(`[ChatService] Hugging Face API Error (${status}): ${errorSnippet}`);

                if (status === 401 || status === 403) {
                    throw new Error('Invalid or expired Hugging Face token. Please check HUGGINGFACE_API_KEY.');
                }
                if (status === 404) {
                    throw new Error(`Model not found or API endpoint invalid: ${HF_MODEL}`);
                }
            }
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Step 3: Format reply (replicates N8N "Code in JavaScript2" node)
    // Appends caregiver advice if risk is high
    // ═══════════════════════════════════════════════════════════════════════════
    private formatReply(reply: string, riskLevel: string): string {
        let finalReply = reply;

        // Same logic as N8N Code in JavaScript2
        if (riskLevel === 'high') {
            finalReply +=
                '\n\nIf you\'re concerned, please consider contacting your caregiver or healthcare provider.';
        }

        return finalReply;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Context loading — fetches real data from DBs (pre-existing logic kept)
    // ═══════════════════════════════════════════════════════════════════════════
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
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            this.logger.warn(`User ${userId} not found when loading context`);
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const profile = await this.userProfileRepository.findOne({ where: { userId } });

        const recentVitals = await this.vitalsRepository.find({
            where: { userId },
            order: { recordedAt: 'DESC' },
            take: 10,
        });

        const vitals = recentVitals.map(v => ({
            type: this.formatVitalType(v.vitalType),
            value: this.extractVitalValue(v),
            unit: v.unit || '',
            timestamp: v.recordedAt.toISOString(),
        }));

        const wellnessProfile = profile
            ? await this.analyticsService.getWellnessProfile(userId, profile.id)
            : {
                physicalScore: 70,
                mentalScore: 70,
                sleepScore: 70,
                socialScore: 70,
                dietScore: 70,
                exerciseScore: 70,
            };

        return {
            userId,
            name: `${user.firstName} ${user.lastName}`,
            diaryEntries: [],
            metrics: wellnessProfile,
            lastMood: 'neutral',
            vitals,
            conditions: profile?.medicalConditions || [],
            emergencyContact: profile?.emergencyContactPhone || '',
        };
    }

    private formatVitalType(type: string): string {
        return type
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
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
                const reading = vital.reading || {};
                const firstValue = Object.values(reading).find(v => typeof v === 'number');
                return (firstValue as number) || 0;
        }
    }

    private summarizeContext(fullData: any): UserContext {
        const scores: ContextScores = {
            physical: fullData.metrics.physicalScore,
            mental: fullData.metrics.mentalScore,
            sleep: fullData.metrics.sleepScore,
            social: fullData.metrics.socialScore,
            diet: fullData.metrics.dietScore,
            exercise: fullData.metrics.exerciseScore,
        };

        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (scores.physical < 50 || scores.mental < 50) riskLevel = 'medium';
        if (scores.physical < 30 || scores.mental < 30) riskLevel = 'high';

        return {
            scores,
            lastMood: fullData.lastMood,
            recentVitals: fullData.vitals.slice(0, 3),
            riskLevel,
        };
    }
}
