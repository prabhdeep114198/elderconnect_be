import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideoCallsTable1680000000000 implements MigrationInterface {
  name = 'CreateVideoCallsTable1680000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "video_calls" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "caller_id" uuid NOT NULL,
        "callee_id" uuid NOT NULL,
        "room_id" varchar(255) UNIQUE NOT NULL,
        "status" varchar(50) NOT NULL DEFAULT 'pending',
        "call_type" varchar(50) NOT NULL DEFAULT 'video',
        "accepted_at" TIMESTAMP NULL,
        "ended_at" TIMESTAMP NULL,
        "duration_seconds" integer DEFAULT 0,
        "reason" text NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "video_calls";`);
  }
}