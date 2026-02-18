import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserInteraction, InteractionType } from './entities/user-interaction.entity';
import { HealthAnalyticsService } from '../monitoring/analytics.service';
import { ProfileService } from '../profile/profile.service';
import { CreateInteractionDto, Recommendation, UserChatContextDto } from './dto/personalization.dto';
import { UserProfile } from '../profile/entities/user-profile.entity';

@Injectable()
export class PersonalizationService {
    private readonly logger = new Logger(PersonalizationService.name);

    // Dynamic Weights for ML-like adaptation (Normalized 0-1)
    private readonly CATEGORY_WEIGHTS = {
        music: 1.0,
        event: 1.0,
        activity: 1.0,
        medication: 1.2, // Higher priority for health
        social: 1.1,
    };

    // Safety Mappings: Condition -> Non-recommended categories/tags
    private readonly SAFETY_CONSTRAINTS: Record<string, string[]> = {
        'Arthritis': ['high-impact', 'running', 'heavy-lifting'],
        'Diabetes': ['high-sugar', 'strenuous-unmonitored'],
        'Hypertension': ['high-intensity', 'sodium-rich'],
        'Dementia': ['complex-puzzles', 'crowded-events-unsupervised'],
        'Asthma': ['outdoor-pollen', 'intense-cardio-cold'],
    };

    // Allergy Mappings: Allergy -> Prohibited keywords
    private readonly ALLERGY_CONSTRAINTS: Record<string, string[]> = {
        'Peanuts': ['peanut', 'nut', 'satay'],
        'Pollen': ['outdoor-garden', 'nature-walk-spring'],
        'Latex': ['rubber-equipment'],
    };

    constructor(
        @InjectRepository(UserInteraction, 'profile')
        private readonly interactionRepository: Repository<UserInteraction>,
        private readonly analyticsService: HealthAnalyticsService,
        private readonly profileService: ProfileService,
    ) { }

    async trackInteraction(userId: string, dto: CreateInteractionDto): Promise<UserInteraction> {
        const interaction = this.interactionRepository.create({
            userId,
            ...dto,
        });
        return this.interactionRepository.save(interaction);
    }

    async getPersonalizedCare(userId: string): Promise<any> {
        const profile = await this.profileService.getProfile(userId);
        const wellness = await this.analyticsService.getWellnessProfile(userId, profile.id);
        const interactions = await this.getRecentInteractions(userId);
        const healthSummary = await this.profileService.getHealthSummary(userId);

        // ML-Driven: Hybrid Recommendation Engine (Content-Based + Collaborative + Heuristics + Safety)
        const recommendations = await this.runHybridRecommendationEngine(profile, wellness, interactions, healthSummary);
        const briefing = this.generateDailyBriefing(profile, wellness, healthSummary);

        return {
            wellness,
            recommendations: recommendations.sort((a, b) => (b.score || 0) - (a.score || 0)),
            dailyBriefing: briefing,
        };
    }

    async getChatbotContext(userId: string): Promise<UserChatContextDto> {
        const profile = await this.profileService.getProfile(userId);
        const wellness = await this.analyticsService.getWellnessProfile(userId, profile.id);
        const interactions = await this.getRecentInteractions(userId);

        const recentAlertsCount = await this.getRecentAlertsCount(userId);
        const hobbies = (profile.preferences?.hobbies as string[]) || [];
        const interests = (profile.preferences?.interests as string[]) || [];

        // Identify primary concerns based on low health scores or missed meds
        const primaryConcerns: string[] = [];
        if (wellness.physicalScore < 60) primaryConcerns.push('Low physical wellness');
        if (wellness.medicationAdherence < 80) primaryConcerns.push('Medication adherence issues');
        if (wellness.mentalScore < 60) primaryConcerns.push('Mental health support needed');

        return {
            userId,
            profileSummary: {
                conditions: profile.medicalConditions,
                allergies: profile.allergies,
                hobbies: [...new Set([...hobbies, ...interests])],
            },
            healthStatus: {
                physicalScore: wellness.physicalScore,
                mentalScore: wellness.mentalScore,
                riskLevel: wellness.riskLevel,
                recentAlerts: recentAlertsCount,
            },
            engagementLevel: interactions.length > 50 ? 'high' : interactions.length > 10 ? 'medium' : 'low',
            primaryConcerns,
        };
    }

    private async runHybridRecommendationEngine(
        profile: UserProfile,
        wellness: any,
        interactions: UserInteraction[],
        healthSummary: any
    ): Promise<Recommendation[]> {
        // 1. CONTENT-BASED FILTERING (Onboarding Preferences + Interaction History)
        const contentRecs = this.getContentBasedRecommendations(profile, interactions);

        // 2. COLLABORATIVE FILTERING (Trends based on Demographic/Wellness)
        const collaborativeRecs = this.getCollaborativeRecommendations(profile, wellness);

        // 3. HEURISTICS (Medications & Immediate Needs)
        const heuristicRecs = this.getHeuristicRecommendations(wellness, healthSummary);

        // 4. HYBRID MIXER & SCORING (Apply ML-inspired weights and Safety Filters)
        const candidates = [...contentRecs, ...collaborativeRecs, ...heuristicRecs];
        return this.applyScoringAndFilters(candidates, profile, wellness, interactions);
    }

    private getContentBasedRecommendations(profile: UserProfile, interactions: UserInteraction[]): Recommendation[] {
        const recommendations: Recommendation[] = [];

        // A. From Onboarding Hobbies/Interests
        const hobbies = (profile.preferences?.hobbies as string[]) || [];
        hobbies.forEach(hobby => {
            recommendations.push({
                type: 'activity',
                title: `${hobby} Time`,
                description: `Based on your interest in ${hobby}, we've found some new activities for you!`,
                priority: 'medium',
                score: 0.8,
                reason: 'Interest Match: Your specified hobby.',
                metadata: { tags: [hobby.toLowerCase()] }
            });
        });

        // B. From Interaction History: Track preferences for Events, Exercise, and Music
        const eventInteractions = interactions.filter(i => i.type === InteractionType.EVENT_JOIN);
        const musicInteractions = interactions.filter(i => i.type === InteractionType.MUSIC_PLAY);

        const favEventCat = this.getTopMetric(eventInteractions, 'category');
        if (favEventCat) {
            recommendations.push({
                type: 'event',
                title: `Recommended: ${favEventCat} Session`,
                description: `We found a new ${favEventCat} event that aligns with your past participation!`,
                priority: 'medium',
                score: 0.9,
                reason: 'History Match: Frequently joined event category.',
                metadata: { tags: [favEventCat.toLowerCase()] }
            });
        }

        const favGenre = this.getTopMetric(musicInteractions, 'genre');
        if (favGenre) {
            recommendations.push({
                type: 'music',
                title: `${favGenre} Radio`,
                description: `Relax with some ${favGenre}. It's your favorite genre!`,
                priority: 'low',
                score: 0.85,
                reason: 'History Match: Top listened music genre.',
                metadata: { tags: [favGenre.toLowerCase()] }
            });
        }

        return recommendations;
    }

    private getCollaborativeRecommendations(profile: UserProfile, wellness: any): Recommendation[] {
        const recommendations: Recommendation[] = [];
        // Simulate trends for similar users
        if (wellness.physicalScore > 75) {
            recommendations.push({
                type: 'event',
                title: 'Outdoor Walking Group',
                description: 'Other active seniors in your area have joined the morning walk.',
                priority: 'medium',
                score: 0.75,
                reason: 'Demographic Trend: Active users in your demographic enjoy this.',
                metadata: { tags: ['social', 'outdoor', 'walking'] }
            });
        }

        if (wellness.mentalScore < 60) {
            recommendations.push({
                type: 'social',
                title: 'Virtual Tea Room',
                description: 'Join a small group chat for some light conversation and company.',
                priority: 'high',
                score: 0.88,
                reason: 'Support Trend: Often helpful when mental wellbeing needs a boost.',
                metadata: { tags: ['social', 'virtual', 'easy'] }
            });
        }
        return recommendations;
    }

    private getHeuristicRecommendations(wellness: any, healthSummary: any): Recommendation[] {
        const recommendations: Recommendation[] = [];

        // Medication Compliance
        if (healthSummary.medications.needingRefill > 0) {
            recommendations.push({
                type: 'medication',
                title: 'Refill: Upcoming Outage',
                description: `You have ${healthSummary.medications.needingRefill} medications low on stock.`,
                priority: 'high',
                score: 0.99,
                actionUrl: '/profile/medications',
                metadata: { category: 'urgent' }
            });
        }

        // Safety adjustment based on physical condition
        if (wellness.physicalScore < 50) {
            recommendations.push({
                type: 'activity',
                title: 'Gentle Stretching',
                description: 'Your physical metrics are lower today. We suggest light stretching instead of a heavy workout.',
                priority: 'high',
                score: 0.96,
                reason: 'Safety: Physical score threshold reached.',
                metadata: { tags: ['low-impact', 'indoor'] }
            });
        }

        return recommendations;
    }

    private applyScoringAndFilters(
        candidates: Recommendation[],
        profile: UserProfile,
        wellness: any,
        interactions: UserInteraction[]
    ): Recommendation[] {
        const seen = new Set<string>();
        const final: Recommendation[] = [];

        // Calculate Interaction-based weight modifiers (Simplified ML)
        const feedbackScores = this.calculateInteractionModifiers(interactions);

        for (const rec of candidates) {
            if (seen.has(rec.title)) continue;

            // 1. BASE SCORE
            let score = rec.score || 0.5;

            // 2. CATEGORY WEIGHTING
            score *= (this.CATEGORY_WEIGHTS[rec.type] || 1.0);

            // 3. INTERACTION FEEDBACK MODIFIER
            const tags = rec.metadata?.tags || [];
            tags.forEach(tag => {
                if (feedbackScores[tag]) score += feedbackScores[tag];
            });

            // 4. WELLNESS MODULATION
            if (wellness.mentalScore < 60 && (rec.type === 'music' || rec.type === 'social')) score += 0.15;
            if (wellness.exerciseScore < 40 && rec.type === 'activity' && wellness.physicalScore > 60) score += 0.12;

            // 5. SAFETY FILTERING (CRITICAL)
            const safetyIssue = this.checkSafetyViolation(rec, profile);
            if (safetyIssue) {
                this.logger.debug(`Filtering out recommendation "${rec.title}" due to safety: ${safetyIssue}`);
                continue;
            }

            final.push({ ...rec, score: Number(Math.min(0.99, score).toFixed(2)) });
            seen.add(rec.title);
        }

        return final;
    }

    private checkSafetyViolation(rec: Recommendation, profile: UserProfile): string | null {
        const tags = rec.metadata?.tags || [];
        const description = rec.description.toLowerCase();

        // Check against Medical Conditions
        for (const condition of profile.medicalConditions) {
            const constraints = this.SAFETY_CONSTRAINTS[condition] || [];
            for (const constraint of constraints) {
                if (tags.includes(constraint) || description.includes(constraint)) {
                    return `Constraint ${constraint} for condition ${condition}`;
                }
            }
        }

        // Check against Allergies
        for (const allergy of profile.allergies) {
            const constraints = this.ALLERGY_CONSTRAINTS[allergy] || [];
            for (const constraint of constraints) {
                if (description.includes(constraint.toLowerCase())) {
                    return `Allergy risk: ${allergy}`;
                }
            }
        }

        return null;
    }

    private calculateInteractionModifiers(interactions: UserInteraction[]): Record<string, number> {
        const modifiers: Record<string, number> = {};

        interactions.forEach(interaction => {
            const delta = interaction.type === InteractionType.EVENT_JOIN || interaction.type === InteractionType.ACTIVITY_COMPLETE ? 0.05 :
                interaction.type === InteractionType.CONTENT_DISMISS ? -0.1 : 0.01;

            const tags = (interaction.metadata?.tags as string[]) || [];
            tags.forEach(tag => {
                modifiers[tag] = (modifiers[tag] || 0) + delta;
            });
        });

        return modifiers;
    }

    private generateDailyBriefing(profile: UserProfile, wellness: any, healthSummary: any): string {
        const name = profile.userId.split('-')[0]; // Fallback if name not in profile
        let briefing = `Good morning! `;

        if (wellness.physicalScore > 80) {
            briefing += `You're looking strong today! Your wellness levels are excellent. `;
        } else if (wellness.physicalScore < 50) {
            briefing += `Take it easy today. Your body could use some extra rest. `;
        } else {
            briefing += `It's a beautiful day to maintain your healthy habits. `;
        }

        if (healthSummary.compliance.weeklyRate < 90) {
            briefing += `Don't forget your medications to stay on track. `;
        }

        return briefing;
    }

    private async getRecentInteractions(userId: string): Promise<UserInteraction[]> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        return this.interactionRepository.find({
            where: {
                userId,
                createdAt: Between(thirtyDaysAgo, new Date()),
            },
            order: { createdAt: 'DESC' },
        });
    }

    private async getRecentAlertsCount(userId: string): Promise<number> {
        // Mocked - would query SOS alerts table
        return 0;
    }

    private getTopMetric(interactions: UserInteraction[], key: string): string | null {
        const counts: Record<string, number> = {};
        interactions.forEach(i => {
            const val = i.metadata?.[key];
            if (val) counts[val] = (counts[val] || 0) + 1;
        });

        const entries = Object.entries(counts);
        if (entries.length === 0) return null;
        return entries.sort((a, b) => b[1] - a[1])[0][0];
    }
}
