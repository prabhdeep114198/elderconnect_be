import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { NostalgiaMemory } from './entities/nostalgia-memory.entity';
import { CognitiveAssessment } from './entities/cognitive-assessment.entity';
import { VoiceInteraction } from '../voice-assistant/entities/voice-interaction.entity';
import { CreateMemoryDto } from './dto/nostalgia.dto';
import { CognitiveAnalysisService } from './services/cognitive-analysis.service';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NostalgiaService {
  private readonly logger = new Logger(NostalgiaService.name);
  private readonly xaiApiKey: string;
  private readonly containerName = 'elderconnect-memories';
  private blobServiceClient: BlobServiceClient | null = null;

  private readonly fallbackPrompts = [
    "What is your favorite memory from a childhood festival?",
    "Tell me about a time you felt incredibly proud of yourself.",
    "What was the most mischievous thing you did in school?",
    "How did you meet your spouse? Tell me the story.",
    "What is a piece of advice your parents gave you that you never forgot?",
    "Describe what your childhood home looked like.",
    "What was your first job, and what did you learn from it?"
  ];

  constructor(
    @InjectRepository(NostalgiaMemory, 'auth')
    private readonly memoryRepository: Repository<NostalgiaMemory>,
    @InjectRepository(CognitiveAssessment, 'auth')
    private readonly assessmentRepo: Repository<CognitiveAssessment>,
    @InjectRepository(VoiceInteraction, 'vitals')
    private readonly voiceInteractionRepo: Repository<VoiceInteraction>,
    private readonly configService: ConfigService,
    private readonly cognitiveAnalysis: CognitiveAnalysisService,
  ) {
    this.xaiApiKey =
      this.configService.get<string>('GROQ_API_KEY') ||
      this.configService.get<string>('GROK_API_KEY') ||
      '';

    const azureConnectionString = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING');
    if (azureConnectionString) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(azureConnectionString);
    } else {
      this.logger.warn('AZURE_STORAGE_CONNECTION_STRING is not set. Audio uploads will fail.');
    }
  }

  async generatePrompt(userId: string): Promise<string> {
    const recentMemories = await this.memoryRepository.find({
      where: { userId },
      order: { recordedAt: 'DESC' },
      take: 5,
    });

    const recentTopics = recentMemories.map(m => m.prompt).join('\\n');

    if (!this.xaiApiKey) {
      return this.getRandomFallbackPrompt();
    }

    const systemPrompt = `You are a warm, empathetic Nostalgia AI companion for elderly users in India. 
Your goal is to gently prompt them to share a rich, emotional life story or memory.
Ask EXACTLY ONE open-ended question. Be extremely concise, warm, and conversational.
Do not ask questions similar to these recently asked topics:
${recentTopics}`;

    try {
      const payload = {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: "Generate the next nostalgic memory prompt." },
        ],
        temperature: 0.7,
        max_tokens: 150,
      };

      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
        headers: {
          Authorization: `Bearer ${this.xaiApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const prompt = response.data?.choices?.[0]?.message?.content?.trim();
      if (prompt) return prompt;
    } catch (error) {
      this.logger.error(`Failed to generate prompt from AI: ${error.message}`);
    }

    return this.getRandomFallbackPrompt();
  }

  getRandomFallbackPrompt(): string {
    const index = Math.floor(Math.random() * this.fallbackPrompts.length);
    return this.fallbackPrompts[index];
  }

  async uploadAudioToAzure(file: Express.Multer.File): Promise<string> {
    if (!this.blobServiceClient) {
      throw new InternalServerErrorException('Azure Storage is not configured on the server.');
    }

    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      // Ensure container exists (create if missing). Usually this should be done once manually.
      await containerClient.createIfNotExists();
      await containerClient.setAccessPolicy('blob'); // public read access

      const blobName = `${uuidv4()}-${file.originalname.replace(/\\s+/g, '-')}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });

      return blockBlobClient.url;
    } catch (error) {
      this.logger.error(`Azure upload failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload audio file to Azure Blob Storage.');
    }
  }

  async saveMemory(userId: string, dto: CreateMemoryDto, audioFile?: Express.Multer.File): Promise<NostalgiaMemory> {
    let audioUrl: string | undefined;

    if (audioFile) {
      audioUrl = await this.uploadAudioToAzure(audioFile);
    }

    const memory = this.memoryRepository.create({
      userId,
      prompt: dto.prompt,
      transcript: dto.transcript,
      audioUrl,
      themes: dto.themes || [],
    });

    const savedMemory = await this.memoryRepository.save(memory);

    // Trigger background AI analysis for mood
    try {
      const assessment = await this.cognitiveAnalysis.analyzeMemoryMood(userId, dto.transcript);
      savedMemory.moodScore = assessment.score;
      savedMemory.moodLabel = assessment.label;
      await this.memoryRepository.save(savedMemory);
    } catch (err) {
      this.logger.error(`AI Mood analysis failed for memory ${savedMemory.id}: ${err.message}`);
    }

    return savedMemory;
  }

  async getTimeline(userId: string): Promise<NostalgiaMemory[]> {
    return await this.memoryRepository.find({
      where: { userId },
      order: { recordedAt: 'DESC' },
    });
  }

  async getAssessments(userId: string): Promise<CognitiveAssessment[]> {
    return await this.assessmentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async triggerCognitiveCheck(userId: string): Promise<any> {
    return await this.cognitiveAnalysis.runPeriodicCognitiveCheck(userId, this.voiceInteractionRepo);
  }
}
