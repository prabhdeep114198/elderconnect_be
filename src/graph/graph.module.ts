import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vitals } from '../device/entities/vitals.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import neo4j from 'neo4j-driver';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([Vitals, TelemetryData], 'vitals'),
        TypeOrmModule.forFeature([UserProfile], 'profile'),
        AuthModule,
    ],
    controllers: [GraphController],
    providers: [
        GraphService,
        {
            provide: 'NEO4J_DRIVER',
            useFactory: async (configService: ConfigService) => {
                const uri = configService.get<string>('NEO4J_URI', 'bolt://localhost:7687');
                const user = configService.get<string>('NEO4J_USER', 'neo4j');
                const password = configService.get<string>('NEO4J_PASSWORD', 'test');
                return neo4j.driver(uri, neo4j.auth.basic(user, password));
            },
            inject: [ConfigService],
        },
    ],
    exports: [GraphService],
})
export class GraphModule { }
