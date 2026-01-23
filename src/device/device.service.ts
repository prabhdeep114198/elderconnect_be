import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';
import { TelemetryData } from './entities/telemetry.entity';
import { Vitals } from './entities/vitals.entity';
import { SOSAlert, SOSStatus, SOSType } from './entities/sos-alert.entity';
import { CreateTelemetryDto, BulkTelemetryDto, CreateVitalsDto, CreateSOSDto, UpdateSOSDto } from './dto/telemetry.dto';
import { KafkaService } from './services/kafka.service';
import { AlertPriority } from '../common/enums/user-role.enum';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(TelemetryData, 'vitals')
    private readonly telemetryRepository: Repository<TelemetryData>,
    @InjectRepository(Vitals, 'vitals')
    private readonly vitalsRepository: Repository<Vitals>,
    @InjectRepository(SOSAlert, 'vitals')
    private readonly sosAlertRepository: Repository<SOSAlert>,
    private readonly kafkaService: KafkaService,
  ) { }

  // Telemetry Management
  async createTelemetry(
    deviceId: string,
    userId: string,
    createTelemetryDto: CreateTelemetryDto,
  ): Promise<TelemetryData> {
    // Handle flat payload if metricType or value is missing
    const metricType = createTelemetryDto.metricType || 'multi_metric';
    const value = createTelemetryDto.value || { ...createTelemetryDto };

    // Remove known DTO fields from value if it's a flat payload
    if (!createTelemetryDto.metricType || !createTelemetryDto.value) {
      delete (value as any).metricType;
      delete (value as any).value;
      delete (value as any).timestamp;
      delete (value as any).unit;
      delete (value as any).latitude;
      delete (value as any).longitude;
      delete (value as any).location;
      delete (value as any).metadata;
      delete (value as any).quality;
      delete (value as any).confidenceScore;
    }

    const timestamp = createTelemetryDto.timestamp
      ? new Date(createTelemetryDto.timestamp)
      : new Date();

    const telemetry = this.telemetryRepository.create({
      deviceId,
      userId,
      ...createTelemetryDto,
      metricType,
      value,
      timestamp,
    });

    const savedTelemetry = await this.telemetryRepository.save(telemetry);

    // Publish to Kafka for real-time processing
    await this.kafkaService.publishTelemetry({
      userId,
      deviceId,
      metricType: telemetry.metricType,
      value: telemetry.value,
      timestamp: savedTelemetry.timestamp,
      metadata: telemetry.metadata,
    });

    return savedTelemetry;
  }

  async createBulkTelemetry(
    deviceId: string,
    userId: string,
    bulkTelemetryDto: BulkTelemetryDto,
  ): Promise<TelemetryData[]> {
    const telemetryData = bulkTelemetryDto.readings.map(reading => {
      const timestamp = reading.timestamp ? new Date(reading.timestamp) : new Date();
      return this.telemetryRepository.create({
        deviceId,
        userId,
        ...reading,
        timestamp,
      });
    });

    const savedTelemetry = await this.telemetryRepository.save(telemetryData);

    // Publish each reading to Kafka
    for (const telemetry of savedTelemetry) {
      await this.kafkaService.publishTelemetry({
        userId,
        deviceId,
        metricType: telemetry.metricType,
        value: telemetry.value,
        timestamp: telemetry.timestamp,
        metadata: telemetry.metadata,
      });
    }

    return savedTelemetry;
  }

  async getTelemetry(
    userId: string,
    deviceId?: string,
    metricType?: string,
    startDate?: string,
    endDate?: string,
    limit: number = 100,
  ): Promise<TelemetryData[]> {
    const whereCondition: any = { userId };

    if (deviceId) {
      whereCondition.deviceId = deviceId;
    }

    if (metricType) {
      whereCondition.metricType = metricType;
    }

    if (startDate && endDate) {
      whereCondition.timestamp = Between(new Date(startDate), new Date(endDate));
    }

    return this.telemetryRepository.find({
      where: whereCondition,
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async getLatestTelemetry(userId: string, metricType: string): Promise<TelemetryData | null> {
    return this.telemetryRepository.findOne({
      where: { userId, metricType },
      order: { timestamp: 'DESC' },
    });
  }

  // Vitals Management
  async createVitals(userId: string, createVitalsDto: CreateVitalsDto): Promise<Vitals> {
    const vitalType = createVitalsDto.vitalType || createVitalsDto.type || 'unknown';
    let reading = createVitalsDto.reading || createVitalsDto.value || {};

    // If reading is a string (e.g. "125/85"), handle it
    if (typeof reading === 'string' && vitalType === 'blood_pressure') {
      const parts = reading.split('/');
      reading = {
        systolic: parseInt(parts[0]),
        diastolic: parseInt(parts[1]),
      };
    }

    const recordedAt = createVitalsDto.recordedAt
      ? new Date(createVitalsDto.recordedAt)
      : new Date();

    const vitals = this.vitalsRepository.create({
      userId,
      ...createVitalsDto,
      vitalType,
      reading,
      recordedAt,
    });

    // Determine if reading is abnormal
    vitals.isAbnormal = !vitals.isWithinNormalRange();
    vitals.requiresAttention = vitals.isAbnormal;

    const savedVitals = await this.vitalsRepository.save(vitals);

    // Publish to Kafka
    await this.kafkaService.publishVitals(userId, {
      vitalType: vitals.vitalType,
      reading: vitals.reading,
      isAbnormal: vitals.isAbnormal,
      recordedAt: vitals.recordedAt,
    });

    // Create alert if abnormal and requires attention
    if (vitals.requiresAttention) {
      await this.createSOSAlert(userId, {
        type: `${vitals.vitalType}_anomaly` as any,
        description: `Abnormal ${vitals.vitalType} reading detected`,
        priority: vitals.severity === 'severe' ? 'critical' : 'high',
        contextData: {
          vitalId: savedVitals.id,
          reading: vitals.reading,
          vitalType: vitals.vitalType,
        },
      });
    }

    return savedVitals;
  }

  async getVitals(
    userId: string,
    vitalType?: string,
    startDate?: string,
    endDate?: string,
    limit: number = 100,
  ): Promise<Vitals[]> {
    const whereCondition: any = { userId };

    if (vitalType) {
      whereCondition.vitalType = vitalType;
    }

    if (startDate && endDate) {
      whereCondition.recordedAt = Between(new Date(startDate), new Date(endDate));
    }

    return this.vitalsRepository.find({
      where: whereCondition,
      order: { recordedAt: 'DESC' },
      take: limit,
    });
  }

  async getLatestVitals(userId: string, vitalType: string): Promise<Vitals | null> {
    return this.vitalsRepository.findOne({
      where: { userId, vitalType },
      order: { recordedAt: 'DESC' },
    });
  }

  async getVitalsTrends(userId: string, vitalType: string, days: number = 30): Promise<any> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const vitals = await this.vitalsRepository.find({
      where: {
        userId,
        vitalType,
        recordedAt: Between(startDate, endDate),
      },
      order: { recordedAt: 'ASC' },
    });

    // Calculate trends and statistics
    const readings = vitals.map(v => ({
      date: v.recordedAt,
      value: this.extractNumericValue(v),
      isAbnormal: v.isAbnormal,
    })).filter(r => r.value !== null);

    if (readings.length === 0) {
      return { trend: 'no_data', readings: [] };
    }

    const values = readings.map(r => r.value);
    const cleanValues = values.filter((v): v is number => v !== null);
    const average = cleanValues.reduce((sum, val) => sum + val, 0) / values.length;
    const min = Math.min(...cleanValues);
    const max = Math.max(...cleanValues);

    // Simple trend calculation
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const cleanFirst = firstHalf.filter((v): v is number => v !== null);
    const firstAvg = cleanFirst.reduce((sum, val) => sum + val, 0) / cleanFirst.length;
    const cleanSecond = secondHalf.filter((v): v is number => v !== null);
    const secondAvg = cleanSecond.reduce((sum, val) => sum + val, 0) / cleanSecond.length;


    let trend = 'stable';
    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (Math.abs(changePercent) > 5) {
      trend = changePercent > 0 ? 'increasing' : 'decreasing';
    }

    return {
      trend,
      changePercent: Math.round(changePercent * 100) / 100,
      statistics: { average, min, max, count: readings.length },
      readings: readings.slice(-50), // Return last 50 readings
    };
  }

  private extractNumericValue(vitals: Vitals): number | null {
    switch (vitals.vitalType) {
      case 'heart_rate':
        return vitals.heartRate;
      case 'temperature':
        return vitals.temperature;
      case 'weight':
        return vitals.weight;
      case 'blood_sugar':
        return vitals.bloodSugar;
      case 'oxygen_saturation':
        return vitals.oxygenSaturation;
      case 'blood_pressure':
        const bp = vitals.bloodPressureReading;
        return bp ? bp.systolic : null;
      default:
        return null;
    }
  }

  // SOS Alert Management
  async createSOSAlert(userId: string, createSOSDto: CreateSOSDto): Promise<SOSAlert> {
    const description = createSOSDto.description || createSOSDto.notes || 'No description provided';
    const alert = this.sosAlertRepository.create({
      userId,
      ...createSOSDto,
      description,
      type: createSOSDto.type as SOSType,
      priority: (createSOSDto.priority as AlertPriority) || AlertPriority.HIGH,
    });

    const savedAlert = await this.sosAlertRepository.save(alert);

    // Publish to Kafka for immediate processing
    await this.kafkaService.publishAlert({
      alertId: savedAlert.id,
      userId,
      deviceId: savedAlert.deviceId,
      type: savedAlert.type,
      priority: savedAlert.priority,
      description: savedAlert.description,
      location: savedAlert.latitude && savedAlert.longitude ? {
        latitude: savedAlert.latitude,
        longitude: savedAlert.longitude,
        address: savedAlert.address,
      } : undefined,
      contextData: savedAlert.contextData,
      timestamp: savedAlert.createdAt,
    });

    return savedAlert;
  }

  async createDeviceSOSAlert(deviceId: string, userId: string, createSOSDto: CreateSOSDto): Promise<SOSAlert> {
    const alert = await this.createSOSAlert(userId, createSOSDto);
    alert.deviceId = deviceId;
    return this.sosAlertRepository.save(alert);
  }

  async getSOSAlerts(
    userId: string,
    status?: SOSStatus,
    limit: number = 50,
  ): Promise<SOSAlert[]> {
    const whereCondition: any = { userId };

    if (status) {
      whereCondition.status = status;
    }

    return this.sosAlertRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getSOSAlert(userId: string, alertId: string): Promise<SOSAlert> {
    const alert = await this.sosAlertRepository.findOne({
      where: { id: alertId, userId },
    });

    if (!alert) {
      throw new NotFoundException('SOS alert not found');
    }

    return alert;
  }

  async updateSOSAlert(
    userId: string,
    alertId: string,
    updateSOSDto: UpdateSOSDto,
    updatedBy: string,
  ): Promise<SOSAlert> {
    const alert = await this.getSOSAlert(userId, alertId);

    if (updateSOSDto.status) {
      switch (updateSOSDto.status as SOSStatus) {
        case SOSStatus.ACKNOWLEDGED:
          alert.acknowledge(updatedBy);
          break;
        case SOSStatus.RESOLVED:
          alert.resolve(updatedBy, updateSOSDto.resolution || 'Resolved');
          break;
        case SOSStatus.FALSE_ALARM:
          alert.markFalseAlarm(updatedBy);
          break;
      }
    }

    if (updateSOSDto.responseActions) {
      updateSOSDto.responseActions.forEach(action => {
        alert.addResponseAction(action);
      });
    }

    return this.sosAlertRepository.save(alert);
  }

  async getActiveAlerts(userId?: string): Promise<SOSAlert[]> {
    const whereCondition: any = { status: SOSStatus.ACTIVE };

    if (userId) {
      whereCondition.userId = userId;
    }

    return this.sosAlertRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });
  }

  async getCriticalAlerts(userId?: string): Promise<SOSAlert[]> {
    const whereCondition: any = {
      status: SOSStatus.ACTIVE,
      priority: AlertPriority.CRITICAL,
    };

    if (userId) {
      whereCondition.userId = userId;
    }

    return this.sosAlertRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });
  }

  // Analytics and Reporting
  async getDeviceHealthSummary(userId: string, deviceId: string): Promise<any> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentTelemetry = await this.telemetryRepository.find({
      where: {
        userId,
        deviceId,
        timestamp: MoreThan(last24Hours),
      },
      order: { timestamp: 'DESC' },
    });

    const recentAlerts = await this.sosAlertRepository.find({
      where: {
        userId,
        deviceId,
        createdAt: MoreThan(last24Hours),
      },
    });

    const metricTypes = [...new Set(recentTelemetry.map(t => t.metricType))];
    const latestReadings = {};

    for (const metricType of metricTypes) {
      const latest = await this.getLatestTelemetry(userId, metricType);
      if (latest) {
        latestReadings[metricType] = {
          value: latest.value,
          timestamp: latest.timestamp,
          quality: latest.quality,
        };
      }
    }

    return {
      deviceId,
      lastActive: recentTelemetry[0]?.timestamp || null,
      dataPoints24h: recentTelemetry.length,
      alerts24h: recentAlerts.length,
      activeAlerts: recentAlerts.filter(a => a.status === SOSStatus.ACTIVE).length,
      latestReadings,
      healthScore: this.calculateDeviceHealthScore(recentTelemetry, recentAlerts),
    };
  }

  private calculateDeviceHealthScore(telemetry: TelemetryData[], alerts: SOSAlert[]): number {
    let score = 100;

    // Reduce score based on data quality
    const poorQualityReadings = telemetry.filter(t => t.quality === 'poor').length;
    score -= (poorQualityReadings / telemetry.length) * 30;

    // Reduce score based on alerts
    const criticalAlerts = alerts.filter(a => a.priority === AlertPriority.CRITICAL).length;
    const highAlerts = alerts.filter(a => a.priority === AlertPriority.HIGH).length;

    score -= criticalAlerts * 20;
    score -= highAlerts * 10;

    // Reduce score if no recent data
    if (telemetry.length === 0) {
      score -= 50;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
