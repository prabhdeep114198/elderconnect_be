import { Injectable, Logger } from '@nestjs/common';
import { HealthScoreService } from '../health-score/services/health-score.service';
import { ProfileService } from '../profile/profile.service';
import { HealthAnalyticsService } from '../monitoring/analytics.service';
import { TimeGranularity } from '../monitoring/dto/analytics-query.dto';
import { AiEngineService } from './ai-engine.service';

@Injectable()
export class XaiService {
  private readonly logger = new Logger(XaiService.name);

  constructor(
    private healthScoreService: HealthScoreService,
    private profileService: ProfileService,
    private analyticsService: HealthAnalyticsService,
    private aiEngine: AiEngineService,
  ) {}

  async generateHealthReport(userId: string) {
    this.logger.log(`Generating XAI Health Report for user ${userId}`);

    // 1. Gather Data Context
    const [profile, healthScore, analytics] = await Promise.all([
      this.profileService.getProfile(userId),
      this.healthScoreService.computeDailyScore(userId),
      this.analyticsService.getHealthAnalytics(userId, userId, { 
        days: 30, 
        granularity: TimeGranularity.DAY 
      }), // Using userId as profileId assuming 1:1 for now
    ]);

    // 2. Format Context for AI
    const context = {
      age: profile.age,
      medicalConditions: profile.medicalConditions,
      healthScore: healthScore.score,
      dimensions: healthScore.dimensions,
      trends: {
        sleepChange: analytics.trends.sleep.change,
        activityChange: analytics.trends.steps.change,
      },
      medicationAdherence: analytics.medication.adherenceRate,
      missedMedsLast3Days: analytics.medication.missed, // Simplified check
    };

    // 3. Define System Prompt
    const SYSTEM_PROMPT = `
You are an advanced AI healthcare assistant designed for elderly care.
Your task is to explain the user's health metrics in simple, empathetic, non-technical language.

RULES:
- Do NOT use medical jargon.
- Do NOT give strict medical advice.
- Focus on preventive care and lifestyle suggestions.
- If the score is low (<50), emphasize urgency but stay calm.
- If repeated medication misses are detected, highlight this strongly.

JSON OUTPUT FORMAT:
{
  "summary": "2-3 sentences overview",
  "keyReasons": ["bullet point 1", "bullet point 2"],
  "criticalRisks": [
    {"factor": "name", "description": "why it matters"}
  ],
  "recommendations": ["step 1", "step 2"],
  "note": "encouraging closing note"
}
`;

    const USER_MESSAGE = `
USER DATA:
- Age: ${context.age}
- Conditions: ${context.medicalConditions.join(', ')}
- Overall Health Score: ${context.healthScore} / 100
- Medication Adherence: ${context.medicationAdherence}%
- Sleep Trend: ${context.trends.sleepChange}% change
- Physical Activity Trend: ${context.trends.activityChange}% change
- Metrics: ${JSON.stringify(context.dimensions)}
`;

    // 4. Generate AI Report
    try {
      const report = await this.aiEngine.generateStructuredResponse(SYSTEM_PROMPT, USER_MESSAGE);
      return {
        userId,
        timestamp: new Date().toISOString(),
        score: context.healthScore,
        aiReport: report,
      };
    } catch (error) {
       this.logger.error(`Failed to generate AI report: ${error.message}`);
       // Fallback report structure
       return {
         userId,
         timestamp: new Date().toISOString(),
         score: context.healthScore,
         aiReport: {
           summary: "We're checking your stats. Currently, your health score is " + context.healthScore + ".",
           keyReasons: ["Your adherence is at " + context.medicationAdherence + "%"],
           criticalRisks: [],
           recommendations: ["Ensure you take your medications on time."],
           note: "Keep up the good habits!"
         }
       };
    }
  }
}
