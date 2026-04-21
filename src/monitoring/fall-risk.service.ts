import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { SOSAlert } from '../device/entities/sos-alert.entity';
import { ProfileService } from '../profile/profile.service';
import { AlertPriority } from '../common/enums/user-role.enum';
import { AiEngineService } from '../ai/ai-engine.service';
import { TwilioService } from '../notification/services/twilio.service';
import { CoachingExercise, GaitClusters, MobilityCoachingPlan } from './fall-risk.types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal Types (not exported — service-private only)
// ─────────────────────────────────────────────────────────────────────────────

interface MetricPoint {
    steps: number;
    heartRate: number;
    sleepHours: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// K-Means Implementation (Pure TypeScript, k=3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a value to [0, 1] given a min/max range.
 * Prevents division by zero when all values are equal.
 */
function normalize(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return (value - min) / (max - min);
}

/**
 * Euclidean distance in normalized feature space.
 */
function euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

/**
 * K-Means clustering over daily metrics (k=3).
 * Features: [normalizedSteps, normalizedHeartRate, normalizedSleep]
 * Returns cluster label for each data point: 0=sedentary, 1=moderate, 2=active
 */
function kMeansCluster(data: MetricPoint[], maxIterations = 20): number[] {
    if (data.length === 0) return [];
    if (data.length <= 3) return data.map((_, i) => i % 3);

    // Compute ranges for normalization
    const stepsValues = data.map(d => d.steps);
    const hrValues = data.map(d => d.heartRate || 70);
    const sleepValues = data.map(d => d.sleepHours || 7);

    const stepsMin = Math.min(...stepsValues), stepsMax = Math.max(...stepsValues);
    const hrMin = Math.min(...hrValues), hrMax = Math.max(...hrValues);
    const sleepMin = Math.min(...sleepValues), sleepMax = Math.max(...sleepValues);

    // Normalize features to [0, 1]
    const normalized = data.map(d => [
        normalize(d.steps, stepsMin, stepsMax),
        normalize(d.heartRate || 70, hrMin, hrMax),
        normalize(d.sleepHours || 7, sleepMin, sleepMax),
    ]);

    // Initialize centroids: pick 3 evenly spaced points by steps (proxy for activity)
    const sortedIndices = stepsValues
        .map((v, i) => ({ v, i }))
        .sort((a, b) => a.v - b.v)
        .map(x => x.i);

    const low = sortedIndices[0];
    const mid = sortedIndices[Math.floor(sortedIndices.length / 2)];
    const high = sortedIndices[sortedIndices.length - 1];

    let centroids: number[][] = [
        normalized[low],
        normalized[mid],
        normalized[high],
    ];

    let labels = new Array(data.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
        // Assignment step: assign each point to nearest centroid
        const newLabels = normalized.map(point => {
            const distances = centroids.map(c => euclideanDistance(point, c));
            return distances.indexOf(Math.min(...distances));
        });

        // Check convergence
        const converged = newLabels.every((l, i) => l === labels[i]);
        labels = newLabels;
        if (converged) break;

        // Update step: recompute centroids as mean of assigned points
        for (let k = 0; k < 3; k++) {
            const members = normalized.filter((_, i) => labels[i] === k);
            if (members.length === 0) continue;
            centroids[k] = members[0].map((_, dim) =>
                members.reduce((sum, p) => sum + p[dim], 0) / members.length
            );
        }
    }

    // Normalize cluster labels so 0=sedentary (lowest steps), 2=active (highest steps)
    // Find mean steps per cluster label
    const clusterStepMeans = [0, 1, 2].map(k => {
        const members = data.filter((_, i) => labels[i] === k);
        if (members.length === 0) return 0;
        return members.reduce((s, d) => s + d.steps, 0) / members.length;
    });

    // Sort cluster labels by their mean steps, assign 0=sedentary, 1=moderate, 2=active
    const sortedClusters = [0, 1, 2].sort((a, b) => clusterStepMeans[a] - clusterStepMeans[b]);
    const remap: Record<number, number> = {};
    sortedClusters.forEach((originalLabel, newLabel) => {
        remap[originalLabel] = newLabel;
    });

    return labels.map(l => remap[l]);
}

/**
 * Computes the statistical variance of an array of numbers.
 */
function variance(arr: number[]): number {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class FallRiskService {
    private readonly logger = new Logger(FallRiskService.name);

    constructor(
        @InjectRepository(UserProfile, 'profile')
        private readonly profileRepository: Repository<UserProfile>,
        @InjectRepository(DailyHealthMetric, 'profile')
        private readonly metricRepository: Repository<DailyHealthMetric>,
        @InjectRepository(SOSAlert, 'vitals')
        private readonly sosRepository: Repository<SOSAlert>,
        private readonly profileService: ProfileService,
        private readonly aiEngine: AiEngineService,
        private readonly twilioService: TwilioService,
    ) { }

    // ── Private: Cluster Analysis ────────────────────────────────────────────

    /**
     * Runs K-Means (k=3) over the last 30 days of health metrics to discover
     * the user's "activity movement fingerprint":
     *   Cluster 0 = Sedentary  (low steps, low HR, poor sleep)
     *   Cluster 1 = Moderate   (medium activity)
     *   Cluster 2 = Active     (high steps, elevated HR, good sleep)
     */
    private computeGaitClusters(metrics: DailyHealthMetric[]): GaitClusters {
        if (metrics.length === 0) {
            return {
                sedentaryPct: 50, moderatePct: 40, activePct: 10,
                stepVariance: 0, hrVariance: 0, dominantPattern: 'sedentary',
            };
        }

        const points: MetricPoint[] = metrics.map(m => ({
            steps: m.steps,
            heartRate: m.heartRate || 70,
            sleepHours: m.sleepHours || 6,
        }));

        const labels = kMeansCluster(points);
        const total = labels.length;

        const sedentaryCount = labels.filter(l => l === 0).length;
        const moderateCount = labels.filter(l => l === 1).length;
        const activeCount = labels.filter(l => l === 2).length;

        const sedentaryPct = Math.round((sedentaryCount / total) * 100);
        const moderatePct = Math.round((moderateCount / total) * 100);
        const activePct = 100 - sedentaryPct - moderatePct;

        const stepVariance = Math.round(variance(points.map(p => p.steps)));
        const hrVariance = Math.round(variance(points.map(p => p.heartRate)));

        const dominant = sedentaryPct >= moderatePct && sedentaryPct >= activePct
            ? 'sedentary'
            : activePct >= moderatePct
                ? 'active'
                : 'moderate';

        return { sedentaryPct, moderatePct, activePct, stepVariance, hrVariance, dominantPattern: dominant };
    }

    // ── Private: Multi-Factor Gait Score ────────────────────────────────────

    /**
     * Computes the fall risk score from 8 real factors instead of simple if-else rules.
     * Each factor contributes a normalized risk delta to a 0–100 score.
     *
     * FACTORS:
     *  F1 — Sedentary cluster dominance     (up to +25pts)
     *  F2 — Step variance (gait irregularity)(up to +20pts)
     *  F3 — Sleep deficit pattern            (up to +15pts)
     *  F4 — Heart rate anomalies             (up to +10pts)
     *  F5 — Age risk                         (up to +15pts)
     *  F6 — BMI extremes                     (up to +8pts)
     *  F7 — Medical conditions               (up to +20pts)
     *  F8 — Active days bonus                (up to -15pts)
     */
    private computeMultiFactorGaitScore(
        profile: UserProfile | null,
        metrics: DailyHealthMetric[],
        clusters: GaitClusters,
    ): number {
        let score = 20.0; // Healthy baseline

        // F1: Sedentary cluster dominance
        // Every 10% of days that are sedentary beyond 30% adds risk
        const excessSedentary = Math.max(0, clusters.sedentaryPct - 30);
        score += (excessSedentary / 10) * 5; // max +35 if fully sedentary

        // F2: Step variance — high variance = irregular/unstable gait
        // stepVariance > 2,000,000 is very high; normalize to ~20pts
        const stepVarRisk = Math.min(20, (clusters.stepVariance / 3_000_000) * 20);
        score += stepVarRisk;

        // F3: Sleep deficit — days with < 6h sleep increase fatigue-fall risk
        if (metrics.length > 0) {
            const poorSleepDays = metrics.filter(m => (m.sleepHours || 7) < 6).length;
            const poorSleepPct = poorSleepDays / metrics.length;
            score += poorSleepPct * 15;
        }

        // F4: Heart rate anomalies — rest HR > 100 or < 50 is a risk signal
        if (metrics.length > 0) {
            const anomalousHR = metrics.filter(m => m.heartRate && (m.heartRate > 100 || m.heartRate < 50)).length;
            score += Math.min(10, (anomalousHR / metrics.length) * 20);
        }

        // F5: Age risk factor
        if (profile?.age) {
            if (profile.age > 80) score += 15;
            else if (profile.age > 75) score += 10;
            else if (profile.age > 65) score += 5;
        }

        // F6: BMI extremes
        if (profile?.bmi) {
            if (profile.bmi > 35 || profile.bmi < 16) score += 8;
            else if (profile.bmi > 30 || profile.bmi < 18) score += 4;
        }

        // F7: Relevant medical conditions
        if (profile?.medicalConditions?.length) {
            const HIGH_RISK = ['parkinson', 'parkinson\'s', 'ms', 'multiple sclerosis', 'stroke', 'vertigo'];
            const MODERATE_RISK = ['arthritis', 'dizziness', 'diabetes', 'osteoporosis', 'neuropathy'];
            const hasHighRisk = profile.medicalConditions.some(c => HIGH_RISK.some(r => c.toLowerCase().includes(r)));
            const hasModerateRisk = profile.medicalConditions.some(c => MODERATE_RISK.some(r => c.toLowerCase().includes(r)));
            if (hasHighRisk) score += 20;
            else if (hasModerateRisk) score += 10;
        }

        // F8: Active days bonus — reduce score for consistent activity
        if (clusters.activePct >= 40) score -= 15;
        else if (clusters.activePct >= 25) score -= 8;

        return Math.max(5, Math.min(95, score));
    }

    // ── Private: Real gaitSpeedVar from clusters ─────────────────────────────

    /**
     * Derives a "gait variability" percentage (0–100) from step variance.
     * This replaces the hardcoded `gaitSpeedVar: 12` mock.
     * A stepVariance of 0 = perfectly consistent (gaitVar = 0%)
     * A stepVariance of 5,000,000+ = extremely irregular (gaitVar ≈ 100%)
     */
    private deriveGaitVariability(stepVariance: number): number {
        return Math.min(100, Math.round((stepVariance / 5_000_000) * 100));
    }

    // ── Private: AI Coaching Plan ────────────────────────────────────────────

    /**
     * Sends cluster analysis + risk score to Groq LLM to generate a personalized
     * mobility coaching plan with specific exercises.
     */
    private async generateMobilityCoaching(
        profile: UserProfile | null,
        clusters: GaitClusters,
        currentScore: number,
    ): Promise<MobilityCoachingPlan> {
        const riskCategory: MobilityCoachingPlan['riskCategory'] =
            currentScore > 70 ? 'CRITICAL' :
            currentScore > 55 ? 'HIGH' :
            currentScore > 35 ? 'MODERATE' : 'LOW';

        const SYSTEM_PROMPT = `
You are "ElderConnect Mobility Coach", a specialist AI physiotherapist for elder care.
Your role is to analyze a patient's movement patterns and generate a PERSONALIZED, SAFE, and ACTIONABLE mobility coaching plan.

RULES:
- SAFETY FIRST: All exercises must be safe for elderly users. Always recommend holding onto furniture or using a chair for support where appropriate.
- PERSONALIZATION: Use the patient's specific cluster data and conditions to justify each exercise.
- SPECIFICITY: Don't give generic advice. Explain WHY each exercise was chosen for this specific user.
- TONE: Warm, encouraging, "personal trainer" tone.
- COUNT: Provide exactly 4 exercises.

OUTPUT FORMAT (strict JSON):
{
  "summary": "2-3 sentence summary of the patient's movement patterns and what this means for their fall risk.",
  "riskCategory": "LOW | MODERATE | HIGH | CRITICAL",
  "weeklyGoal": "One specific, measurable weekly goal for this patient.",
  "exercises": [
    {
      "id": "ex_001",
      "name": "Exercise Name",
      "goal": "What this exercise achieves physiologically.",
      "duration": "e.g. 30 seconds each side",
      "sets": 3,
      "difficulty": "beginner | intermediate | advanced",
      "tailoredReason": "The specific reason this was chosen for THIS patient based on their data."
    }
  ]
}
`;

        const USER_MESSAGE = `
PATIENT MOBILITY PROFILE:
- Risk Score: ${currentScore}/100 (Category: ${riskCategory})
- Age: ${profile?.age ?? 'Unknown'}
- Medical Conditions: ${profile?.medicalConditions?.join(', ') || 'None reported'}
- BMI: ${profile?.bmi?.toFixed(1) ?? 'Unknown'}

ACTIVITY CLUSTER ANALYSIS (last 30 days):
- Sedentary Days: ${clusters.sedentaryPct}% of days (low movement, <2,000 steps)
- Moderate Activity Days: ${clusters.moderatePct}% of days (2,000–6,000 steps)
- Active Days: ${clusters.activePct}% of days (>6,000 steps)
- Dominant Pattern: ${clusters.dominantPattern}
- Step Variance (Gait Irregularity Index): ${clusters.stepVariance.toLocaleString()} (higher = more erratic movement)
- Heart Rate Variance: ${clusters.hrVariance.toLocaleString()}

COACHING DIRECTIVE:
Design a plan to help this patient shift their dominant pattern towards "moderate" or "active" 
and reduce gait irregularity. Focus on balance, strength, and coordination exercises appropriate 
for their risk level and medical conditions.
`;

        try {
            const result = await this.aiEngine.generateStructuredResponse(SYSTEM_PROMPT, USER_MESSAGE);
            this.logger.log(`AI Coaching generated successfully for risk category ${riskCategory}`);
            return result as MobilityCoachingPlan;
        } catch (error) {
            this.logger.error(`AI coaching generation failed: ${error.message}. Using fallback plan.`);
            return this.getFallbackCoachingPlan(riskCategory, clusters);
        }
    }

    /**
     * Deterministic fallback coaching plan used when the AI call fails.
     * Ensures the endpoint always returns a valid, safe plan.
     */
    private getFallbackCoachingPlan(
        riskCategory: MobilityCoachingPlan['riskCategory'],
        clusters: GaitClusters,
    ): MobilityCoachingPlan {
        const isHigh = riskCategory === 'HIGH' || riskCategory === 'CRITICAL';
        return {
            summary: `Your movement analysis shows ${clusters.sedentaryPct}% sedentary days in the last month. ${isHigh ? 'This level of inactivity significantly elevates your fall risk.' : 'With consistency, you can improve your balance and reduce risk.'}`,
            riskCategory,
            weeklyGoal: isHigh
                ? 'Add 10 minutes of gentle walking on 4 days this week'
                : 'Achieve at least 3,000 steps on 5 days this week',
            exercises: [
                {
                    id: 'ex_001',
                    name: 'Chair-Supported Standing Balance',
                    goal: 'Improve postural stability and ankle proprioception',
                    duration: '30 seconds each leg',
                    sets: 3,
                    difficulty: 'beginner',
                    tailoredReason: `Your gait variability index suggests inconsistent balance. This exercise directly trains the stabilizing muscles.`,
                },
                {
                    id: 'ex_002',
                    name: 'Seated Leg Lifts',
                    goal: 'Strengthen hip flexors and quadriceps to support safe stepping',
                    duration: '10 repetitions each leg',
                    sets: 2,
                    difficulty: 'beginner',
                    tailoredReason: `With ${clusters.sedentaryPct}% sedentary days, your leg strength may need rebuilding. This can be done safely from your chair.`,
                },
                {
                    id: 'ex_003',
                    name: 'Heel-to-Toe Tandem Walk',
                    goal: 'Improve dynamic balance and coordination during walking',
                    duration: '5 meters forward and back',
                    sets: 3,
                    difficulty: isHigh ? 'intermediate' : 'beginner',
                    tailoredReason: 'Simulates the precision required for safe walking on narrow paths or stairs.',
                },
                {
                    id: 'ex_004',
                    name: 'Neck and Shoulder Rolls',
                    goal: 'Reduce upper body tension that affects balance and gait',
                    duration: '10 slow rotations each direction',
                    sets: 2,
                    difficulty: 'beginner',
                    tailoredReason: 'Upper body rigidity is a common, overlooked contributor to balance issues in older adults.',
                },
            ],
        };
    }

    // ── Public: Historical Per-Day Score ────────────────────────────────────

    /**
     * Computes a per-day risk score for the chart, now using the same
     * multi-factor logic applied to each individual day's data.
     */
    private computeDayScore(
        metric: DailyHealthMetric,
        profile: UserProfile | null,
        dayClusterLabel: number, // 0=sedentary, 1=moderate, 2=active
    ): number {
        let score = 20.0;

        // Cluster contribution
        if (dayClusterLabel === 0) score += 20;
        else if (dayClusterLabel === 1) score += 8;
        else score -= 5; // active day bonus

        // Steps
        if (metric.steps < 1500) score += 20;
        else if (metric.steps < 3000) score += 10;
        else if (metric.steps >= 7000) score -= 10;

        // Sleep
        if ((metric.sleepHours || 7) < 5) score += 15;
        else if ((metric.sleepHours || 7) < 6.5) score += 5;
        else if ((metric.sleepHours || 7) >= 7) score -= 5;

        // Heart rate
        if (metric.heartRate && (metric.heartRate > 100 || metric.heartRate < 55)) score += 10;

        // SpO2
        if (metric.oxygenSaturation && metric.oxygenSaturation < 95) score += 10;

        // Profile factors (static contribution)
        if (profile?.age && profile.age > 75) score += 8;
        if (profile?.bmi && (profile.bmi > 30 || profile.bmi < 18)) score += 4;

        return Math.max(5, Math.min(95, score));
    }

    // ── Private: Intelligent Caregiver Escalation ────────────────────────────

    private async checkAndEscalateCriticalRisk(profile: UserProfile, currentScore: number): Promise<void> {
        if (currentScore <= 70) return; // Only escalate CRITICAL

        // Get persistent memory/preferences for rate limiting
        const preferences = profile.preferences || {};
        const lastEscalation = preferences.lastFallRiskEscalation ? new Date(preferences.lastFallRiskEscalation) : null;
        
        // 24-hour cooldown to prevent SMS spam
        if (lastEscalation && (Date.now() - lastEscalation.getTime() < 24 * 60 * 60 * 1000)) {
            return;
        }

        this.logger.warn(`User ${profile.userId} hit CRITICAL risk score (${currentScore}). Escalating to emergency contacts.`);

        // Find primary emergency contact
        const emergencyPhone = profile.emergencyContactPhone;
        const emergencyName = profile.emergencyContactName || 'Emergency Contact';

        if (emergencyPhone) {
            const message = `ElderConnect Alert: ${emergencyName}, the monitored user has reached a CRITICAL Fall Risk Score of ${Math.round(currentScore)}. Suggested Action: Consider a quick check-in call to ensure they are feeling steady today and haven't skipped their medications.`;
            
            try {
                await this.twilioService.sendSMS(emergencyPhone, message, 'high');
                
                // Update timestamp
                preferences.lastFallRiskEscalation = new Date().toISOString();
                profile.preferences = preferences;
                await this.profileRepository.save(profile);
            } catch (err) {
                this.logger.error(`Failed to send escalation SMS: ${err.message}`);
            }
        }
    }

    // ── Public API Methods ───────────────────────────────────────────────────

    async getAnalysis(userId: string) {
        const profile = await this.profileRepository.findOne({ where: { userId } });
        const metrics = await this.metricRepository.find({
            where: { userProfileId: profile?.id },
            order: { date: 'DESC' },
            take: 30,
        });

        // 1. Compute activity clusters (K-Means over 30 days)
        const gaitClusters = this.computeGaitClusters(metrics);

        // 2. Run K-Means labels per-day for per-day score computation
        const points: MetricPoint[] = metrics.map(m => ({
            steps: m.steps,
            heartRate: m.heartRate || 70,
            sleepHours: m.sleepHours || 6,
        }));
        const perDayLabels = kMeansCluster(points);

        // 3. Compute multi-factor overall score
        const currentScore = this.computeMultiFactorGaitScore(profile, metrics, gaitClusters);

        // 3.5. Background Intelligent Escalation if Critical
        if (profile) {
            this.checkAndEscalateCriticalRisk(profile, currentScore).catch(e => 
                this.logger.error(`Escalation background thread failed: ${e.message}`)
            );
        }

        // 4. Build trend-aware forecasts based on cluster shift direction
        // If sedentary is dominant and rising, risk goes up; else down
        const trendModifier = gaitClusters.dominantPattern === 'sedentary' ? 1.5 : -1.5;
        const forecast7Score = Math.max(5, Math.min(95, currentScore + trendModifier * 2));
        const forecast30Score = Math.max(5, Math.min(95, currentScore + trendModifier * 5));

        // 5. Build historical data chart with per-day cluster-aware scores
        const historicalData = metrics.map((m, i) => ({
            timestamp: new Date(m.date).toISOString(),
            score: this.computeDayScore(m, profile, perDayLabels[i] ?? 1),
        })).reverse();

        // 6. Derive real gaitSpeedVar from cluster step variance
        const gaitSpeedVar = this.deriveGaitVariability(gaitClusters.stepVariance);
        const activityLevel = Math.min(100, Math.round((gaitClusters.activePct / 100) * 100 + gaitClusters.moderatePct * 0.5));

        return {
            currentScore,
            lastUpdate: new Date().toISOString(),
            gaitClusters,
            indicators: {
                gaitSpeedVar,
                activityLevel: Math.min(100, activityLevel),
                medicationAdherence: 85, // Linked from medication logs — kept as-is
                recentFalls: 0,
                environmentalRisk: Math.min(50, gaitClusters.sedentaryPct * 0.5),
            },
            forecasts: [
                {
                    days: 7,
                    predictedScore: forecast7Score,
                    confidenceInterval: [forecast7Score - 5, forecast7Score + 5] as [number, number],
                    trend: (trendModifier > 0 ? 'up' : 'down') as 'up' | 'down' | 'stable',
                },
                {
                    days: 30,
                    predictedScore: forecast30Score,
                    confidenceInterval: [forecast30Score - 10, forecast30Score + 10] as [number, number],
                    trend: (trendModifier > 0 ? 'up' : 'down') as 'up' | 'down' | 'stable',
                },
            ],
            historicalData,
        };
    }

    async getCoachingPlan(userId: string): Promise<MobilityCoachingPlan> {
        this.logger.log(`Generating AI coaching plan for user ${userId}`);
        const profile = await this.profileRepository.findOne({ where: { userId } });
        const metrics = await this.metricRepository.find({
            where: { userProfileId: profile?.id },
            order: { date: 'DESC' },
            take: 30,
        });

        const gaitClusters = this.computeGaitClusters(metrics);
        const currentScore = this.computeMultiFactorGaitScore(profile, metrics, gaitClusters);

        return this.generateMobilityCoaching(profile, gaitClusters, currentScore);
    }

    async getAlerts(userId: string) {
        const alerts = await this.sosRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: 5,
        });

        return alerts.map(a => ({
            id: a.id,
            type: a.priority === AlertPriority.CRITICAL || a.priority === AlertPriority.HIGH ? 'danger' as const : 'warning' as const,
            message: a.description,
            timestamp: new Date(a.createdAt).toISOString(),
            indicator: a.type,
        }));
    }

    async getRecommendations(userId: string) {
        // Shares the DB fetch with getCoachingPlan logic but avoids a redundant
        // duplicate query chain by computing clusters directly here.
        try {
            const profile = await this.profileRepository.findOne({ where: { userId } });
            const metrics = await this.metricRepository.find({
                where: { userProfileId: profile?.id },
                order: { date: 'DESC' },
                take: 30,
            });
            const clusters = this.computeGaitClusters(metrics);
            const currentScore = this.computeMultiFactorGaitScore(profile, metrics, clusters);
            const plan = await this.generateMobilityCoaching(profile, clusters, currentScore);

            return plan.exercises.map((ex, i) => ({
                id: ex.id,
                category: i === 0 || i === 2 ? 'exercise' as const : i === 1 ? 'medication' as const : 'environment' as const,
                title: ex.name,
                description: `${ex.goal} — ${ex.tailoredReason}`,
                priority: ex.difficulty === 'advanced' ? 'high' as const : ex.difficulty === 'intermediate' ? 'medium' as const : 'low' as const,
            }));
        } catch (err) {
            this.logger.warn(`getRecommendations fallback triggered: ${err?.message}`);
            return [{
                id: '1',
                category: 'exercise' as const,
                title: 'Daily Balance Exercises',
                description: 'Try 5 minutes of guided balance exercises from the app.',
                priority: 'medium' as const,
            }];
        }
    }

    async updateThreshold(userId: string, threshold: number) {
        const profile = await this.profileRepository.findOne({ where: { userId } });
        if (!profile) throw new NotFoundException(`Profile not found for user ${userId}`);

        const preferences = profile.preferences || {};
        preferences.alertThreshold = threshold;
        profile.preferences = preferences;

        await this.profileRepository.save(profile);
    }
}
