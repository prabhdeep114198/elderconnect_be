import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOxygenSaturationToDailyHealthMetrics20260213 implements MigrationInterface {
  name = 'AddOxygenSaturationToDailyHealthMetrics20260213';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add oxygenSaturation column (matches entity property name)
    await queryRunner.query(
      `ALTER TABLE "daily_health_metrics" ADD COLUMN "oxygenSaturation" integer`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_health_metrics" DROP COLUMN "oxygenSaturation"`
    );
  }
}
