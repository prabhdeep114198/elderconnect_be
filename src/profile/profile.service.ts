import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CacheService } from '../common/services/cache.service';
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
import { User } from '../auth/entities/user.entity';
import { UserRole } from '../common/enums/user-role.enum';

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
    @InjectRepository(User, 'auth')
    private readonly userRepository: Repository<User>,
    private readonly cacheService: CacheService,
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

  async getProfileList(): Promise<UserProfile[]> {
    return this.profileRepository.find();
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<UserProfile> {
    const profile = await this.getProfile(userId);

    if (updateProfileDto.avatar || updateProfileDto.name || updateProfileDto.isOnboarded !== undefined) {
      const userUpdate: any = {};
      if (updateProfileDto.avatar) userUpdate.avatar = updateProfileDto.avatar;
      if (updateProfileDto.isOnboarded !== undefined) userUpdate.isOnboarded = updateProfileDto.isOnboarded;

      if (updateProfileDto.name) {
        const parts = updateProfileDto.name.split(' ');
        userUpdate.firstName = parts[0];
        userUpdate.lastName = parts.slice(1).join(' ') || '';
      }

      await this.userRepository.update(userId, userUpdate);
    }

    Object.assign(profile, {
      ...updateProfileDto,
      height: updateProfileDto.height ?? updateProfileDto.heightCm ?? profile.height,
      weight: updateProfileDto.weight ?? updateProfileDto.weightKg ?? profile.weight,
      dateOfBirth: updateProfileDto.dateOfBirth ? new Date(updateProfileDto.dateOfBirth) : profile.dateOfBirth,
    });

    const savedProfile = await this.profileRepository.save(profile);

    // Invalidate user cache to ensure session refreshes correctly
    await this.cacheService.invalidateUserCache(userId);

    return savedProfile;
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
  async getMedicationCompliance(userId: string, days: number = 7): Promise<any> {
    const profile = await this.getProfile(userId);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1); // Go back days-1 to include today as 7th day? Or just last 7 days.

    // Normalize time
    endDate.setHours(23, 59, 59, 999);
    startDate.setHours(0, 0, 0, 0);

    // Get all meds to calculate "Expected"
    const medications = await this.medicationRepository.find({
      where: { userProfileId: profile.id }
    });

    // Get actual logs
    const logs = await this.medicationLogRepository
      .createQueryBuilder('log')
      .innerJoin('log.medication', 'medication')
      .where('medication.userProfileId = :profileId', { profileId: profile.id })
      .andWhere('log.scheduledTime BETWEEN :startDate AND :endDate', { startDate: startDate.toISOString(), endDate: endDate.toISOString() })
      .getMany();

    // Helper to count scheduled doses for a pill (simple version)
    // Assumes schedule is array of times like ["08:00", "20:00"]
    const getDailyDoseCount = (med: Medication) => {
      if (Array.isArray(med.schedule)) return med.schedule.length;
      if (typeof med.schedule === 'object' && med.schedule !== null) return Object.keys(med.schedule).length;
      return 1;
    };

    const dailyStats: { date: string; expected: number; taken: number; compliance: number }[] = [];
    const dateIterator = new Date(startDate);

    // Arrays for weekly chart (Mon-Sun or Last 7 days)
    // Frontend expects 7 items, likely corresponding to "Mon, Tue..." labels or "Last 7 days" 
    // The frontend labels are static `weekDays` ['Mon', ...]. 
    // Ideally we should match the days. 
    // But simplest is returning last 7 days data. 
    // Let's assume frontend maps them correctly or we assume 7 days ending today.

    while (dateIterator <= endDate) {
      const dayStr = dateIterator.toISOString().split('T')[0];

      // 1. Calculate Expected for this day
      // Filter meds active on this day
      const activeMeds = medications.filter(m => {
        const start = new Date(m.startDate).getTime();
        const end = m.endDate ? new Date(m.endDate).getTime() : new Date('9999-12-31').getTime();
        const current = dateIterator.getTime();
        return (current + 86400000) >= start && (current - 86400000) <= end;
      });

      const expected = activeMeds.reduce((acc, med) => acc + getDailyDoseCount(med), 0);

      // 2. Calculate Actual Taken
      const dayLogs = logs.filter(l => {
        const lDate = new Date(l.scheduledTime).toISOString().split('T')[0];
        return lDate === dayStr;
      });

      const taken = dayLogs.filter(l => l.status === MedicationLogStatus.TAKEN).length;

      // 3. Compliance
      const compliance = expected > 0 ? Math.round((taken / expected) * 100) : 0;

      dailyStats.push({ date: dayStr, expected, taken, compliance });
      dateIterator.setDate(dateIterator.getDate() + 1);
    }

    // "Today" stats (last entry in dailyStats)
    const todayStat = dailyStats[dailyStats.length - 1] || { expected: 0, taken: 0, compliance: 0 };

    // Explicitly calculate Missed for today (Expected - Taken)
    // Note: Future doses are not "missed" strictly, but for simplicity:
    const missedToday = Math.max(0, todayStat.expected - todayStat.taken);
    // Or if we want strictly passed time... 
    // Let's stick to "Expected - Taken" which implies "Remaining + Missed".
    // Frontend label says "Missed". If user sees "Missed: 2" at 8AM but has 2 doses at 8PM, might be confusing.
    // Enhanced Logic: Check if scheduled time < now.
    // For now, let's just use (Expected - Taken) - (Pending).
    // Let's just return raw numbers and let frontend interpret or keep simple.
    // "Missed" in `stats` usually means "Log status is MISSED".
    // If we rely on logs, we check `logs` for today with status MISSED.
    const currentDateStr = endDate.toISOString().split('T')[0];
    const logsToday = logs.filter(l => new Date(l.scheduledTime).toISOString().split('T')[0] === currentDateStr);
    const explicitlyMissed = logsToday.filter(l => l.status === MedicationLogStatus.MISSED).length;

    const totalExpected = dailyStats.reduce((acc, d) => acc + d.expected, 0);
    const totalTaken = dailyStats.reduce((acc, d) => acc + d.taken, 0);
    const complianceRate = totalExpected > 0 ? Math.round((totalTaken / totalExpected) * 100) : 0;

    // Calculate on-time rate
    const onTimeLogs = logs.filter(l => {
      if (!l.actualTime || l.status !== MedicationLogStatus.TAKEN) return false;
      const sched = new Date(l.scheduledTime).getTime();
      const act = new Date(l.actualTime).getTime();
      return Math.abs(act - sched) <= 30 * 60 * 1000; // 30 mins
    });
    const onTimeRate = totalTaken > 0 ? Math.round((onTimeLogs.length / totalTaken) * 100) : 0;

    return {
      daily: dailyStats.map(d => d.compliance), // Array of numbers for checking [0, 100, 50...]
      takenToday: todayStat.taken,
      totalToday: todayStat.expected,
      missedToday: explicitlyMissed, // Only count explicitly logged misses to avoid confusion
      overallCompliance: todayStat.compliance, // Today's compliance
      complianceRate,
      onTimeRate,
      todayLogs: logsToday
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
        oxygenSaturation: 0,
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
      case 'oxygenSaturation':
        metric.oxygenSaturation = updateDto.value;
        break;
    }

    try {
      return await this.healthMetricRepository.save(metric);
    } catch (error) {
      if (error.code === '23505' || error.message?.includes('unique constraint')) {
        // Race condition: another request created the record for this day just now.
        // Fetch the existing record and update it instead.
        const existing = await this.healthMetricRepository.findOne({
          where: { userProfileId: profile.id, date: date },
        });
        if (existing) {
          switch (updateDto.type) {
            case 'steps': existing.steps = updateDto.value; break;
            case 'heartRate': existing.heartRate = updateDto.value; break;
            case 'sleep': existing.sleepHours = updateDto.value; break;
            case 'water': existing.waterIntake = updateDto.value; break;
            case 'oxygenSaturation': existing.oxygenSaturation = updateDto.value; break;
          }
          return await this.healthMetricRepository.save(existing);
        }
      }
      throw error;
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
        oxygenSaturation: 98, // Default healthy level
        userProfileId: profile.id,
        date: queryDate,
      } as DailyHealthMetric;
    }

    return metric;
  }

  async getMetricsRange(userId: string, startDate: Date, endDate: Date): Promise<DailyHealthMetric[]> {
    const profile = await this.getProfile(userId);

    // Normalize dates to start of day
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const metrics = await this.healthMetricRepository.find({
      where: {
        userProfileId: profile.id,
        date: Between(start, end),
      },
      order: {
        date: 'ASC',
      },
    });

    // Fill in missing days with zero values
    const result: DailyHealthMetric[] = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const existingMetric = metrics.find(m => {
        const metricDateStr = new Date(m.date).toISOString().split('T')[0];
        return metricDateStr === dateStr;
      });

      if (existingMetric) {
        result.push(existingMetric);
      } else {
        // Create placeholder for missing day
        result.push({
          steps: 0,
          heartRate: 0,
          sleepHours: 0,
          waterIntake: 0,
          oxygenSaturation: 0,
          userProfileId: profile.id,
          date: new Date(currentDate),
        } as DailyHealthMetric);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
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

    const event = this.socialEventRepository.create({
      hostId: profile.id,
      title: data.title,
      description: data.description,
      location: data.location,
      scheduledAt: new Date(data.scheduledAt),
      category: data.category || 'social',
    });

    return this.socialEventRepository.save(event);
  }

  async getSocialEvents(): Promise<SocialEvent[]> {
    return this.socialEventRepository.find({
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

  // Seed sample health data for testing
  async seedHealthData(userId: string, days: number = 7): Promise<any> {
    const profile = await this.getProfile(userId);
    const results: DailyHealthMetric[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      // Generate realistic random values
      const steps = Math.floor(Math.random() * 5000) + 3000; // 3000-8000
      const heartRate = Math.floor(Math.random() * 20) + 65; // 65-85
      const sleepHours = Math.random() * 2 + 6; // 6-8 hours
      const waterIntake = Math.floor(Math.random() * 4) + 4; // 4-8 glasses

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
          steps,
          heartRate,
          sleepHours,
          waterIntake,
          oxygenSaturation: Math.floor(Math.random() * 5) + 95, // 95-100
        });
      } else {
        metric.steps = steps;
        metric.heartRate = heartRate;
        metric.sleepHours = sleepHours;
        metric.waterIntake = waterIntake;
        metric.oxygenSaturation = Math.floor(Math.random() * 5) + 95; // 95-100
      }

      const saved = await this.healthMetricRepository.save(metric);
      results.push(saved);
    }

    return {
      message: `Seeded ${days} days of health data`,
      data: results,
    };
  }

  async getStreaks(userId: string): Promise<any> {
    const profile = await this.getProfile(userId);

    // Calculate Medication Streak
    const medLogs = await this.medicationLogRepository
      .createQueryBuilder('log')
      .innerJoin('log.medication', 'medication')
      .where('medication.userProfileId = :profileId', { profileId: profile.id })
      .orderBy('log.scheduledTime', 'DESC')
      .getMany();

    // Group logs by date
    const logsByDate: { [date: string]: MedicationLog[] } = {};
    medLogs.forEach(log => {
      const date = new Date(log.scheduledTime).toISOString().split('T')[0];
      if (!logsByDate[date]) logsByDate[date] = [];
      logsByDate[date].push(log);
    });

    let medicationStreak = 0;
    const today = new Date().toISOString().split('T')[0];

    // Check if user has logs for today or yesterday to continue streak
    let currentCheckDate = new Date();
    if (!logsByDate[today]) {
      currentCheckDate.setDate(currentCheckDate.getDate() - 1);
    }

    // Maximum 100 days check
    for (let i = 0; i < 100; i++) {
      const checkDateStr = currentCheckDate.toISOString().split('T')[0];
      const dayLogs = logsByDate[checkDateStr];

      if (!dayLogs || dayLogs.length === 0) break;

      const allTaken = dayLogs.every(l => l.status === MedicationLogStatus.TAKEN);
      if (allTaken) {
        medicationStreak++;
        currentCheckDate.setDate(currentCheckDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Calculate Active Streak (Steps >= 5000)
    const metrics = await this.healthMetricRepository.find({
      where: { userProfileId: profile.id },
      order: { date: 'DESC' },
    });

    let activeStreak = 0;
    let metricCheckDate = new Date();
    const todayMetric = metrics.find(m => new Date(m.date).toISOString().split('T')[0] === today);
    if (!todayMetric || todayMetric.steps < 5000) {
      metricCheckDate.setDate(metricCheckDate.getDate() - 1);
    }

    for (const m of metrics) {
      const mDate = new Date(m.date).toISOString().split('T')[0];
      const checkDateStr = metricCheckDate.toISOString().split('T')[0];

      if (mDate === checkDateStr) {
        if (m.steps >= 5000) {
          activeStreak++;
          metricCheckDate.setDate(metricCheckDate.getDate() - 1);
        } else {
          break;
        }
      } else if (mDate < checkDateStr) {
        break; // Gap in data
      }
    }

    return {
      medication: medicationStreak,
      steps: activeStreak,
      health: Math.min(medicationStreak, activeStreak),
    };
  }

  async getAchievements(userId: string): Promise<any> {
    const profile = await this.getProfile(userId);
    const metrics = await this.healthMetricRepository.find({
      where: { userProfileId: profile.id },
    });

    const totalSteps = metrics.reduce((acc, m) => acc + (m.steps || 0), 0);
    const avgSleep = metrics.length > 0 ? metrics.reduce((acc, m) => acc + (m.sleepHours || 0), 0) / metrics.length : 0;
    const maxWater = metrics.length > 0 ? Math.max(...metrics.map(m => m.waterIntake || 0)) : 0;

    const achievements: any[] = [];

    if (totalSteps > 100000) {
      achievements.push({
        id: 'steps_100k',
        name: 'Centurion Walker',
        description: 'Walked over 100,000 steps total!',
        icon: 'walk',
        color: '#4CAF50',
        date: new Date(),
      });
    } else if (totalSteps > 50000) {
      achievements.push({
        id: 'steps_50k',
        name: 'Half-Centurion',
        description: 'Walked over 50,000 steps total!',
        icon: 'walk',
        color: '#8BC34A',
        date: new Date(),
      });
    }

    if (avgSleep >= 7 && avgSleep <= 9 && metrics.length >= 7) {
      achievements.push({
        id: 'sleep_pro',
        name: 'Sleep Master',
        description: 'Maintained perfect sleep for a week.',
        icon: 'moon',
        color: '#9C27B0',
        date: new Date(),
      });
    }

    if (maxWater >= 8) {
      achievements.push({
        id: 'hydration_hero',
        name: 'Hydration Hero',
        description: 'Reached 8+ cups of water in a single day!',
        icon: 'heart',
        color: '#2196F3',
        date: new Date(),
      });
    }

    if (achievements.length === 0) {
      achievements.push({
        id: 'welcome',
        name: 'Healthy Start',
        description: 'Joined ElderConnect and started your health journey.',
        icon: 'heart',
        color: '#E91E63',
        date: profile.createdAt || new Date(),
      });
    }

    return {
      achievements
    };
  }

  // Caregiver Features
  async getMonitoredElders(caregiverId: string): Promise<any[]> {
    const profiles = await this.profileRepository.find({
      where: { caregiverId },
    });

    if (profiles.length === 0) return [];

    const elderUserIds = profiles.map(p => p.userId);
    const users = await this.userRepository.findByIds(elderUserIds);

    // Fetch today's metrics for all elders
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results: any[] = [];
    for (const profile of profiles) {
      const user = users.find(u => u.id === profile.userId);
      if (!user) continue;

      const dailyMetric = await this.healthMetricRepository.findOne({
        where: { userProfileId: profile.id, date: today },
      });

      // Calculate status
      let status = 'good';
      let statusIndicator = 'Safe';
      
      if (dailyMetric) {
        if (dailyMetric.heartRate && (dailyMetric.heartRate > 100 || dailyMetric.heartRate < 50)) {
          status = 'critical';
          statusIndicator = 'Critical';
        } else if (dailyMetric.heartRate && (dailyMetric.heartRate > 90 || dailyMetric.heartRate < 60)) {
          status = 'warning';
          statusIndicator = 'Warning';
        }
      }

      results.push({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        status: statusIndicator,
        statusType: status, // 'good', 'warning', 'critical'
        lastSeen: 'Active now',
        battery: Math.floor(Math.random() * 30) + 70, // Mock battery for demo
        risk: status === 'critical' ? 'high' : status === 'warning' ? 'medium' : 'low',
        avatar: user.avatar,
        metrics: {
          steps: dailyMetric?.steps || 0,
          heartRate: dailyMetric?.heartRate || 72,
          sleepHours: dailyMetric?.sleepHours || 0,
        }
      });
    }

    return results;
  }

  async linkElder(elderId: string, caregiverId: string): Promise<UserProfile> {
    const profile = await this.getProfile(elderId);
    profile.caregiverId = caregiverId;
    return this.profileRepository.save(profile);
  }

  async seedDemoData(): Promise<any> {
    const caregiverEmail = 'family@elderconnect.com';
    const elderEmails = [
      'martha@demo.com',
      'george@demo.com',
      'helen@demo.com'
    ];
    const password = 'password123';

    // 1. Create or Find Caregiver
    let caregiver = await this.userRepository.findOne({ where: { email: caregiverEmail } });
    if (!caregiver) {
      caregiver = this.userRepository.create({
        email: caregiverEmail,
        password,
        firstName: 'Emma',
        lastName: 'Caregiver',
        roles: [UserRole.CAREGIVER],
        isOnboarded: true,
        isActive: true
      });
      await this.userRepository.save(caregiver);
      await this.createProfile(caregiver.id, {
        name: 'Emma Caregiver',
        phoneNumber: '1234567890'
      } as any);
    }

    const demoData: any[] = [];

    // 2. Create Elders and Link them
    const names = ['Martha Stewart', 'George Miller', 'Helen Keller'];
    const bios = [
      'Enjoys gardening and morning walks.',
      'Retired engineer, loves solving puzzles.',
      'An avid reader and music lover.'
    ];

    for (let i = 0; i < elderEmails.length; i++) {
      let elder = await this.userRepository.findOne({ where: { email: elderEmails[i] } });
      if (!elder) {
        elder = this.userRepository.create({
          email: elderEmails[i],
          password,
          firstName: names[i].split(' ')[0],
          lastName: names[i].split(' ')[1],
          roles: [UserRole.ELDER],
          isOnboarded: true,
          isActive: true
        });
        await this.userRepository.save(elder);
        const birthDate = new Date();
        birthDate.setFullYear(birthDate.getFullYear() - (70 + Math.floor(Math.random() * 20))); // 70-90 years old
        await this.createProfile(elder.id, {
          name: names[i],
          phoneNumber: `987654321${i}`,
          notes: bios[i],
          dateOfBirth: birthDate
        } as any);
      }

      // Link to caregiver
      await this.linkElder(elder.id, caregiver.id);

      // Seed health data
      await this.seedHealthData(elder.id, 14);

      // Seed some medications
      const medNames = ['Aspirin', 'Lisinopril', 'Metformin'];
      await this.createMedication(elder.id, {
        name: medNames[i],
        dosage: '10mg',
        frequency: 'daily',
        time: '08:00',
        startDate: new Date().toISOString(),
        reminderEnabled: true,
        reminderMinutesBefore: 15
      } as any);

      demoData.push({ email: elderEmails[i], name: names[i] });
    }

    return {
      message: 'Demo data seeded successfully',
      credentials: {
        caregiver: { email: caregiverEmail, password },
        elders: demoData.map(d => ({ ...d, password }))
      }
    };
  }
}
