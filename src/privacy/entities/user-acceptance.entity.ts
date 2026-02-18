import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { PrivacyPolicy } from './privacy-policy.entity';
import { TermsConditions } from './terms-conditions.entity';

@Entity('user_policy_acceptance')
export class UserPolicyAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  policyId: string;

  @ManyToOne(() => PrivacyPolicy)
  @JoinColumn({ name: 'policyId' })
  policy: PrivacyPolicy;

  @CreateDateColumn()
  acceptedAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;
}

@Entity('user_terms_acceptance')
export class UserTermsAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  termsId: string;

  @ManyToOne(() => TermsConditions)
  @JoinColumn({ name: 'termsId' })
  terms: TermsConditions;

  @CreateDateColumn()
  acceptedAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;
}