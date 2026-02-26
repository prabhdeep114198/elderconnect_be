import {
    Injectable,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';

import { VoiceAssistantRequestDto, ParsedIntent, VoiceAssistantResponse, IntentType } from './dto/voice-assistant.dto';

// Profile entities
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Appointment } from '../profile/entities/appointment.entity';
import { Medication } from '../profile/entities/medication.entity';
import { SocialEvent } from '../profile/entities/social-event.entity';

// Vitals entity
import { Vitals } from '../device/entities/vitals.entity';

// ─── HuggingFace Config ───────────────────────────────────────────────────────
const HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';
const HF_MODEL = 'deepseek-ai/DeepSeek-V3-0324';

// ─── System Prompt (same as N8N) ─────────────────────────────────────────────
const INTENT_SYSTEM_PROMPT = `You are a backend-safe intent parser for an elderly care voice assistant.

Your job is to:
1. Correct grammar
2. Detect intent
3. Extract structured fields
4. Output STRICT, backend-ready JSON

You MUST classify every request into EXACTLY ONE of these values:
CREATE_EVENT | LOG_VITAL | REMINDER | QUERY_INFO | ERROR | UNKNOWN

The incoming request ALWAYS includes a JWT.
You MUST return the SAME jwt value unchanged.

IMPORTANT BACKEND RULES (MANDATORY):
- For CREATE_EVENT and REMINDER, you MUST return a single ISO 8601 datetime field called "scheduledAt"
- "scheduledAt" MUST be a valid ISO string: YYYY-MM-DDTHH:MM:SSZ
- NEVER return separate date/time fields
- NEVER invent timestamps
- If date or time is missing or unclear, return typeOfRequest = ERROR

FIELD EXTRACTION RULES:
- If a place, venue, or location is mentioned (e.g., auditorium, hospital, home, clinic), extract it into "location"
- If no location is mentioned, return location as null

Intent rules:
- REMINDER: Asking to be reminded
- CREATE_EVENT: Scheduling an appointment, activity, or medication
- LOG_VITAL: Reporting a health measurement
- QUERY_INFO: Asking a question
- ERROR: Missing or invalid required info
- UNKNOWN: Intent unclear

Return ONLY valid JSON in EXACTLY this format:

{
  "typeOfRequest": "CREATE_EVENT" | "LOG_VITAL" | "REMINDER" | "QUERY_INFO" | "ERROR" | "UNKNOWN",
  "correctedText": "corrected sentence",
  "message": "friendly confirmation or clarification",
  "jwt": "same JWT value received",
  "data": {
    "title": "short title",
    "scheduledAt": "YYYY-MM-DDTHH:MM:SSZ",
    "location": "venue or place name or null",
    "description": "details",
    "type": "appointment" | "medication" | "activity" | "reminder",

    "vitalType": "blood_pressure" | "heart_rate" | "temperature" | "glucose" | "weight",
    "value": "measurement value",
    "unit": "measurement unit",
    "notes": "additional context",

    "queryType": "type of query",
    "details": "query specifics"
  }
}

STRICT RULES:
- Output ONLY JSON
- No markdown
- No explanations
- No extra text
- All required fields MUST be present for the detected intent`;

@Injectable()
export class VoiceAssistantService {
    private readonly logger = new Logger(VoiceAssistantService.name);
    private readonly hfApiKey: string;

    constructor(
        private readonly configService: ConfigService,

        @InjectRepository(UserProfile, 'profile')
        private readonly profileRepository: Repository<UserProfile>,

        @InjectRepository(Appointment, 'profile')
        private readonly appointmentRepository: Repository<Appointment>,

        @InjectRepository(Medication, 'profile')
        private readonly medicationRepository: Repository<Medication>,

        @InjectRepository(SocialEvent, 'profile')
        private readonly socialEventRepository: Repository<SocialEvent>,

        @InjectRepository(Vitals, 'vitals')
        private readonly vitalsRepository: Repository<Vitals>,
    ) {
        this.hfApiKey =
            this.configService.get<string>('HUGGINGFACE_API_KEY') ||
            this.configService.get<string>('N8N_API_KEY') ||
            this.configService.get<string>('HF_TOKEN') ||
            '';
    }

    // ═══════════════════════════════════════════════════════════════════
    // MAIN ENTRY: process voice command (replicates N8N pipeline)
    // ═══════════════════════════════════════════════════════════════════
    async processVoiceCommand(dto: VoiceAssistantRequestDto): Promise<VoiceAssistantResponse> {
        const { text, userContext, jwt } = dto;
        const userId = userContext.userId;

        this.logger.log(`[VoiceAssistant] Processing command for user ${userId}: "${text}"`);

        // ── Step 1: Call HuggingFace Intent Parser ──────────────────────
        let parsed: ParsedIntent;
        try {
            parsed = await this.callHuggingFaceIntentParser(text, jwt);
        } catch (err) {
            this.logger.error(`[VoiceAssistant] HF Intent Parser failed: ${err.message}`);
            return this.buildErrorResponse(text, 'Sorry, I had trouble understanding that. Could you please try again?', userId);
        }

        // ── Step 2: Validate parsed response ───────────────────────────
        if (!parsed.typeOfRequest) {
            return this.buildErrorResponse(text, 'I could not determine what you want to do. Please try again.', userId);
        }

        // Inject userId + originalText
        const originalText = text;

        this.logger.log(`[VoiceAssistant] Intent detected: ${parsed.typeOfRequest} | Message: ${parsed.message}`);

        // ── Step 3: Route by action ─────────────────────────────────────
        switch (parsed.typeOfRequest as IntentType) {
            case 'CREATE_EVENT':
                return this.handleCreateEvent(parsed, userId, originalText);

            case 'LOG_VITAL':
                return this.handleLogVital(parsed, userId, originalText);

            case 'REMINDER':
                return this.handleReminder(parsed, userId, originalText);

            case 'QUERY_INFO':
                return this.handleQueryInfo(parsed, userId, originalText);

            case 'ERROR':
                return {
                    success: false,
                    action: 'ERROR',
                    originalText,
                    correctedText: parsed.correctedText || text,
                    message: parsed.message || 'There was an error processing your request.',
                    timestamp: new Date().toISOString(),
                };

            case 'UNKNOWN':
            default:
                return {
                    success: true,
                    action: 'UNKNOWN',
                    originalText,
                    correctedText: parsed.correctedText || text,
                    message: parsed.message || "I'm not sure what you mean. Could you rephrase?",
                    timestamp: new Date().toISOString(),
                };
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // HuggingFace: Call DeepSeek Intent Parser
    // ═══════════════════════════════════════════════════════════════════
    private async callHuggingFaceIntentParser(text: string, jwt: string): Promise<ParsedIntent> {
        if (!this.hfApiKey) {
            throw new Error('No HuggingFace API token configured (HUGGINGFACE_API_KEY)');
        }

        const payload = {
            model: HF_MODEL,
            messages: [
                { role: 'system', content: INTENT_SYSTEM_PROMPT },
                { role: 'user', content: `JWT: ${jwt}\n\nUser said: "${text}"` },
            ],
            temperature: 0.2,
            max_tokens: 400,
        };

        try {
            const response = await axios.post(HF_API_URL, payload, {
                headers: {
                    Authorization: `Bearer ${this.hfApiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No content returned from HuggingFace');
            }

            return this.parseAIResponse(content, text, jwt);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;
                const body = error.response.data;
                const errorSnippet = JSON.stringify(body).substring(0, 1000);
                this.logger.error(`[VoiceAssistant] Hugging Face API Error (${status}): ${errorSnippet}`);
            }
            this.logger.error(`[VoiceAssistant] Intent parsing failed: ${error.message}`);
            return this.getFallbackIntent(text, jwt);
        }
    }

    private parseAIResponse(content: string, originalText: string, jwt: string): ParsedIntent {
        let rawContent = content.trim()
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '');

        // Extract JSON
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            rawContent = rawContent.substring(firstBrace, lastBrace + 1);
        }

        try {
            const parsed: ParsedIntent = JSON.parse(rawContent);
            if (!parsed.correctedText) parsed.correctedText = originalText;
            if (!parsed.message) parsed.message = "I've processed your request.";
            if (!parsed.data) parsed.data = {};
            parsed.jwt = jwt;
            return parsed;
        } catch (e) {
            this.logger.error(`[VoiceAssistant] JSON Parse failed: ${rawContent}`);
            return this.getFallbackIntent(originalText, jwt);
        }
    }

    private getFallbackIntent(text: string, jwt: string): ParsedIntent {
        return {
            typeOfRequest: 'UNKNOWN',
            correctedText: text,
            message: "I heard you, but I'm having trouble connecting to my brain right now. Could you please repeat that?",
            jwt: jwt,
            data: {}
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // Handlers
    // ═══════════════════════════════════════════════════════════════════
    private async handleCreateEvent(parsed: ParsedIntent, userId: string, originalText: string): Promise<VoiceAssistantResponse> {
        const { data, correctedText, message } = parsed;
        try {
            const profile = await this.getUserProfile(userId);
            const eventType = (data.type || 'activity').toLowerCase();

            if (eventType === 'appointment') {
                if (!data.scheduledAt) throw new BadRequestException('Appointment requires a scheduledAt date/time.');
                const appointment = this.appointmentRepository.create({
                    userProfileId: profile.id,
                    title: data.title || 'Appointment',
                    description: correctedText || data.description,
                    scheduledAt: new Date(data.scheduledAt as string),
                    location: data.location || undefined,
                    reminderEnabled: true,
                });
                const saved = await this.appointmentRepository.save(appointment);
                return { success: true, action: 'CREATE_EVENT', originalText, correctedText, message, appointmentId: saved.id, timestamp: new Date().toISOString() };
            }

            if (eventType === 'medication') {
                if (!data.scheduledAt) throw new BadRequestException('Medication requires a scheduledAt date/time.');
                const med = this.medicationRepository.create({
                    userProfileId: profile.id,
                    name: data.title || 'Medication',
                    dosage: data.value || '1 dose',
                    startDate: new Date(data.scheduledAt as string),
                    isActive: true,
                });
                const saved = await this.medicationRepository.save(med);
                return { success: true, action: 'CREATE_EVENT', originalText, correctedText, message, medicationId: saved.id, timestamp: new Date().toISOString() };
            }

            // Default: Social Event / Activity
            if (!data.scheduledAt) throw new BadRequestException('Activity requires a scheduledAt date/time.');
            const event = this.socialEventRepository.create({
                hostId: profile.id,
                title: data.title || 'Activity',
                description: correctedText || data.description,
                scheduledAt: new Date(data.scheduledAt as string),
                category: eventType,
            });
            const saved = await this.socialEventRepository.save(event);
            return { success: true, action: 'CREATE_EVENT', originalText, correctedText, message, eventId: saved.id, timestamp: new Date().toISOString() };
        } catch (err) {
            this.logger.error(`[VoiceAssistant] CREATE_EVENT failed: ${err.message}`);
            return this.buildErrorResponse(originalText, `Could not create event: ${err.message}`, userId);
        }
    }

    private async handleLogVital(parsed: ParsedIntent, userId: string, originalText: string): Promise<VoiceAssistantResponse> {
        const { data, correctedText, message } = parsed;
        try {
            const vitalType = this.normalizeVitalType(data.vitalType || 'unknown');
            const unit = data.unit || this.defaultUnit(vitalType);

            const vital = this.vitalsRepository.create({
                userId,
                vitalType,
                reading: data.value ? { value: parseFloat(data.value) } : {},
                unit,
                notes: data.notes || correctedText,
                recordedAt: new Date(),
                recordedBy: 'voice_assistant',
            });

            const saved = await this.vitalsRepository.save(vital);
            return {
                success: true,
                action: 'LOG_VITAL',
                originalText,
                correctedText,
                message,
                vitalId: saved.id,
                timestamp: new Date().toISOString(),
                data: { vitalType: saved.vitalType, reading: saved.reading }
            };
        } catch (err) {
            this.logger.error(`[VoiceAssistant] LOG_VITAL failed: ${err.message}`);
            return this.buildErrorResponse(originalText, `Could not log vital sign: ${err.message}`, userId);
        }
    }

    private async handleReminder(parsed: ParsedIntent, userId: string, originalText: string): Promise<VoiceAssistantResponse> {
        const { data, correctedText, message } = parsed;
        try {
            const profile = await this.getUserProfile(userId);
            if (!data.scheduledAt) throw new BadRequestException('Reminder requires a scheduledAt date/time.');
            const appointment = this.appointmentRepository.create({
                userProfileId: profile.id,
                title: data.title || 'Reminder',
                description: correctedText || data.description,
                scheduledAt: new Date(data.scheduledAt as string),
                reminderEnabled: true,
            });
            const saved = await this.appointmentRepository.save(appointment);
            return { success: true, action: 'REMINDER', originalText, correctedText, message, appointmentId: saved.id, timestamp: new Date().toISOString() };
        } catch (err) {
            this.logger.error(`[VoiceAssistant] REMINDER failed: ${err.message}`);
            return this.buildErrorResponse(originalText, `Could not set reminder: ${err.message}`, userId);
        }
    }

    private async handleQueryInfo(parsed: ParsedIntent, userId: string, originalText: string): Promise<VoiceAssistantResponse> {
        return {
            success: true,
            action: 'QUERY_INFO',
            originalText,
            correctedText: parsed.correctedText,
            message: parsed.message || "I've noted your request.",
            timestamp: new Date().toISOString(),
            data: { queryType: parsed.data.queryType, details: parsed.data.details },
        };
    }

    private async getUserProfile(userId: string): Promise<UserProfile> {
        const profile = await this.profileRepository.findOne({ where: { userId } });
        if (!profile) throw new BadRequestException(`No profile found for user ${userId}`);
        return profile;
    }

    private buildErrorResponse(originalText: string, message: string, userId: string): VoiceAssistantResponse {
        return { success: false, action: 'ERROR', originalText, correctedText: originalText, message, timestamp: new Date().toISOString() };
    }

    private normalizeVitalType(raw: string): string {
        const map: Record<string, string> = {
            blood_pressure: 'blood_pressure', bp: 'blood_pressure',
            heart_rate: 'heart_rate', pulse: 'heart_rate',
            temperature: 'temperature', glucose: 'blood_sugar', weight: 'weight',
        };
        return map[raw.toLowerCase().replace(/\s+/g, '_')] || raw;
    }

    private defaultUnit(vitalType: string): string {
        const units: Record<string, string> = {
            blood_pressure: 'mmHg', heart_rate: 'bpm', temperature: '°C', weight: 'kg',
        };
        return units[vitalType] || '';
    }
}
