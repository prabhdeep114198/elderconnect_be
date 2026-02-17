import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { Device } from './entities/device.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { FirebaseStrategy } from './strategies/firebase.strategy';
import { AuditLogModule } from '../common/services/audit-log.module';
import { EmailService } from '../common/services/email.service';
import { CacheService } from '../common/services/cache.service';
import { TokenBlacklistService } from '../common/services/token-blacklist.service';

import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Device], 'auth'),
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn'),
        },
      }) as any,
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    FirebaseStrategy,
    EmailService,
    TokenBlacklistService,
    ApiKeyGuard,
    DeviceAuthGuard,
  ],
  exports: [AuthService, JwtStrategy, FirebaseStrategy, PassportModule, ApiKeyGuard, DeviceAuthGuard],
})
export class AuthModule { }
