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
    this.logger.log(`Generating In-Depth XAI Health Report for user ${userId}`);

    // 1. Gather Data Context (Now including statistics for anomalies)
    const [profile, healthScore, analytics] = await Promise.all([
      this.profileService.getProfile(userId),
      this.healthScoreService.computeDailyScore(userId), // This often saves a new one, but for report we use it as context
      this.analyticsService.getHealthAnalytics(userId, userId, { 
        days: 7, 
        granularity: TimeGranularity.DAY 
      }),
    ]);

    // 2. Format Context for AI with Anomaly Detection
    const context = {
      age: profile.age,
      medicalConditions: profile.medicalConditions,
      currentScore: healthScore.score,
      statusLabel: healthScore.statusLabel,
      dimensions: healthScore.dimensions,
      last7Days: {
        sleepAvg: analytics.statistics.sleep.avg,
        stepsAvg: analytics.statistics.steps.avg,
        heartRateAvg: analytics.statistics.heartRate.avg,
      },
      trends: {
        sleepChange: analytics.trends.sleep.change,
        activityChange: analytics.trends.steps.change,
        heartRateTrend: analytics.trends.heartRate.trend,
      },
      medication: {
        adherenceRate: analytics.medication.adherenceRate,
        missedCount: analytics.medication.missed,
      },
      anomalies: analytics.insights.filter(i => i.toLowerCase().includes('consult') || i.toLowerCase().includes('elevated') || i.toLowerCase().includes('declining')),
    };

    // 3. Define System Prompt for "Friendly Health Companion"
    const SYSTEM_PROMPT = `
You are 'ElderConnect AI', a warm, empathetic, and professional health companion for senior citizens.
Your goal is to explain the "Health Score" (0-100) in a way that is easy to understand, encouraging, and actionable.

RULES:
- TONE: Use a friendly "Family Doctor" tone. No medical jargon.
- HONESTY: If a score is low, be clear but supportive.
- PERSONALIZATION: If the user has conditions like Diabetes or Hypertension (provided in context), tailor your advice to those.
- COMPARISON: Always compare today's data with their recent trends.
- ACTION: End with 2-3 very specific, small positive steps they can take today.

JSON OUTPUT FORMAT:
{
  "summary": "1-2 sentences overview of how they are doing today.",
  "scoreBreakdown": [
    {"label": "Medication", "status": "Good/Warning", "reason": "Short explanation"},
    {"label": "Activity", "status": "Good/Warning", "reason": "Short explanation"},
    {"label": "Vitals", "status": "Good/Warning", "reason": "Short explanation"}
  ],
  "whyItChanged": "Explanation of why the score is different from their usual trend.",
  "severity": "NORMAL | WARNING | CRITICAL",
  "recommendations": ["Tiny actionable step 1", "Tiny actionable step 2"],
  "encouragement": "A warm closing sentence."
}
`;

    const USER_MESSAGE = `
USER CONTEXT:
- Profile: ${context.age} years old with ${context.medicalConditions.join(', ')}.
- Current Health Score: ${context.currentScore} / 100 (${context.statusLabel})
- Med Adherence: ${context.medication.adherenceRate}% (${context.medication.missedCount} missed recently)
- Activity: ${context.trends.activityChange}% change in steps.
- Sleep: ${context.trends.sleepChange}% change.
- Recent Insights: ${context.anomalies.join('. ')}
- Dimension Data: ${JSON.stringify(context.dimensions)}
`;

    // 4. Generate AI Report
    try {
      const aiResponse = await this.aiEngine.generateStructuredResponse(SYSTEM_PROMPT, USER_MESSAGE);
      
      return {
        userId,
        timestamp: new Date().toISOString(),
        score: context.currentScore,
        statusLabel: context.statusLabel,
        report: aiResponse
      };
    } catch (error) {
       this.logger.error(`Failed to generate AI report: ${error.message}`);
       // Fallback report structure
       return {
         userId,
         timestamp: new Date().toISOString(),
         score: context.currentScore,
         statusLabel: context.statusLabel,
         report: {
           summary: `Your health score is ${context.currentScore}. You're doing ${context.statusLabel.toLowerCase()} today!`,
           scoreBreakdown: [
             { label: "Medication", status: context.medication.adherenceRate > 80 ? "Good" : "Warning", reason: `Adherence is at ${context.medication.adherenceRate}%` }
           ],
           whyItChanged: "We're seeing some fluctuations in your activity and medication logs.",
           severity: context.currentScore < 50 ? "WARNING" : "NORMAL",
           recommendations: ["Stay hydrated and take your medications on time.", "Try to get some light movement today."],
           encouragement: "You're doing great! Keep it up."
         }
       };
    }
  }
}
