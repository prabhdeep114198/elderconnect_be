import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('vitals')
@Index(['userId', 'recordedAt'])
@Index(['vitalType', 'recordedAt'])
export class Vitals {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  vitalType: string; // blood_pressure, heart_rate, temperature, weight, blood_sugar, oxygen_saturation

  @Column({ type: 'jsonb' })
  reading: Record<string, any>; // Flexible structure for different vital types

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit: string;

  @Column({ type: 'timestamp' })
  @Index()
  recordedAt: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  recordedBy: string; // device, manual, caregiver

  @Column({ type: 'uuid', nullable: true })
  deviceId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  context: string; // resting, exercise, post_meal, etc.

  @Column({ type: 'jsonb', nullable: true })
  symptoms: string[]; // Associated symptoms

  @Column({ type: 'boolean', default: false })
  isAbnormal: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  severity: string; // normal, mild, moderate, severe

  @Column({ type: 'boolean', default: false })
  requiresAttention: boolean;

  @Column({ type: 'jsonb', nullable: true })
  trends: Record<string, any>; // Calculated trends and patterns

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods for different vital types
  get bloodPressureReading(): { systolic: number; diastolic: number } | null {
    if (this.vitalType === 'blood_pressure' && this.reading) {
      return {
        systolic: this.reading.systolic || 0,
        diastolic: this.reading.diastolic || 0,
      };
    }
    return null;
  }

  get heartRate(): number | null {
    if (this.vitalType === 'heart_rate' && this.reading) {
      return this.reading.bpm || null;
    }
    return null;
  }

  get temperature(): number | null {
    if (this.vitalType === 'temperature' && this.reading) {
      return this.reading.celsius || this.reading.fahrenheit || null;
    }
    return null;
  }

  get weight(): number | null {
    if (this.vitalType === 'weight' && this.reading) {
      return this.reading.kg || this.reading.lbs || null;
    }
    return null;
  }

  get bloodSugar(): number | null {
    if (this.vitalType === 'blood_sugar' && this.reading) {
      return this.reading.mgdl || this.reading.mmol || null;
    }
    return null;
  }

  get oxygenSaturation(): number | null {
    if (this.vitalType === 'oxygen_saturation' && this.reading) {
      return this.reading.percentage || null;
    }
    return null;
  }

  isWithinNormalRange(): boolean {
    switch (this.vitalType) {
      case 'blood_pressure':
        const bp = this.bloodPressureReading;
        return bp ? (bp.systolic >= 90 && bp.systolic <= 140 && bp.diastolic >= 60 && bp.diastolic <= 90) : false;
      
      case 'heart_rate':
        const hr = this.heartRate;
        return hr ? (hr >= 60 && hr <= 100) : false;
      
      case 'temperature':
        const temp = this.temperature;
        return temp ? (temp >= 36.1 && temp <= 37.2) : false;
      
      case 'oxygen_saturation':
        const o2 = this.oxygenSaturation;
        return o2 ? (o2 >= 95 && o2 <= 100) : false;
      
      default:
        return !this.isAbnormal;
    }
  }
}
