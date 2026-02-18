import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Run:   npm run migration:run
 * Revert: npm run migration:revert
 *
 * Targets the profile_db connection (same DB as user_profiles / medications).
 */
export class CreateVideoCallsTable1717000000000 implements MigrationInterface {
  name = 'CreateVideoCallsTable1717000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'video_calls',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          { name: 'caller_id', type: 'varchar', length: '255' },
          { name: 'callee_id', type: 'varchar', length: '255' },
          { name: 'agora_channel', type: 'varchar', length: '255', isUnique: true },
          { name: 'caller_agora_uid', type: 'bigint', isNullable: true },
          { name: 'callee_agora_uid', type: 'bigint', isNullable: true },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'accepted', 'rejected', 'missed', 'ended', 'failed'],
            default: "'pending'",
          },
          {
            name: 'call_type',
            type: 'enum',
            enum: ['video', 'voice'],
            default: "'video'",
          },
          { name: 'accepted_at', type: 'timestamp', isNullable: true },
          { name: 'ended_at', type: 'timestamp', isNullable: true },
          { name: 'duration_seconds', type: 'integer', isNullable: true, default: 0 },
          { name: 'reason', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true, // safe if exists
    );

    // Indexes for fast lookups
    await queryRunner.createIndex(
      'video_calls',
      new TableIndex({ name: 'IDX_VC_CALLER_CREATED', columnNames: ['caller_id', 'created_at'] }),
    );
    await queryRunner.createIndex(
      'video_calls',
      new TableIndex({ name: 'IDX_VC_CALLEE_CREATED', columnNames: ['callee_id', 'created_at'] }),
    );
    await queryRunner.createIndex(
      'video_calls',
      new TableIndex({ name: 'IDX_VC_CHANNEL_STATUS', columnNames: ['agora_channel', 'status'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('video_calls', 'IDX_VC_CHANNEL_STATUS');
    await queryRunner.dropIndex('video_calls', 'IDX_VC_CALLEE_CREATED');
    await queryRunner.dropIndex('video_calls', 'IDX_VC_CALLER_CREATED');
    await queryRunner.dropTable('video_calls');
  }
}