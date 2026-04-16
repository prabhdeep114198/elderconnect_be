import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from '../../profile/entities/user-profile.entity';
import { AiEngineService } from '../../ai/ai-engine.service';

/**
 * The shape of a user's persistent memory object.
 * Stored inside UserProfile.preferences.memory as JSONB — no migration needed.
 */
export interface UserMemory {
  [key: string]: any; // Index signature to satisfy TypeORM JSONB storage
  name?: string;
  preferredLanguage?: string;           // 'en', 'hi', 'hi-en'
  healthConcerns?: string[];            // ['diabetes', 'knee pain']
  medications?: string[];               // ['Metformin', 'Aspirin']
  preferences?: {
    food?: string[];                    // ['dal', 'khichdi']
    hobbies?: string[];                 // ['gardening', 'reading']
    wakeUpTime?: string;                // '6:30 AM'
    sleepTime?: string;                 // '10:00 PM'
  };
  frequentTopics?: string[];            // ['blood pressure', 'weather', 'grandson']
  lastUpdated?: string;                 // ISO timestamp
}

/**
 * AssistantMemoryService manages persistent long-term user memory
 * for the ElderConnect AI voice and chat assistant.
 * Memory is stored in UserProfile.preferences.memory (JSONB, no migration).
 */
@Injectable()
export class AssistantMemoryService {
  private readonly logger = new Logger(AssistantMemoryService.name);

  constructor(
    @InjectRepository(UserProfile, 'profile')
    private readonly profileRepository: Repository<UserProfile>,
    private readonly aiEngine: AiEngineService,
  ) {}

  /**
   * Fetch the current memory for a user.
   */
  async getMemory(userId: string): Promise<UserMemory> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if (!profile) return {};
    return (profile.preferences?.memory || {}) as UserMemory;
  }

  /**
   * Format memory into a concise, structured string for AI prompts.
   */
  formatMemoryForPrompt(memory: UserMemory): string {
    if (!memory || Object.keys(memory).length === 0) {
      return 'No prior memory yet. This may be the first interaction.';
    }

    const lines: string[] = ['[LONG-TERM USER MEMORY]'];

    if (memory.name) lines.push(`- Name: ${memory.name}`);
    if (memory.preferredLanguage) lines.push(`- Preferred Language: ${memory.preferredLanguage}`);
    if (memory.healthConcerns?.length) lines.push(`- Health Concerns: ${memory.healthConcerns.join(', ')}`);
    if (memory.medications?.length) lines.push(`- Known Medications: ${memory.medications.join(', ')}`);
    if (memory.preferences?.food?.length) lines.push(`- Favourite Foods: ${memory.preferences.food.join(', ')}`);
    if (memory.preferences?.hobbies?.length) lines.push(`- Hobbies: ${memory.preferences.hobbies.join(', ')}`);
    if (memory.preferences?.wakeUpTime) lines.push(`- Wake Up Time: ${memory.preferences.wakeUpTime}`);
    if (memory.frequentTopics?.length) lines.push(`- Frequently Asks About: ${memory.frequentTopics.join(', ')}`);

    return lines.join('\n');
  }

  /**
   * Use the AI engine to extract important facts from a conversation turn
   * and merge them into the persisted memory.
   */
  async updateMemoryFromConversation(
    userId: string,
    userMessage: string,
    currentMemory: UserMemory,
  ): Promise<void> {
    const systemPrompt = `You are a memory extractor for an elderly care AI assistant.
    
Your job is to identify IMPORTANT long-term facts from the user's message that should be remembered for future conversations.

RULES:
- Only extract facts that are long-term and meaningful (name, health issues, medications, preferences, habits).
- Ignore trivial or one-time requests (e.g., "remind me at 5pm" — this is not a long-term memory).
- If nothing important is found, return null for all fields.
- Be strict: do NOT hallucinate or guess.

Return a JSON object matching this shape (all fields optional):
{
  "name": "string or null",
  "preferredLanguage": "string (e.g. 'hi', 'en', 'hi-en') or null",
  "healthConcerns": ["string"] or null,
  "medications": ["string"] or null,
  "preferences": {
    "food": ["string"] or null,
    "hobbies": ["string"] or null,
    "wakeUpTime": "string or null",
    "sleepTime": "string or null"
  } or null,
  "frequentTopics": ["string"] or null
}`;

    try {
      const extracted = await this.aiEngine.generateStructuredResponse(
        systemPrompt,
        `User message: "${userMessage}"\n\nExisting memory: ${JSON.stringify(currentMemory)}`,
      );

      // Merge new facts into existing memory (non-destructive)
      const updated: UserMemory = { ...currentMemory };

      if (extracted.name) updated.name = extracted.name;
      if (extracted.preferredLanguage) updated.preferredLanguage = extracted.preferredLanguage;

      if (extracted.healthConcerns?.length) {
        updated.healthConcerns = [...new Set([...(updated.healthConcerns || []), ...extracted.healthConcerns])];
      }
      if (extracted.medications?.length) {
        updated.medications = [...new Set([...(updated.medications || []), ...extracted.medications])];
      }
      if (extracted.preferences?.food?.length) {
        updated.preferences = updated.preferences || {};
        updated.preferences.food = [...new Set([...(updated.preferences.food || []), ...extracted.preferences.food])];
      }
      if (extracted.preferences?.hobbies?.length) {
        updated.preferences = updated.preferences || {};
        updated.preferences.hobbies = [...new Set([...(updated.preferences.hobbies || []), ...extracted.preferences.hobbies])];
      }
      if (extracted.preferences?.wakeUpTime) {
        updated.preferences = updated.preferences || {};
        updated.preferences.wakeUpTime = extracted.preferences.wakeUpTime;
      }
      if (extracted.frequentTopics?.length) {
        updated.frequentTopics = [...new Set([...(updated.frequentTopics || []), ...extracted.frequentTopics])].slice(-10);
      }

      updated.lastUpdated = new Date().toISOString();

      // Persist to DB (inside preferences JSONB, no migration needed)
      const profile = await this.profileRepository.findOne({ where: { userId } });
      if (profile) {
        profile.preferences = { 
          ...(profile.preferences || {}), 
          memory: updated 
        };
        await this.profileRepository.save(profile);
      }

      this.logger.log(`[Memory] Updated memory for user ${userId}`);
    } catch (err) {
      this.logger.error(`[Memory] Failed to update memory: ${err.message}`);
    }
  }

  private async getFullPreferences(userId: string): Promise<Record<string, any>> {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    return profile?.preferences || {};
  }
}
