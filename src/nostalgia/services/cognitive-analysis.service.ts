import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiEngineService } from '../../ai/ai-engine.service';
import { CognitiveAssessment, AssessmentType } from '../entities/cognitive-assessment.entity';

@Injectable()
export class CognitiveAnalysisService {
  private readonly logger = new Logger(CognitiveAnalysisService.name);

  constructor(
    @InjectRepository(CognitiveAssessment, 'auth')
    private readonly assessmentRepo: Repository<CognitiveAssessment>,
    private readonly aiEngine: AiEngineService,
  ) {}

  /**
   * Analyzes an individual memory transcript for mood and sentiment.
   */
  async analyzeMemoryMood(userId: string, transcript: string): Promise<{ score: number, label: string, analysis: string }> {
    const systemPrompt = `You are a geriatric psychiatric assistant. 
Analyze the following diary entry for emotional tone and loneliness markers.
Output a JSON object:
{
  "score": 0.0 to 1.0 (1.0 is very positive/stable, 0.0 is severely depressed/lonely),
  "label": "One word label (e.g. Positive, Neutral, Sad, Anxious, Lonely)",
  "analysis": "1-2 sentence clinical-friendly summary"
}`;

    try {
      const assessment = await this.aiEngine.generateStructuredResponse(systemPrompt, transcript);
      
      // Save the assessment record
      const record = this.assessmentRepo.create({
        userId,
        type: AssessmentType.MOOD,
        source: 'NOSTALGIA',
        score: assessment.score,
        label: assessment.label,
        analysis: assessment.analysis,
      });
      await this.assessmentRepo.save(record);

      return assessment;
    } catch (err) {
      this.logger.error(`Failed to analyze mood: ${err.message}`);
      return { score: 0.5, label: 'Stable', analysis: 'Routine update recorded.' };
    }
  }

  /**
   * Analyzes linguistic trends over time to detect cognitive shifts.
   */
  async evaluateCognitiveStability(userId: string, transcripts: string[]): Promise<any> {
    if (transcripts.length < 3) return null; // Need baseline

    const systemPrompt = `You are a clinical neuro-linguistic analyst.
Analyze these transcripts from a senior citizen for 'Cognitive Shift' markers:
1. Vocabulary Shrinkage (simplification of words)
2. Verbal Repetition (repeating phrases or ideas excessively)
3. Syntactic Complexity (loss of complex structures)

Return JSON:
{
  "stabilityScore": 0.0 to 1.0 (1.0 is perfect stability),
  "markersDetected": ["marker1", "marker2"],
  "trend": "Stable" | "Declining" | "Improving",
  "analysis": "Clinical summary of cognitive trajectory"
}`;

    const userMessage = `Recent Transcripts for Analysis:\n${transcripts.join('\n---\n')}`;

    try {
      const result = await this.aiEngine.generateStructuredResponse(systemPrompt, userMessage);
      
      const record = this.assessmentRepo.create({
        userId,
        type: AssessmentType.COGNITIVE,
        source: 'VOICE_TRANSCRIPTS',
        score: result.stabilityScore,
        label: result.trend,
        metadata: { markers: result.markersDetected },
        analysis: result.analysis,
      });
      await this.assessmentRepo.save(record);

      return result;
    } catch (err) {
      this.logger.error(`Failed cognitive evaluation: ${err.message}`);
      return null;
    }
  }

  /**
   * Orchestrates the evaluation of recent voice interactions for a user.
   */
  async runPeriodicCognitiveCheck(userId: string, interactionRepo: Repository<any>): Promise<any> {
    const interactions = await interactionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    if (interactions.length < 5) {
      this.logger.log(`Insufficient voice data for user ${userId} for cognitive check.`);
      return null;
    }

    const transcripts = interactions.map(i => i.transcript);
    return this.evaluateCognitiveStability(userId, transcripts);
  }
}
