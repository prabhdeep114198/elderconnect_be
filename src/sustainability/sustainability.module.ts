import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSustainability } from './entities/user-sustainability.entity';
import { SustainabilityService } from './sustainability.service';
import { SustainabilityController } from './sustainability.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserSustainability], 'profile'),
  ],
  controllers: [SustainabilityController],
  providers: [SustainabilityService],
  exports: [SustainabilityService],
})
export class SustainabilityModule {}
