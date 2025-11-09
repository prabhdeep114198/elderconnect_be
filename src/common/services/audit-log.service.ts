import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

export interface AuditLogData {
  userId?: string;
  action: string;
  resource: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  sessionId?: string;
  isSuccessful?: boolean;
  errorMessage?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog, 'audit')
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(data: AuditLogData): Promise<void> {
    try {
      const auditLog = this.auditLogRepository.create({
        ...data,
        isSuccessful: !data.errorMessage,
      });
      
      await this.auditLogRepository.save(auditLog);
    } catch (error) {
      // Log to console if database logging fails
      console.error('Failed to save audit log:', error);
    }
  }

  async findByUserId(
    userId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findByAction(
    action: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { action: action as any },
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100,
    offset: number = 0,
  ): Promise<AuditLog[]> {
    return this.auditLogRepository
      .createQueryBuilder('audit')
      .where('audit.timestamp >= :startDate', { startDate })
      .andWhere('audit.timestamp <= :endDate', { endDate })
      .orderBy('audit.timestamp', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  async getAuditStats(userId?: string): Promise<any> {
    const query = this.auditLogRepository
      .createQueryBuilder('audit')
      .select('audit.action', 'action')
      .addSelect('COUNT(*)', 'count');

    if (userId) {
      query.where('audit.userId = :userId', { userId });
    }

    return query
      .groupBy('audit.action')
      .getRawMany();
  }
}
