import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";
import { PrivacyPolicy } from "./entities/privacy-policy.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([PrivacyPolicy], "audit"),
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}