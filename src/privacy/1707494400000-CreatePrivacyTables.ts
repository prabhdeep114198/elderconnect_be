import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreatePrivacyTables1707494400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create privacy_policy table
    await queryRunner.createTable(
      new Table({
        name: 'privacy_policy',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'language',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'version',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'sections',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'effectiveDate',
            type: 'timestamp',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create terms_conditions table
    await queryRunner.createTable(
      new Table({
        name: 'terms_conditions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'language',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'version',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'content',
            type: 'text',
          },
          {
            name: 'sections',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'effectiveDate',
            type: 'timestamp',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create user_policy_acceptance table
    await queryRunner.createTable(
      new Table({
        name: 'user_policy_acceptance',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'policyId',
            type: 'uuid',
          },
          {
            name: 'acceptedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create user_terms_acceptance table
    await queryRunner.createTable(
      new Table({
        name: 'user_terms_acceptance',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'termsId',
            type: 'uuid',
          },
          {
            name: 'acceptedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Add foreign keys
    await queryRunner.createForeignKey(
      'user_policy_acceptance',
      new TableForeignKey({
        columnNames: ['policyId'],
        referencedTableName: 'privacy_policy',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_terms_acceptance',
      new TableForeignKey({
        columnNames: ['termsId'],
        referencedTableName: 'terms_conditions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX idx_privacy_policy_language_active ON privacy_policy(language, isActive)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_terms_conditions_language_active ON terms_conditions(language, isActive)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_user_policy_acceptance_user ON user_policy_acceptance(userId)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_user_terms_acceptance_user ON user_terms_acceptance(userId)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_terms_acceptance');
    await queryRunner.dropTable('user_policy_acceptance');
    await queryRunner.dropTable('terms_conditions');
    await queryRunner.dropTable('privacy_policy');
  }
}