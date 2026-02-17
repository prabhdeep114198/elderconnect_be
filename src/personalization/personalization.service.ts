import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserInteraction, InteractionType } from './entities/user-interaction.entity';
import { HealthAnalyticsService } from '../monitoring/analytics.service';
import { ProfileService } from '../profile/profile.service';
import { CreateInteractionDto, Recommendation } from './dto/personalization.dto';

@Injectable()
export class PersonalizationService {
    private readonly logger = new Logger(PersonalizationService.name);

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

        // ML-Driven: Hybrid Recommendation Engine (Content-Based + Collaborative + Heuristics)
        const recommendations = await this.runHybridRecommendationEngine(userId, wellness, interactions, healthSummary);
        const briefing = this.generateDailyBriefing(wellness, healthSummary);

        return {
            wellness,
            recommendations: recommendations.sort((a, b) => (b.score || 0) - (a.score || 0)),
            dailyBriefing: briefing,
        };
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

    private async runHybridRecommendationEngine(
        userId: string,
        wellness: any,
        interactions: UserInteraction[],
        healthSummary: any
    ): Promise<Recommendation[]> {
        // 1. CONTENT-BASED FILTERING (Personal preferences)
        const contentRecs = this.getContentBasedRecommendations(interactions);

        // 2. COLLABORATIVE FILTERING (Trends from similar users)
        const collaborativeRecs = this.getCollaborativeRecommendations(wellness);

        // 3. HEURISTICS (Safety and immediate health needs)
        const heuristicRecs = this.getHeuristicRecommendations(wellness, healthSummary);

        // 4. HYBRID MIXER & SCORING
        const candidates = [...contentRecs, ...collaborativeRecs, ...heuristicRecs];
        return this.applyScoringAndFilters(candidates, wellness);
    }

    private getContentBasedRecommendations(interactions: UserInteraction[]): Recommendation[] {
        const recommendations: Recommendation[] = [];

        // Track preferences for Events, Exercise, and Music
        const eventInteractions = interactions.filter(i => i.type === InteractionType.EVENT_JOIN);
        const musicInteractions = interactions.filter(i => i.type === InteractionType.MUSIC_PLAY);
        const exerciseInteractions = interactions.filter(i => i.metadata?.category === 'exercise');

        const favEventCat = this.getTopMetric(eventInteractions, 'category');
        if (favEventCat) {
            recommendations.push({
                type: 'event',
                title: `Recommended: ${favEventCat} Session`,
                description: `We found a new ${favEventCat} event that aligns with your interests!`,
                priority: 'medium',
                score: 0.85,
                reason: 'Content Match: Matches your previous event participation.'
            });
        }

        const favExercise = this.getTopMetric(exerciseInteractions, 'subCategory');
        if (favExercise) {
            recommendations.push({
                type: 'activity',
                title: `${favExercise} Time`,
                description: `How about some ${favExercise} today? It's one of your most logged activities.`,
                priority: 'medium',
                score: 0.88,
                reason: 'Content Match: Frequently preferred exercise type.'
            });
        }

        const favGenre = this.getTopMetric(musicInteractions, 'genre');
        if (favGenre) {
            recommendations.push({
                type: 'music',
                title: `${favGenre} Vibes`,
                description: `Relax with some ${favGenre}. It's your favorite genre!`,
                priority: 'low',
                score: 0.82,
                reason: 'Content Match: Top listened music genre.'
            });
        }

        return recommendations;
    }

    private getCollaborativeRecommendations(wellness: any): Recommendation[] {
        const recommendations: Recommendation[] = [];
        // Simulate "Users with similar wellness profiles are doing X"
        if (wellness.physicalScore > 75) {
            recommendations.push({
                type: 'event',
                title: 'Outdoor Walking Group',
                description: 'Other active seniors in your area have joined the morning walk. Would you like to join?',
                priority: 'medium',
                score: 0.75,
                reason: 'Collaborative: Active users in your demographic enjoy this.'
            });
        }
        return recommendations;
    }

    private getHeuristicRecommendations(wellness: any, healthSummary: any): Recommendation[] {
        const recommendations: Recommendation[] = [];

        // Priority 1: Health Compliance (Safety/Medications)
        if (healthSummary.medications.needingRefill > 0) {
            recommendations.push({
                type: 'medication',
                title: 'Urgent: Refill Needed',
                description: `You have ${healthSummary.medications.needingRefill} medications low on stock.`,
                priority: 'high',
                score: 0.98,
                actionUrl: '/profile/medications'
            });
        }

        // Priority 2: Safety based on physical condition
        if (wellness.physicalScore < 50) {
            recommendations.push({
                type: 'activity',
                title: 'Rest & Recovery',
                description: 'Your physical metrics are lower today. We suggest light stretching instead of a heavy workout.',
                priority: 'high',
                score: 0.95,
                reason: 'Heuristic: Safety adjustment based on your current physical score.'
            });
        }

        return recommendations;
    }

    private applyScoringAndFilters(candidates: Recommendation[], wellness: any): Recommendation[] {
        const seen = new Set<string>();
        const final: Recommendation[] = [];

        for (const rec of candidates) {
            if (seen.has(rec.title)) continue;

            let finalScore = rec.score || 0.5;

            // Health-Aware Modulation: 
            // If mental health score is low, boost relaxing music and social activities.
            if (wellness.mentalScore < 60) {
                if (rec.type === 'music') finalScore += 0.1;
                if (rec.type === 'social') finalScore += 0.15;
            }

            // Low Activity Score boost
            if (wellness.exerciseScore < 40 && rec.type === 'activity' && wellness.physicalScore > 60) {
                finalScore += 0.12;
            }

            final.push({ ...rec, score: Number(finalScore.toFixed(2)) });
            seen.add(rec.title);
        }

        return final;
    }

    private generateDailyBriefing(wellness: any, healthSummary: any): string {
        const name = "there"; // Ideally get from user
        let briefing = `Good morning! `;

        if (wellness.physicalScore > 80) {
            briefing += `You're looking strong today! Your wellness levels are excellent. `;
        } else if (wellness.physicalScore < 50) {
            briefing += `Take it easy today. Your body could use some extra rest. `;
        } else {
            briefing += `It's a beautiful day to maintain your healthy habits. `;
        }

        if (healthSummary.compliance.weeklyRate < 90) {
            briefing += `Remember to take your medications on time to stay at your best. `;
        }

        return briefing;
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
