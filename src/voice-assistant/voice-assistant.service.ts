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
import { PersonalizationService } from '../personalization/personalization.service';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { VoiceInteraction } from './entities/voice-interaction.entity';

// ─── Groq Config ─────────────────────────────────────────────────────────────
const GROK_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROK_MODEL = 'llama-3.3-70b-versatile';

// ─── System Prompt (same as N8N) ─────────────────────────────────────────────
const INTENT_SYSTEM_PROMPT = `You are a warm, multilingual voice assistant for ElderConnect, an elderly care app.

Your job is to:
1. Detect the language the user is speaking (e.g. Hindi, English, Hinglish)
2. Correct grammar in that language
3. Detect intent
4. Extract structured fields
5. Output STRICT, backend-ready JSON

LANGUAGE RULE (CRITICAL):
- Detect the language from the user's input.
- ALWAYS write the "message" field in the SAME language the user spoke.
- If the user spoke Hindi, respond in Hindi (Devanagari script preferred, e.g., "आपकी दवाई नोट कर ली गई है।")
- If the user spoke Hinglish (Hindi + English mix), respond in Hinglish.
- If the user spoke English, respond in English.
- You MUST include a "detectedLanguage" field at the top level with values like: "en", "hi", "hi-en" (Hinglish)

You MUST classify every request into EXACTLY ONE of these values:
CREATE_EVENT | LOG_VITAL | REMINDER | QUERY_INFO | NAVIGATE | EMERGENCY_SOS | FALL_RISK_CHECK | MEDICATION_CHECK | CONVERSATIONAL | ERROR | UNKNOWN

PERSONALIZED CONTEXT:
{{userContext}}

If the user asks about their day, how they are doing, or general questions, use the CONVERSATIONAL format.
Always be empathetic, friendly, and use the user's name if provided in the context.

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

Return ONLY valid JSON matching EXACTLY the format for the detected intent.

FORMAT FOR LOG_VITAL (Blood Pressure, Heart Rate, Temperature, Sugar/Glucose, Weight):
{
  "typeOfRequest": "LOG_VITAL",
  "correctedText": "...",
  "message": "friendly confirmation (e.g., 'I have logged your blood pressure of 120/80.')",
  "jwt": "same string",
  "data": {
    "vitalType": "blood_pressure" | "heart_rate" | "temperature" | "glucose" | "weight",
    "value": "string measurement (e.g. 120/80, 98, 37.5)",
    "unit": "string unit (e.g. mmHg, bpm, °C, mg/dL)",
    "notes": "optional context"
  }
}

FORMAT FOR CREATE_EVENT - MEDICATION (If taking or scheduling a medicine):
{
  "typeOfRequest": "CREATE_EVENT",
  "correctedText": "...",
  "message": "friendly confirmation",
  "jwt": "same string",
  "data": {
    "type": "medication",
    "title": "medicine name",
    "value": "dosage (e.g., 500 mg)",
    "scheduledAt": "YYYY-MM-DDTHH:MM:SSZ"
  }
}

FORMAT FOR CREATE_EVENT - ACTIVITY or APPOINTMENT:
{
  "typeOfRequest": "CREATE_EVENT",
  "correctedText": "...",
  "message": "friendly confirmation",
  "jwt": "same string",
  "data": {
    "type": "activity" | "appointment",
    "title": "short title of event",
    "description": "details of the event",
    "scheduledAt": "YYYY-MM-DDTHH:MM:SSZ",
    "location": "venue or null"
  }
}

FORMAT FOR REMINDER:
{
  "typeOfRequest": "REMINDER",
  "correctedText": "...",
  "message": "friendly confirmation",
  "jwt": "same string",
  "data": {
    "title": "what to remind",
    "scheduledAt": "YYYY-MM-DDTHH:MM:SSZ"
  }
}

FORMAT FOR QUERY_INFO:
{
  "typeOfRequest": "QUERY_INFO",
  "correctedText": "...",
  "message": "response to query",
  "jwt": "same string",
  "data": {
    "queryType": "type of query (e.g. weather, general, health)",
    "details": "query specifics"
  }
}

FORMAT FOR NAVIGATE (Opening a screen or section of the app):
{
  "typeOfRequest": "NAVIGATE",
  "correctedText": "...",
  "message": "friendly response e.g. 'Opening your Fall Risk dashboard.'",
  "jwt": "same string",
  "data": {
    "destination": "one of: home | profile | health | analytics | settings | fall risk | reminders | events | music | chatbot | video call"
  }
}

FORMAT FOR EMERGENCY_SOS (User is in danger, needs help):
{
  "typeOfRequest": "EMERGENCY_SOS",
  "correctedText": "...",
  "message": "Stay calm, I am alerting your emergency contacts right now.",
  "jwt": "same string",
  "data": {}
}

FORMAT FOR FALL_RISK_CHECK (User asks about their fall risk):
{
  "typeOfRequest": "FALL_RISK_CHECK",
  "correctedText": "...",
  "message": "Sure, let me check your fall risk score.",
  "jwt": "same string",
  "data": {}
}

FORMAT FOR MEDICATION_CHECK (User asks about their medications):
{
  "typeOfRequest": "MEDICATION_CHECK",
  "correctedText": "...",
  "message": "Let me look up your medications.",
  "jwt": "same string",
  "data": {}
}

FORMAT FOR CONVERSATIONAL (Small talk, "how was my day", greetings, general knowledge):
{
  "typeOfRequest": "CONVERSATIONAL",
  "correctedText": "...",
  "message": "Write a friendly, personalized response here. If they asked about their day, use the provided health metrics context to give a summary.",
  "jwt": "same string",
  "data": {}
}

FORMAT FOR ERROR / UNKNOWN:
{
  "typeOfRequest": "ERROR" | "UNKNOWN",
  "correctedText": "...",
  "message": "friendly explanation of what was missed",
  "jwt": "same string",
  "data": {}
}

NAVIGATION KEYWORD GUIDE (use these to detect NAVIGATE intent):
- "go to", "open", "show me", "take me to", "navigate to" → NAVIGATE
- "fall risk", "my risk" → destination: "fall risk"
- "home", "main screen", "dashboard" → destination: "home"
- "profile", "my profile" → destination: "profile"
- "music", "play music" → destination: "music"
- "reminders", "my reminders" → destination: "reminders"
- "chatbot", "chat", "AI assistant" → destination: "chatbot"
- "video call", "call family" → destination: "video call"
- "settings" → destination: "settings"
- "events", "social events" → destination: "events"

EMERGENCY KEYWORDS (use EMERGENCY_SOS intent):
- "help me", "emergency", "SOS", "I fell", "call for help", "I need help", "call 911"

CONVERSATIONAL TRIGGERS (use CONVERSATIONAL intent):
- Greetings (EN): "hello", "hi", "hey", "good morning", "good evening"
- Greetings (HI): "नमस्ते", "हेलो", "सुप्रभात", "शुभ संध्या"
- Day recap: "how was my day", "how did I do today", "aaj mera din kaisa tha", "mera din kaisa raha"
- Day recap (HI): "आज का दिन कैसा था", "मैं कैसा कर रहा हूँ"
- Feelings: "how are you", "aap kaise ho", "kya haal hai"
- General knowledge: "what is", "who is", "tell me about", "explain", "kya hai", "batao", "bataiye"
- Jokes & fun: "tell me a joke", "ek joke sunao", "kuch funny bolo"
- Compliments & chat: "you're great", "thanks", "shukriya", "dhanyavaad"
- Any question that does not fit CREATE_EVENT, LOG_VITAL, REMINDER, NAVIGATE, EMERGENCY_SOS, FALL_RISK_CHECK, or MEDICATION_CHECK

IMPORTANT: When the intent is CONVERSATIONAL and the user asked about their day or health, use the PERSONALIZED CONTEXT section above to craft a warm, specific, data-driven response in the user's language.

STRICT RULES:
- Output ONLY JSON
- No markdown formatting wrappers like \`\`\`json
- No explanations
- No extra text
- ALWAYS include "detectedLanguage" as a top-level field
- Do not include fields in the "data" object that do not belong to the specific format shown above`;

@Injectable()
export class VoiceAssistantService {
    private readonly logger = new Logger(VoiceAssistantService.name);
    private readonly xaiApiKey: string;

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

        @InjectRepository(DailyHealthMetric, 'profile')
        private readonly healthMetricRepository: Repository<DailyHealthMetric>,

        @InjectRepository(VoiceInteraction, 'vitals')
        private readonly voiceInteractionRepository: Repository<VoiceInteraction>,

        private readonly personalizationService: PersonalizationService,
    ) {
        this.xaiApiKey =
            this.configService.get<string>('GROQ_API_KEY') ||
            this.configService.get<string>('GROK_API_KEY') ||
            '';
    }

    // ═══════════════════════════════════════════════════════════════════
    // MAIN ENTRY: process voice command (replicates N8N pipeline)
    // ═══════════════════════════════════════════════════════════════════
    async processVoiceCommand(dto: VoiceAssistantRequestDto): Promise<VoiceAssistantResponse> {
        const { text, userContext, jwt, isConfirmation, pendingIntent } = dto;
        const userId = userContext.userId;

        this.logger.log(`[VoiceAssistant] Processing command for user ${userId}: "${text}" (isConfirmation: ${isConfirmation})`);

        let parsed: ParsedIntent;

        // ── Step 1: Gather Rich Context for AI ─────────────────────────────
        const richContextBrief = await this.getRichUserContext(userId);

        if (isConfirmation && pendingIntent) {
            // User confirmed the action, bypass AI parsing and execute
            this.logger.log(`[VoiceAssistant] Executing pre-confirmed intent for user ${userId}`);
            parsed = pendingIntent;
        } else {
            // ── Step 2: Call Grok Intent Parser ─────────────────────────────────
            try {
                parsed = await this.callGrokIntentParser(text, jwt, richContextBrief);
            } catch (err) {
                this.logger.error(`[VoiceAssistant] Grok Intent Parser failed: ${err.message}`);
                return this.buildErrorResponse(text, 'Sorry, I had trouble understanding that. Could you please try again?', userId);
            }
        }

        // ── Step 2: Validate parsed response ───────────────────────────
        if (!parsed.typeOfRequest) {
            return this.buildErrorResponse(text, 'I could not determine what you want to do. Please try again.', userId);
        }

        // Inject userId + originalText
        const originalText = text;

        this.logger.log(`[VoiceAssistant] Intent detected: ${parsed.typeOfRequest} | Message: ${parsed.message}`);

        // ── Step 3: Persistence for Cognitive Analysis ──────────────────────
        try {
            const interaction = this.voiceInteractionRepository.create({
                userId,
                transcript: text,
                intent: parsed.typeOfRequest,
                isConversational: parsed.typeOfRequest === 'CONVERSATIONAL',
            });
            await this.voiceInteractionRepository.save(interaction);
        } catch (err) {
            this.logger.error(`[VoiceAssistant] Failed to log interaction: ${err.message}`);
        }

        const requiresConfirmationTypes = ['CREATE_EVENT', 'LOG_VITAL', 'REMINDER'];

        if (!isConfirmation && requiresConfirmationTypes.includes(parsed.typeOfRequest)) {
            // Return intermediate confirmation step to frontend
            return {
                success: true,
                requiresConfirmation: true,
                pendingIntent: parsed,
                action: parsed.typeOfRequest,
                originalText,
                correctedText: parsed.correctedText || text,
                detectedLanguage: parsed.detectedLanguage || 'en',
                message: `${parsed.message} Should I save this?`,
                timestamp: new Date().toISOString(),
            };
        }

        // ── Step 3: Route by action (Execution phase) ───────────────────
        switch (parsed.typeOfRequest as IntentType) {
            case 'CREATE_EVENT':
                return this.handleCreateEvent(parsed, userId, originalText);

            case 'LOG_VITAL':
                return this.handleLogVital(parsed, userId, originalText);

            case 'REMINDER':
                return this.handleReminder(parsed, userId, originalText);

            case 'QUERY_INFO':
                return this.handleQueryInfo(parsed, userId, originalText);

            case 'NAVIGATE':
                // Navigation is handled on the frontend via the response
                return {
                    success: true,
                    action: 'NAVIGATE',
                    originalText,
                    correctedText: parsed.correctedText || text,
                    detectedLanguage: parsed.detectedLanguage || 'en',
                    message: parsed.message || 'Navigating...',
                    timestamp: new Date().toISOString(),
                    data: parsed.data,
                };

            case 'EMERGENCY_SOS':
                // Frontend will trigger the SOS flow
                return {
                    success: true,
                    action: 'EMERGENCY_SOS',
                    originalText,
                    correctedText: parsed.correctedText || text,
                    detectedLanguage: parsed.detectedLanguage || 'en',
                    message: parsed.message || 'Initiating emergency SOS.',
                    timestamp: new Date().toISOString(),
                };

            case 'FALL_RISK_CHECK':
                return this.handleFallRiskCheck(userId, originalText, parsed.correctedText || text);

            case 'MEDICATION_CHECK':
                return this.handleMedicationCheck(userId, originalText, parsed.correctedText || text);

            case 'CONVERSATIONAL':
                return {
                    success: true,
                    action: 'CONVERSATIONAL',
                    originalText,
                    correctedText: parsed.correctedText || text,
                    detectedLanguage: parsed.detectedLanguage || 'en',
                    message: parsed.message || "I'm here to help!",
                    timestamp: new Date().toISOString(),
                };

            case 'ERROR':
                return {
                    success: false,
                    action: 'ERROR',
                    originalText,
                    correctedText: parsed.correctedText || text,
                    detectedLanguage: parsed.detectedLanguage || 'en',
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
                    detectedLanguage: parsed.detectedLanguage || 'en',
                    message: parsed.message || "I'm not sure what you mean. Could you rephrase?",
                    timestamp: new Date().toISOString(),
                };
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Grok: Call Intent Parser
    // ═══════════════════════════════════════════════════════════════════
    private async callGrokIntentParser(text: string, jwt: string, contextBrief?: string): Promise<ParsedIntent> {
        if (!this.xaiApiKey) {
            throw new Error('No Grok API token configured (XAI_API_KEY or GROK_API_KEY)');
        }

        const systemPromptWithContext = INTENT_SYSTEM_PROMPT.replace('{{userContext}}', contextBrief || 'No specific context provided.');

        const payload = {
            model: GROK_MODEL,
            messages: [
                { role: 'system', content: systemPromptWithContext },
                { role: 'user', content: `JWT: ${jwt}\n\nUser said: "${text}"` },
            ],
            temperature: 0.2,
            max_tokens: 400,
        };

        try {
            const response = await axios.post(GROK_API_URL, payload, {
                headers: {
                    Authorization: `Bearer ${this.xaiApiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No content returned from Grok');
            }

            return this.parseAIResponse(content, text, jwt);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                const status = error.response.status;
                const body = error.response.data;
                const errorSnippet = JSON.stringify(body).substring(0, 1000);
                this.logger.error(`[VoiceAssistant] Grok API Error (${status}): ${errorSnippet}`);
            }
            this.logger.error(`[VoiceAssistant] Intent parsing failed: ${error.message}`);
            return this.getFallbackIntent(text, jwt);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Rich Context Gathering
    // ═══════════════════════════════════════════════════════════════════
    private async getRichUserContext(userId: string): Promise<string> {
        try {
            const context = await this.personalizationService.getChatbotContext(userId);
            const today = new Date().toISOString().split('T')[0];
            const metrics = await this.healthMetricRepository.findOne({
                where: { userProfileId: userId, date: today as any },
            });

            const parts: string[] = [];
            parts.push(`User Name: ${context.userId}`); // Usually includes name if available
            parts.push(`Medical Conditions: ${context.profileSummary.conditions.join(', ')}`);
            parts.push(`Interests/Hobbies: ${context.profileSummary.hobbies.join(', ')}`);
            
            if (metrics) {
                parts.push(`Today's Activity: ${metrics.steps} steps, ${metrics.sleepHours} hours of sleep, ${metrics.waterIntake} cups of water.`);
            } else {
                parts.push("Today's health metrics haven't been logged yet.");
            }

            if (context.primaryConcerns.length > 0) {
                parts.push(`Primary Health Concerns: ${context.primaryConcerns.join(', ')}`);
            }

            return parts.join('\n');
        } catch (err) {
            this.logger.error(`[VoiceAssistant] Failed to gather rich context: ${err.message}`);
            return "General elderly care assistant context.";
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
            const reading = this.formatVitalReading(vitalType, data.value || '');

            const vital = this.vitalsRepository.create({
                userId,
                vitalType,
                reading,
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
        try {
            const queryType = parsed.data.queryType?.toLowerCase() || '';
            let message = parsed.message || "I've noted your request.";
            const lowerText = originalText.toLowerCase();

            if (queryType.includes('health') || lowerText.includes('health') || lowerText.includes('vitals') || lowerText.includes('pressure') || lowerText.includes('sugar') || lowerText.includes('heart')) {
                const recentVitals = await this.vitalsRepository.find({
                    where: { userId },
                    order: { recordedAt: 'DESC' },
                    take: 3
                });

                if (recentVitals.length > 0) {
                    const vitalsSummary = recentVitals.map(v => {
                        let val = v.reading?.value || '';
                        if (v.vitalType === 'blood_pressure' && v.reading?.systolic && v.reading?.diastolic) {
                             val = `${v.reading.systolic} over ${v.reading.diastolic}`;
                        } else if (v.vitalType === 'heart_rate' && v.reading?.bpm) {
                             val = `${v.reading.bpm} beats per minute`;
                        } else if (v.reading?.celsius) {
                             val = `${v.reading.celsius} degrees`;
                        }
                        return `${v.vitalType.replace('_', ' ')} is ${val}`;
                    }).join(', and your ');
                    message = `Based on your recent records, your ${vitalsSummary}.`;
                } else {
                    message = "I couldn't find any recent health readings for you. Would you like to log something now?";
                }
            } else if (queryType.includes('weather') || lowerText.includes('weather')) {
                message = "The weather data is not fully integrated yet, but please make sure to dress comfortably if you go out today!";
            }
            // For all other query types, the AI-generated message is already accurate — use it directly.

            return {
                success: true,
                action: 'QUERY_INFO',
                originalText,
                correctedText: parsed.correctedText,
                message,
                timestamp: new Date().toISOString(),
                data: { queryType: parsed.data.queryType, details: parsed.data.details },
            };
        } catch (err) {
            this.logger.error(`[VoiceAssistant] QUERY_INFO failed: ${err.message}`);
            return this.buildErrorResponse(originalText, 'Sorry, I could not process your query right now.', userId);
        }
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
            blood_pressure: 'mmHg', heart_rate: 'bpm', temperature: '°C', weight: 'kg', blood_sugar: 'mg/dL', oxygen_saturation: '%'
        };
        return units[vitalType] || '';
    }

    private formatVitalReading(vitalType: string, value: string): Record<string, any> {
        if (!value) return {};

        const rawValue = String(value).trim().toLowerCase();

        switch (vitalType) {
            case 'blood_pressure':
                // Handles '180/90', '180 over 90', '180 \ 90'
                const parts = rawValue.split(/[\/\s\\]+/).filter(p => p !== 'over');
                if (parts.length >= 2) {
                    return {
                        systolic: parseInt(parts[0], 10),
                        diastolic: parseInt(parts[1], 10)
                    };
                }
                return { value: rawValue };
            case 'heart_rate':
                return { bpm: parseFloat(rawValue) };
            case 'temperature':
                const temp = parseFloat(rawValue);
                return { celsius: temp > 50 ? parseFloat(((temp - 32) * 5 / 9).toFixed(1)) : temp };
            case 'weight':
                return { kg: parseFloat(rawValue) };
            case 'blood_sugar':
                return { mgdl: parseFloat(rawValue) };
            case 'oxygen_saturation':
                return { percentage: parseFloat(rawValue) };
            default:
                return { value: parseFloat(rawValue) || rawValue };
        }
    }


    private async handleFallRiskCheck(userId: string, originalText: string, correctedText: string): Promise<VoiceAssistantResponse> {
        try {
            const profile = await this.profileRepository.findOne({ where: { userId } });
            if (!profile) {
                return {
                    success: false, action: 'FALL_RISK_CHECK', originalText, correctedText,
                    message: "I couldn't find your health profile to assess fall risk.",
                    timestamp: new Date().toISOString(),
                };
            }

            let details: string[] = [];

            if (profile.age && profile.age > 75) details.push('age over 75');
            if (profile.bmi && (profile.bmi > 30 || profile.bmi < 18)) details.push('BMI outside healthy range');
            const hasBalance = profile.medicalConditions?.some(c =>
                ['arthritis', 'vertigo', 'dizziness', 'parkinson'].includes(c.toLowerCase())
            );
            if (hasBalance) details.push('balance-related condition');

            const level = details.length === 0 ? 'low' : details.length === 1 ? 'moderate' : 'elevated';

            const spoken = details.length > 0
                ? `Your fall risk is ${level} due to: ${details.join(', ')}. I recommend checking your Fall Risk dashboard for detailed recommendations.`
                : "Great news! Your fall risk assessment looks low based on your profile. Keep staying active!";

            return {
                success: true,
                action: 'FALL_RISK_CHECK',
                originalText,
                correctedText,
                message: spoken,
                timestamp: new Date().toISOString(),
                data: { riskLevel: level, factors: details },
            };
        } catch (err) {
            this.logger.error(`[VoiceAssistant] FALL_RISK_CHECK failed: ${err.message}`);
            return this.buildErrorResponse(originalText, 'Sorry, I could not check your fall risk right now.', userId);
        }
    }

    private async handleMedicationCheck(userId: string, originalText: string, correctedText: string): Promise<VoiceAssistantResponse> {
        try {
            const profile = await this.profileRepository.findOne({ where: { userId } });
            if (!profile) {
                return {
                    success: false, action: 'MEDICATION_CHECK', originalText, correctedText,
                    message: "I couldn't find your health profile to look up medications.",
                    timestamp: new Date().toISOString(),
                };
            }

            const medications = await this.medicationRepository.find({
                where: { userProfileId: profile.id, isActive: true },
                take: 5,
            });

            if (medications.length === 0) {
                return {
                    success: true, action: 'MEDICATION_CHECK', originalText, correctedText,
                    message: "You have no active medications on file. You can add them through the profile section.",
                    timestamp: new Date().toISOString(),
                };
            }

            const medNames = medications.map(m => `${m.name}${m.dosage ? ', ' + m.dosage : ''}`).join('. ');
            const message = `You have ${medications.length} active medication${medications.length > 1 ? 's' : ''}: ${medNames}.`;

            return {
                success: true,
                action: 'MEDICATION_CHECK',
                originalText,
                correctedText,
                message,
                timestamp: new Date().toISOString(),
                data: { count: medications.length, medications: medications.map(m => ({ name: m.name, dosage: m.dosage })) },
            };
        } catch (err) {
            this.logger.error(`[VoiceAssistant] MEDICATION_CHECK failed: ${err.message}`);
            return this.buildErrorResponse(originalText, 'Sorry, I could not look up your medications right now.', userId);
        }
    }
}
