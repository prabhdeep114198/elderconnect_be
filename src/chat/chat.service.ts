
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Vitals } from '../device/entities/vitals.entity';
import { HealthAnalyticsService } from '../monitoring/analytics.service';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ChatRequestDto, ChatResponseDto, ContextScores, UserContext } from './dto/chat.dto';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(User, 'auth')
        private readonly userRepository: Repository<User>,
        @InjectRepository(UserProfile, 'profile')
        private readonly userProfileRepository: Repository<UserProfile>,
        @InjectRepository(Vitals, 'vitals')
        private readonly vitalsRepository: Repository<Vitals>,
        private readonly analyticsService: HealthAnalyticsService,
    ) { }

    async sendMessage(userId: string, request: ChatRequestDto): Promise<ChatResponseDto> {
        const conversationId = randomUUID();
        let safeContext: UserContext | null = null;
        try {
            this.logger.log(`Processing chat message for user ${userId}`);

            const fullContext = await this.loadUserContext(userId);
            safeContext = this.summarizeContext(fullContext);

            // Create System Prompt
            const scores = safeContext.scores || { physical: 0, mental: 0, sleep: 0 };
            const lastMood = safeContext.lastMood || "neutral";
            const recentVitals = safeContext.recentVitals || [];
            const riskLevel = safeContext.riskLevel || "low";

            const recentVitalsStr = recentVitals.length > 0
                ? recentVitals.map(v => `${v.type}: ${v.value} ${v.unit}`).join(", ")
                : "None";

            const systemPrompt = `
You are a supportive health assistant for an elderly care application.

RULES:
- Do NOT give medical diagnoses
- Do NOT prescribe or change medications
- Encourage professional help when risk is medium or high
- Use simple, reassuring language
- Never be alarming

PROACTIVE COACHING:
- Adaptive Reminders (FR1): If the user mentions missing medication, suggest rescheduling based on their recent activity patterns (e.g., "Since you just woke up from a nap, let's take your medication now").
- Sustainability Coaching (FR4): Weave in eco-friendly suggestions. If it's daytime, suggest solar charging their wearable device. Explain how taking certain digital or sustainable actions helps the environment.
- Nutrition Coach (FR6): If they ask about food or meal plans, provide personalized suggestions based on their conditions (e.g., if they have diabetes, suggest low-glycemic meals). 
- Hydration & Sleep Support (FR7): Frequently remind them to drink water, linking it to the local weather or time of day. Suggest sleep improvements if their sleep score is low.
- Fall Prevention Coaching (FR8): Provide safe, daily functional balance and posture exercises if they mention feeling unsteady or if their physical score is low (e.g., "Seated Leg Extensions").

USER CONTEXT:
Physical score: ${scores.physical}
Mental score: ${scores.mental}
Sleep score: ${scores.sleep}
Last mood: ${lastMood}
Recent vitals: ${recentVitalsStr}
Risk level: ${riskLevel}

Respond to the user message below.
`.trim();

            const userMessage = request.message && request.message.trim() !== "" ? request.message : "Hello!";

            // Call HuggingFace
            this.logger.debug('Calling HuggingFace API...');
            const hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY') || process.env.HUGGINGFACE_API_KEY;
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${hfApiKey}`,
                },
                body: JSON.stringify({
                    model: 'mistralai/Mistral-7B-Instruct-v0.3',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ]
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                this.logger.error(`HuggingFace API Error (${response.status}): ${errText}`);
                throw new Error(`HuggingFace API responded with status: ${response.status}`);
            }

            const responseData = await response.json();
            let reply = responseData.choices?.[0]?.message?.content || "I'm here to help.";

            if (riskLevel === 'high') {
                reply += "\n\nIf you're concerned, please consider contacting your caregiver or healthcare provider.";
            }

            return {
                reply,
                conversationId,
            };

        } catch (error) {
            this.logger.error(`Error in chat flow: ${error.message}`, error.stack);

            // Fallback response instead of crashing for the user
            const reply = safeContext
                ? this.getFallbackMessage(safeContext)
                : "I'm having a little trouble connecting to my brain right now, but I'm still here for you. Could you repeat that?";

            return {
                reply,
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

    async getDynamicNutritionPlan(userId: string, dietType: string = 'vegetarian'): Promise<any> {
        this.logger.log(`Generating dynamic ${dietType} nutrition plan for user ${userId}`);
        const fullContext = await this.loadUserContext(userId);
        const profile = await this.userProfileRepository.findOne({ where: { userId } });
        const restrictions = profile?.allergies?.join(', ') || 'None';
        const conditions = profile?.medicalConditions?.join(', ') || 'None';

        const todayRaw = new Date();
        const todayStr = todayRaw.toDateString();

        const systemPrompt = `
You are a specialized elderly nutrition assistant. Output ONLY a valid JSON array of meal objects based on the user's dietary parameters, nothing else. Do not use markdown wrappers like \`\`\`json.
Today's Date: ${todayStr}
User Conditions: ${conditions}
User Restrictions/Allergies: ${restrictions}
Dietary Preference: ${dietType}

CRITICAL RULE FOR ${dietType.toUpperCase()} MODE:
- If 'vegetarian', the meal plan MUST NOT contain any meat, chicken, fish, or seafood. Use eggs, dairy, beans, lentils, or tofu instead.
- If 'non-vegetarian', you may include lean meats, fish, or poultry.

Generate exactly 4 meals for ${todayStr}: Breakfast, Lunch, Snack, Dinner.
Ensure variety and do not repeat the same meals if the user checks on different days.
Each item in the array must be an object with:
"meal" (string)
"time" (string)
"food" (string)
"calories" (number)
"icon" (string - use one of: "sunny-outline", "partly-sunny-outline", "nutrition-outline", "moon-outline", "fast-food-outline")
`;

        const hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY') || process.env.HUGGINGFACE_API_KEY;
        const fallbackMeals = dietType === 'vegetarian' ? [
            {
                meal: 'Breakfast', time: '08:00 AM', food: 'Oatmeal with Blueberries', calories: 280, icon: 'sunny-outline',
            },
            {
                meal: 'Lunch', time: '01:00 PM', food: 'Quinoa and Roasted Veggie Salad', calories: 420, icon: 'partly-sunny-outline',
            },
            {
                meal: 'Snack', time: '04:00 PM', food: 'Mixed Nuts and Fruit', calories: 180, icon: 'nutrition-outline',
            },
            {
                meal: 'Dinner', time: '07:30 PM', food: 'Lentil Soup with Whole Grain Bread', calories: 450, icon: 'moon-outline',
            },
        ] : [
            {
                meal: 'Breakfast', time: '08:00 AM', food: 'Oatmeal with Almonds', calories: 300, icon: 'sunny-outline',
            },
            {
                meal: 'Lunch', time: '01:00 PM', food: 'Grilled Chicken Salad', calories: 450, icon: 'partly-sunny-outline',
            },
            {
                meal: 'Snack', time: '04:00 PM', food: 'Greek Yogurt', calories: 150, icon: 'nutrition-outline',
            },
            {
                meal: 'Dinner', time: '07:30 PM', food: 'Baked Salmon with Broccoli', calories: 500, icon: 'moon-outline',
            },
        ];

        try {
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfApiKey}` },
                body: JSON.stringify({
                    model: 'mistralai/Mistral-7B-Instruct-v0.3',
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: "Generate meal plan." }],
                    temperature: 0.2
                }),
            });

            if (!response.ok) throw new Error('API request failed');

            const responseData = await response.json();
            let rawContent = responseData.choices?.[0]?.message?.content?.trim() || "[]";
            if (rawContent.startsWith('```json')) rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
            else if (rawContent.startsWith('```')) rawContent = rawContent.replace(/```/g, '').trim();

            const meals = JSON.parse(rawContent);
            return {
                dietaryRestrictions: profile?.allergies?.length ? profile.allergies : ['General Healthy Diet'],
                mealPlan: Array.isArray(meals) && meals.length > 0 ? meals : fallbackMeals
            };
        } catch (error) {
            this.logger.error(`Error generating nutrition plan: ${error}`);
            return { dietaryRestrictions: ['General Healthy Diet'], mealPlan: fallbackMeals };
        }
    }

    async getDynamicExercises(userId: string): Promise<any> {
        this.logger.log(`Generating dynamic exercises for user ${userId}`);
        const fullContext = await this.loadUserContext(userId);
        const profile = await this.userProfileRepository.findOne({ where: { userId } });
        const mobility = profile?.healthGoals?.mobilityLevel || 'Independent';

        const todayRaw = new Date();
        const todayStr = todayRaw.toDateString();

        const systemPrompt = `
You are a physical therapy assistant for elderly fall prevention. Output ONLY a valid JSON array of exercise objects based on the user's mobility, nothing else. Do not use markdown wrappers like \`\`\`json.
Today's Date: ${todayStr}
User Mobility Level: ${mobility}

Generate exactly 3 safe exercises for ${todayStr}.
Ensure variety and suggest different exercises if the user checks on different days.
Each item in the array must be an object with:
"title" (string)
"desc" (string)
"duration" (string, e.g. "5 mins")
"reps" (string, e.g. "10 reps")
"icon" (string - use one of: "body-outline", "walk-outline", "accessibility-outline", "bicycle-outline", "fitness-outline")
`;

        const hfApiKey = this.configService.get<string>('HUGGINGFACE_API_KEY') || process.env.HUGGINGFACE_API_KEY;
        const fallbackExercises = [
            {
                title: 'Seated Leg Extensions', desc: 'Improves quadriceps strength.', duration: '5 mins', reps: '10 reps', icon: 'body-outline'
            },
            {
                title: 'Heel-to-Toe Walk', desc: 'Enhances balance.', duration: '5 mins', reps: '20 steps', icon: 'walk-outline'
            },
            {
                title: 'Sit-to-Stand', desc: 'Builds core strength.', duration: '3 mins', reps: '10 reps', icon: 'accessibility-outline'
            }
        ];

        try {
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfApiKey}` },
                body: JSON.stringify({
                    model: 'mistralai/Mistral-7B-Instruct-v0.3',
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: "Generate exercises." }],
                    temperature: 0.2
                }),
            });

            if (!response.ok) throw new Error('API request failed');

            const responseData = await response.json();
            let rawContent = responseData.choices?.[0]?.message?.content?.trim() || "[]";
            if (rawContent.startsWith('```json')) rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
            else if (rawContent.startsWith('```')) rawContent = rawContent.replace(/```/g, '').trim();

            const exercises = JSON.parse(rawContent);
            return {
                exercises: Array.isArray(exercises) && exercises.length > 0 ? exercises : fallbackExercises
            };
        } catch (error) {
            this.logger.error(`Error generating exercises: ${error}`);
            return { exercises: fallbackExercises };
        }
    }

}
