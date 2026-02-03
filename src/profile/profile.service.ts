import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';
import { Medication } from './entities/medication.entity';
import { MedicationLog, MedicationLogStatus } from './entities/medication-log.entity';
import { CreateProfileDto, UpdateProfileDto } from './dto/create-profile.dto';
import { CreateMedicationDto, UpdateMedicationDto, LogMedicationDto } from './dto/medication.dto';
import { DailyHealthMetric } from './entities/daily-health-metric.entity';
import { Appointment } from './entities/appointment.entity';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { SocialEvent } from './entities/social-event.entity';
import { UpdateHealthMetricDto } from './dto/update-health-metric.dto';
import { UserStreak, StreakType } from './entities/user-streak.entity';
import { UserAchievement } from './entities/user-achievement.entity';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserProfile, 'profile')
    private readonly profileRepository: Repository<UserProfile>,
    @InjectRepository(Medication, 'profile')
    private readonly medicationRepository: Repository<Medication>,
    @InjectRepository(MedicationLog, 'profile')
    private readonly medicationLogRepository: Repository<MedicationLog>,
    @InjectRepository(DailyHealthMetric, 'profile')
    private readonly healthMetricRepository: Repository<DailyHealthMetric>,
    @InjectRepository(Appointment, 'profile')
    private readonly appointmentRepository: Repository<Appointment>,
    @InjectRepository(SocialEvent, 'profile')
    private readonly socialEventRepository: Repository<SocialEvent>,
    @InjectRepository(UserStreak, 'profile')
    private readonly streakRepository: Repository<UserStreak>,
    @InjectRepository(UserAchievement, 'profile')
    private readonly achievementRepository: Repository<UserAchievement>,
  ) { }

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
      height: createProfileDto.height ?? createProfileDto.heightCm,
      weight: createProfileDto.weight ?? createProfileDto.weightKg,
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
      height: updateProfileDto.height ?? updateProfileDto.heightCm ?? profile.height,
      weight: updateProfileDto.weight ?? updateProfileDto.weightKg ?? profile.weight,
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

    // Handle unit if missing
    let unit = createMedicationDto.unit;
    if (!unit) {
      const match = createMedicationDto.dosage.match(/([a-zA-Z]+)$/);
      unit = match ? match[1] : 'units';
    }

    // Handle schedule from time
    let schedule = createMedicationDto.schedule;
    if (!schedule && createMedicationDto.time) {
      schedule = { daily: createMedicationDto.time };
    }

    const partialMedication: Partial<Medication> = {
      userProfileId: profile.id,
      ...createMedicationDto,
      unit,
      schedule,
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

    const savedLog = await this.medicationLogRepository.save(log);

    // Update streaks if medication was taken
    if (logMedicationDto.status === MedicationLogStatus.TAKEN) {
      await this.updateStreak(userId, StreakType.MEDICATION);
    }

    return savedLog;
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

  // Health Metrics
  async updateHealthMetric(userId: string, updateDto: UpdateHealthMetricDto): Promise<DailyHealthMetric> {
    const profile = await this.getProfile(userId);
    const date = updateDto.timestamp ? new Date(updateDto.timestamp) : new Date();
    date.setHours(0, 0, 0, 0); // Normalize to start of day

    let metric = await this.healthMetricRepository.findOne({
      where: {
        userProfileId: profile.id,
        date: date,
      },
    });

    if (!metric) {
      metric = this.healthMetricRepository.create({
        userProfileId: profile.id,
        date: date,
        steps: 0,
        waterIntake: 0,
        heartRate: 0,
        sleepHours: 0,
      });
    }

    switch (updateDto.type) {
      case 'steps':
        metric.steps = updateDto.value;
        break;
      case 'heartRate':
        metric.heartRate = updateDto.value;
        break;
      case 'sleep':
        metric.sleepHours = updateDto.value;
        break;
      case 'water':
        metric.waterIntake = updateDto.value;
        break;
    }

    // If steps are updated, update the steps streak
    if (updateDto.type === 'steps' && updateDto.value > 0) {
      await this.updateStreak(userId, StreakType.STEPS);
    }

    return this.healthMetricRepository.save(metric);
  }

  // --- GAMIFICATION LOGIC ---

  async getStreaks(userId: string) {
    const streaks = await this.streakRepository.find({ where: { userId } });
    // Default values if not found
    const defaultStreaks = {
      medication: streaks.find(s => s.type === StreakType.MEDICATION)?.count || 0,
      steps: streaks.find(s => s.type === StreakType.STEPS)?.count || 0,
      health: streaks.find(s => s.type === StreakType.HEALTH)?.count || 0,
    };
    return defaultStreaks;
  }

  async getAchievements(userId: string) {
    return this.achievementRepository.find({
      where: { userId },
      order: { earnedAt: 'DESC' }
    });
  }

  private async updateStreak(userId: string, type: StreakType) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = await this.streakRepository.findOne({ where: { userId, type } });

    if (!streak) {
      streak = this.streakRepository.create({
        userId,
        type,
        count: 1,
        lastActiveDate: today,
      });
    } else {
      const lastDate = new Date(streak.lastActiveDate);
      lastDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Increment streak
        streak.count += 1;
        streak.lastActiveDate = today;
      } else if (diffDays > 1) {
        // Streak broken
        streak.count = 1;
        streak.lastActiveDate = today;
      }
      // If diffDays === 0, already updated today
    }

    await this.streakRepository.save(streak);
    await this.checkAchievements(userId, streak);
  }

  private async checkAchievements(userId: string, streak: UserStreak) {
    // Basic achievement logic
    const achievements: Array<{ id: string, name: string, icon: string, color: string }> = [];

    if (streak.type === StreakType.MEDICATION && streak.count === 7) {
      achievements.push({
        id: 'med_7_days',
        name: 'Weekly Warrior',
        icon: 'medical',
        color: '#9C27B0'
      });
    }

    if (streak.type === StreakType.STEPS && streak.count === 3) {
      achievements.push({
        id: 'steps_3_days',
        name: 'Stepping Up',
        icon: 'walk',
        color: '#4CAF50'
      });
    }

    for (const ach of achievements) {
      const existing = await this.achievementRepository.findOne({
        where: { userId, achievementId: ach.id }
      });

      if (!existing) {
        await this.achievementRepository.save(this.achievementRepository.create({
          userId,
          achievementId: ach.id,
          name: ach.name,
          icon: ach.icon,
          color: ach.color
        }));
      }
    }
  }

  async getDailyMetrics(userId: string, date: Date = new Date()): Promise<DailyHealthMetric> {
    const profile = await this.getProfile(userId);
    const queryDate = new Date(date);
    queryDate.setHours(0, 0, 0, 0);

    const metric = await this.healthMetricRepository.findOne({
      where: {
        userProfileId: profile.id,
        date: queryDate,
      },
    });

    if (!metric) {
      // Return empty/default metrics if none exist for today
      return {
        steps: 0,
        heartRate: 72, // Default average
        sleepHours: 0,
        waterIntake: 0,
        userProfileId: profile.id,
        date: queryDate,
      } as DailyHealthMetric;
    }

    return metric;
  }

  // Appointment Management
  async createAppointment(userId: string, createDto: CreateAppointmentDto): Promise<Appointment> {
    const profile = await this.getProfile(userId);

    const scheduledAtStr = createDto.scheduledAt || createDto.dateTime;
    if (!scheduledAtStr) {
      throw new BadRequestException('Appointment date and time (scheduledAt or dateTime) is required');
    }

    const appointment = this.appointmentRepository.create({
      userProfileId: profile.id,
      ...createDto,
      title: createDto.title || createDto.specialty || `Appointment with ${createDto.doctorName || 'Doctor'}`,
      scheduledAt: new Date(scheduledAtStr),
      notes: createDto.notes || createDto.specialty,
    });

    return this.appointmentRepository.save(appointment);
  }

  async getAppointments(userId: string): Promise<Appointment[]> {
    const profile = await this.getProfile(userId);

    return this.appointmentRepository.find({
      where: { userProfileId: profile.id },
      order: { scheduledAt: 'ASC' },
    });
  }

  async getAppointment(userId: string, appointmentId: string): Promise<Appointment> {
    const profile = await this.getProfile(userId);

    const appointment = await this.appointmentRepository.findOne({
      where: { id: appointmentId, userProfileId: profile.id },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async updateAppointment(
    userId: string,
    appointmentId: string,
    updateDto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    const appointment = await this.getAppointment(userId, appointmentId);

    const scheduledAtStr = updateDto.scheduledAt || updateDto.dateTime;

    Object.assign(appointment, {
      ...updateDto,
      scheduledAt: scheduledAtStr ? new Date(scheduledAtStr) : appointment.scheduledAt,
      notes: updateDto.notes || updateDto.specialty || appointment.notes,
    });

    return this.appointmentRepository.save(appointment);
  }

  async deleteAppointment(userId: string, appointmentId: string): Promise<void> {
    const appointment = await this.getAppointment(userId, appointmentId);
    await this.appointmentRepository.remove(appointment);
  }

  // Social Event Management
  async createSocialEvent(userId: string, data: any): Promise<SocialEvent> {
    const profile = await this.getProfile(userId);

    // Support flexible mapping for voice assistants or external webhooks
    const title = data.title || data.name || "New Event";
    const description = data.description || data.notes || "No description provided.";
    const location = data.location || "Community Center";
    const category = data.type || data.category || "social";

    // Parse date and time from various formats
    let scheduledAt: Date;
    if (data.scheduledAt) {
      scheduledAt = new Date(data.scheduledAt);
    } else if (data.date) {
      const timeStr = data.time || "10:00 AM";
      scheduledAt = new Date(`${data.date} ${timeStr}`);
    } else {
      scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 1); // Default to tomorrow
    }

    // fallback if parsing failed
    if (isNaN(scheduledAt.getTime())) {
      scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    const event = this.socialEventRepository.create({
      hostId: profile.id,
      title,
      description,
      location,
      scheduledAt,
      category,
    });

    return this.socialEventRepository.save(event);
  }

  async getSocialEvents(): Promise<SocialEvent[]> {
    return this.socialEventRepository.find({
      where: {
        scheduledAt: MoreThanOrEqual(new Date()),
      },
      order: { scheduledAt: 'ASC' },
      relations: ['host', 'attendees'],
    });
  }

  async joinSocialEvent(userId: string, eventId: string): Promise<SocialEvent> {
    const profile = await this.getProfile(userId);
    const event = await this.socialEventRepository.findOne({
      where: { id: eventId },
      relations: ['attendees'],
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!event.attendees) {
      event.attendees = [];
    }

    const alreadyJoined = event.attendees.some(a => a.id === profile.id);
    if (!alreadyJoined) {
      event.attendees.push(profile);
    }

    return this.socialEventRepository.save(event);
  }
}
