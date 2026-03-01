
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class ChatResponseDto {
  reply: string;
  conversationId: string;
}

// Internal interfaces for N8N payload
export interface ContextScores {
  physical: number;
  mental: number;
  sleep: number;
  social: number;
  diet: number;
  exercise: number;
}

export interface VitalRecord {
  type: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface UserContext {
  scores: ContextScores;
  lastMood: string;
  recentVitals: VitalRecord[];
  riskLevel: 'low' | 'medium' | 'high';
}


