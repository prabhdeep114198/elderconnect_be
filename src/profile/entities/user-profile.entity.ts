import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { Medication } from './medication.entity';

@Entity('user_profiles')
@Index(['userId'], { unique: true })
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  caregiverId: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ type: 'varchar', length: 10, nullable: true })
  gender: string;

  @Column({ type: 'float', nullable: true })
  height: number; // in cm

  @Column({ type: 'float', nullable: true })
  weight: number; // in kg

  @Column({ type: 'varchar', length: 20, nullable: true })
  bloodType: string;

  @Column({ type: 'text', array: true, default: [] })
  allergies: string[];

  @Column({ type: 'text', array: true, default: [] })
  medicalConditions: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  primaryPhysician: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  primaryPhysicianPhone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emergencyContactName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  emergencyContactPhone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  emergencyContactRelation: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  zipCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  timezone: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  language: string;

  @Column({ type: 'jsonb', nullable: true })
  healthGoals: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  preferences: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  insuranceInfo: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Medication, medication => medication.userProfile)
  medications: Medication[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get age(): number | null {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  get bmi(): number | null {
    if (!this.height || !this.weight) return null;
    const heightInMeters = this.height / 100;
    return parseFloat((this.weight / (heightInMeters * heightInMeters)).toFixed(1));
  }
}
