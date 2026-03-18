import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { NostalgiaController } from './nostalgia.controller';
import { NostalgiaService } from './nostalgia.service';
import { NostalgiaMemory } from './entities/nostalgia-memory.entity';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([NostalgiaMemory, User], 'auth'),
    ConfigModule,
  ],
  controllers: [NostalgiaController],
  providers: [NostalgiaService],
  exports: [NostalgiaService],
})
export class NostalgiaModule {}
