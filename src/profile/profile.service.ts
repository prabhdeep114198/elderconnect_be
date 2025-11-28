import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';
import { Medication } from './entities/medication.entity';
import { MedicationLog, MedicationLogStatus } from './entities/medication-log.entity';
import { CreateProfileDto, UpdateProfileDto } from './dto/create-profile.dto';
import { CreateMedicationDto, UpdateMedicationDto, LogMedicationDto } from './dto/medication.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserProfile, 'profile')
    private readonly profileRepository: Repository<UserProfile>,
    @InjectRepository(Medication, 'profile')
    private readonly medicationRepository: Repository<Medication>,
    @InjectRepository(MedicationLog, 'profile')
    private readonly medicationLogRepository: Repository<MedicationLog>,
  ) {}

  // Profile Management
  async createProfile(userId: string, createProfileDto: CreateProfileDto): Promise<UserProfile> {
    // Check if profile already exists
    const existingProfile = await this.profileRepository.findOne({
      where: { userId },
    });

    if (existingProfile) {
      throw new ConflictException('Profile already exists for this user');
    }

    const profile = this.profileRepository.create({
      userId,
      ...createProfileDto,
      dateOfBirth: createProfileDto.dateOfBirth ? new Date(createProfileDto.dateOfBirth) : undefined,
    });

    return this.profileRepository.save(profile);
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.profileRepository.findOne({
      where: { userId },
      relations: ['medications'],
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<UserProfile> {
    const profile = await this.getProfile(userId);

    Object.assign(profile, {
      ...updateProfileDto,
      dateOfBirth: updateProfileDto.dateOfBirth ? new Date(updateProfileDto.dateOfBirth) : profile.dateOfBirth,
    });

    return this.profileRepository.save(profile);
  }

  async deleteProfile(userId: string): Promise<void> {
    const profile = await this.getProfile(userId);
    await this.profileRepository.remove(profile);
  }

  // Medication Management
  async createMedication(userId: string, createMedicationDto: CreateMedicationDto): Promise<Medication> {
    const profile = await this.getProfile(userId);

    const partialMedication: Partial<Medication> = {
      userProfileId: profile.id,
      ...createMedicationDto,
      startDate: new Date(createMedicationDto.startDate),
      endDate: createMedicationDto.endDate ? new Date(createMedicationDto.endDate) : undefined,
    };

    const medication = this.medicationRepository.create(partialMedication);

    return this.medicationRepository.save(medication);
  }

  async getMedications(userId: string, includeInactive: boolean = false): Promise<Medication[]> {
    const profile = await this.getProfile(userId);

    const whereCondition: any = { userProfileId: profile.id };
    if (!includeInactive) {
      whereCondition.isActive = true;
    }

    return this.medicationRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      relations: ['logs'],
    });
  }

  async getMedication(userId: string, medicationId: string): Promise<Medication> {
    const profile = await this.getProfile(userId);

    const medication = await this.medicationRepository.findOne({
      where: { id: medicationId, userProfileId: profile.id },
      relations: ['logs'],
    });

    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    return medication;
  }

  async updateMedication(
    userId: string,
    medicationId: string,
    updateMedicationDto: UpdateMedicationDto,
  ): Promise<Medication> {
    const medication = await this.getMedication(userId, medicationId);

    Object.assign(medication, {
      ...updateMedicationDto,
      startDate: updateMedicationDto.startDate ? new Date(updateMedicationDto.startDate) : medication.startDate,
      endDate: updateMedicationDto.endDate ? new Date(updateMedicationDto.endDate) : medication.endDate,
    });

    return this.medicationRepository.save(medication);
  }

  async deleteMedication(userId: string, medicationId: string): Promise<void> {
    const medication = await this.getMedication(userId, medicationId);
    await this.medicationRepository.remove(medication);
  }

  // Medication Logging
  async logMedication(
    userId: string,
    medicationId: string,
    logMedicationDto: LogMedicationDto,
  ): Promise<MedicationLog> {
    const medication = await this.getMedication(userId, medicationId);

    // Check if log already exists for this scheduled time
    const existingLog = await this.medicationLogRepository.findOne({
      where: {
        medicationId,
        scheduledTime: new Date(logMedicationDto.scheduledTime),
      },
    });

    if (existingLog) {
      throw new ConflictException('Medication log already exists for this scheduled time');
    }

    const log = this.medicationLogRepository.create({
      medicationId,
      ...logMedicationDto,
      scheduledTime: new Date(logMedicationDto.scheduledTime),
      actualTime: logMedicationDto.actualTime ? new Date(logMedicationDto.actualTime) : undefined,
    });

    // Update medication stock if taken
    if (logMedicationDto.status === MedicationLogStatus.TAKEN && medication.currentStock) {
      medication.currentStock -= 1;
      await this.medicationRepository.save(medication);
    }

    return this.medicationLogRepository.save(log);
  }

  async getMedicationLogs(
    userId: string,
    medicationId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<MedicationLog[]> {
    await this.getMedication(userId, medicationId); // Verify access

    const whereCondition: any = { medicationId };

    if (startDate && endDate) {
      whereCondition.scheduledTime = Between(new Date(startDate), new Date(endDate));
    }

    return this.medicationLogRepository.find({
      where: whereCondition,
      order: { scheduledTime: 'DESC' },
      relations: ['medication'],
    });
  }

  async updateMedicationLog(
    userId: string,
    medicationId: string,
    logId: string,
    updateData: Partial<LogMedicationDto>,
  ): Promise<MedicationLog> {
    await this.getMedication(userId, medicationId); // Verify access

    const log = await this.medicationLogRepository.findOne({
      where: { id: logId, medicationId },
    });

    if (!log) {
      throw new NotFoundException('Medication log not found');
    }

    Object.assign(log, {
      ...updateData,
    });

    if (updateData.actualTime !== undefined) {
      log.actualTime = new Date(updateData.actualTime ?? Date.now());
    }

    return this.medicationLogRepository.save(log);
  }

  // Analytics and Reports
  async getMedicationCompliance(userId: string, days: number = 30): Promise<any> {
    const profile = await this.getProfile(userId);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const logs = await this.medicationLogRepository
      .createQueryBuilder('log')
      .innerJoin('log.medication', 'medication')
      .where('medication.userProfileId = :profileId', { profileId: profile.id })
      .andWhere('log.scheduledTime BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getMany();

    const totalScheduled = logs.length;
    const taken = logs.filter(log => log.status === MedicationLogStatus.TAKEN).length;
    const missed = logs.filter(log => log.status === MedicationLogStatus.MISSED).length;
    const skipped = logs.filter(log => log.status === MedicationLogStatus.SKIPPED).length;

    return {
      period: { startDate, endDate, days },
      totalScheduled,
      taken,
      missed,
      skipped,
      complianceRate: totalScheduled > 0 ? (taken / totalScheduled) * 100 : 0,
      onTimeRate: logs.filter(log => log.isOnTime).length / Math.max(taken, 1) * 100,
    };
  }

  async getMedicationReminders(userId: string): Promise<any[]> {
    const profile = await this.getProfile(userId);
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const medications = await this.medicationRepository.find({
      where: {
        userProfileId: profile.id,
        isActive: true,
        reminderEnabled: true,
      },
    });

    const reminders: any[] = [];

    for (const medication of medications) {
      if (medication.schedule) {
        // Parse schedule and create reminders
        Object.entries(medication.schedule).forEach(([timeKey, timeValue]) => {
          if (typeof timeValue === 'string') {
            const [hours, minutes] = timeValue.split(':').map(Number);
            const reminderTime = new Date(now);
            reminderTime.setHours(hours, minutes - medication.reminderMinutesBefore, 0, 0);

            if (reminderTime >= now && reminderTime <= tomorrow) {
              reminders.push({
                medicationId: medication.id,
                medicationName: medication.name,
                dosage: medication.dosage,
                unit: medication.unit,
                scheduledTime: new Date(now).setHours(hours, minutes, 0, 0),
                reminderTime,
                timeKey,
              });
            }
          }
        });
      }

      // Check for refill reminders
      if (medication.needsRefill) {
        reminders.push({
          type: 'refill',
          medicationId: medication.id,
          medicationName: medication.name,
          currentStock: medication.currentStock,
          refillReminder: medication.refillReminder,
        });
      }
    }

    return reminders.sort((a, b) => 
      (a.reminderTime || new Date()).getTime() - (b.reminderTime || new Date()).getTime()
    );
  }

  async getHealthSummary(userId: string): Promise<any> {
    const profile = await this.getProfile(userId);
    const medications = await this.getMedications(userId);
    const compliance = await this.getMedicationCompliance(userId, 7); // Last 7 days

    return {
      profile: {
        age: profile.age,
        bmi: profile.bmi,
        medicalConditions: profile.medicalConditions,
        allergies: profile.allergies,
      },
      medications: {
        total: medications.length,
        active: medications.filter(m => m.isCurrentlyActive).length,
        needingRefill: medications.filter(m => m.needsRefill).length,
      },
      compliance: {
        weeklyRate: compliance.complianceRate,
        onTimeRate: compliance.onTimeRate,
      },
    };
  }
}
