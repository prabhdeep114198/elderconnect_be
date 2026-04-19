/**
 * Shared types for the Fall Risk & Mobility Coaching pipeline.
 * Exported from a dedicated file so both the service and controller
 * can reference them without TypeScript's "cannot be named" error.
 */

export interface GaitClusters {
    sedentaryPct: number;
    moderatePct: number;
    activePct: number;
    stepVariance: number;
    hrVariance: number;
    dominantPattern: 'sedentary' | 'moderate' | 'active';
}

export interface CoachingExercise {
    id: string;
    name: string;
    goal: string;
    duration: string;
    sets: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    tailoredReason: string;
}

export interface MobilityCoachingPlan {
    summary: string;
    riskCategory: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    weeklyGoal: string;
    exercises: CoachingExercise[];
}
