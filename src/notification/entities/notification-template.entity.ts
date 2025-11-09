import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NotificationType, NotificationCategory } from './notification.entity';
import { AlertPriority } from '../../common/enums/user-role.enum';

@Entity('notification_templates')
@Index(['category', 'type'])
@Index(['isActive', 'category'])
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
  })
  category: NotificationCategory;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: AlertPriority,
    default: AlertPriority.MEDIUM,
  })
  defaultPriority: AlertPriority;

  @Column({ type: 'varchar', length: 255 })
  titleTemplate: string;

  @Column({ type: 'text' })
  messageTemplate: string;

  @Column({ type: 'text', array: true, default: [] })
  requiredVariables: string[]; // Variables that must be provided

  @Column({ type: 'text', array: true, default: [] })
  optionalVariables: string[]; // Variables that can be provided

  @Column({ type: 'jsonb', nullable: true })
  defaultData: Record<string, any>; // Default values for variables

  @Column({ type: 'jsonb', nullable: true })
  validationRules: Record<string, any>; // Rules for variable validation

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  language: string; // Language code (en, es, fr, etc.)

  @Column({ type: 'int', nullable: true })
  expirationHours: number; // Default expiration time

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @Column({ type: 'jsonb', nullable: true })
  deliverySettings: Record<string, any>; // Type-specific delivery settings

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  renderTitle(variables: Record<string, any>): string {
    return this.renderTemplate(this.titleTemplate, variables);
  }

  renderMessage(variables: Record<string, any>): string {
    return this.renderTemplate(this.messageTemplate, variables);
  }

  private renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;
    
    // Merge with default data
    const allVariables = { ...this.defaultData, ...variables };
    
    // Replace variables in the format {{variableName}}
    Object.entries(allVariables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, String(value || ''));
    });
    
    return rendered;
  }

  validateVariables(variables: Record<string, any>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required variables
    this.requiredVariables.forEach(variable => {
      if (!(variable in variables) || variables[variable] === null || variables[variable] === undefined) {
        errors.push(`Required variable '${variable}' is missing`);
      }
    });
    
    // Apply validation rules
    if (this.validationRules) {
      Object.entries(this.validationRules).forEach(([variable, rules]) => {
        if (variable in variables) {
          const value = variables[variable];
          const ruleSet = rules as Record<string, any>;
          
          if (ruleSet.type && typeof value !== ruleSet.type) {
            errors.push(`Variable '${variable}' must be of type ${ruleSet.type}`);
          }
          
          if (ruleSet.minLength && String(value).length < ruleSet.minLength) {
            errors.push(`Variable '${variable}' must be at least ${ruleSet.minLength} characters`);
          }
          
          if (ruleSet.maxLength && String(value).length > ruleSet.maxLength) {
            errors.push(`Variable '${variable}' must be at most ${ruleSet.maxLength} characters`);
          }
          
          if (ruleSet.pattern && !new RegExp(ruleSet.pattern).test(String(value))) {
            errors.push(`Variable '${variable}' does not match required pattern`);
          }
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  getAllVariables(): string[] {
    return [...this.requiredVariables, ...this.optionalVariables];
  }
}
