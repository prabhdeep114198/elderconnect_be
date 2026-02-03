import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSustainability } from './entities/user-sustainability.entity';

// Carbon impact constants (kg CO2 equivalent)
const KG_CO2_PER_DIGITAL_REPORT = 0.05; // Paper production + printing avoided
const KG_CO2_PER_TELEMEDICINE_TRIP = 4.0; // Avg car trip to clinic avoided (~10 mi round trip)
const SHEETS_PER_REPORT = 3; // Avg pages per health report

@Injectable()
export class SustainabilityService {
  constructor(
    @InjectRepository(UserSustainability, 'profile')
    private readonly sustainabilityRepo: Repository<UserSustainability>,
  ) {}

  private getYear() {
    return new Date().getFullYear();
  }

  async getOrCreateUserMetrics(userId: string, year?: number) {
    const y = year ?? this.getYear();
    let metrics = await this.sustainabilityRepo.findOne({
      where: { userId, year: y },
    });
    if (!metrics) {
      metrics = this.sustainabilityRepo.create({ userId, year: y });
      metrics = await this.sustainabilityRepo.save(metrics);
    }
    return metrics;
  }

  async trackReport(userId: string, count = 1): Promise<UserSustainability> {
    const metrics = await this.getOrCreateUserMetrics(userId);
    metrics.reportsGenerated += count;
    return this.sustainabilityRepo.save(metrics);
  }

  async trackTelemedicine(userId: string, count = 1): Promise<UserSustainability> {
    const metrics = await this.getOrCreateUserMetrics(userId);
    metrics.telemedicineSessions += count;
    return this.sustainabilityRepo.save(metrics);
  }

  async getUserImpact(userId: string, year?: number) {
    const metrics = await this.getOrCreateUserMetrics(userId, year);

    const carbonFromReports =
      metrics.reportsGenerated * KG_CO2_PER_DIGITAL_REPORT;
    const carbonFromTelemedicine =
      metrics.telemedicineSessions * KG_CO2_PER_TELEMEDICINE_TRIP;
    const totalCarbonKg =
      carbonFromReports + carbonFromTelemedicine;

    const paperSavedSheets = metrics.reportsGenerated * SHEETS_PER_REPORT;

    return {
      reportsGenerated: metrics.reportsGenerated,
      telemedicineSessions: metrics.telemedicineSessions,
      paperSavedSheets,
      carbonSavedKg: Math.round(totalCarbonKg * 100) / 100,
      tripsAvoided: metrics.telemedicineSessions,
      year: metrics.year,
    };
  }

  async getPublicImpact(year?: number) {
    const y = year ?? this.getYear();
    const results = await this.sustainabilityRepo.find({ where: { year: y } });

    const totalReports = results.reduce((s, r) => s + r.reportsGenerated, 0);
    const totalTelemedicine = results.reduce(
      (s, r) => s + r.telemedicineSessions,
      0,
    );

    return {
      year: y,
      totalReportsGenerated: totalReports,
      totalTelemedicineSessions: totalTelemedicine,
      totalPaperSavedSheets: totalReports * SHEETS_PER_REPORT,
      totalCarbonSavedKg:
        Math.round(
          (totalReports * KG_CO2_PER_DIGITAL_REPORT +
            totalTelemedicine * KG_CO2_PER_TELEMEDICINE_TRIP) *
            100,
        ) / 100,
      totalTripsAvoided: totalTelemedicine,
      activeUsers: results.length,
    };
  }
}
