import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOxygenSaturationToDailyHealthMetrics1697328000000 implements MigrationInterface {
  name = 'AddOxygenSaturationToDailyHealthMetrics1697328000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
