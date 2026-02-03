import { Module, OnModuleDestroy, Global, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver } from 'neo4j-driver';
import { GraphService } from './graph.service';
import { GraphController } from './graph.controller';
import { ProfileModule } from '../profile/profile.module';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
    imports: [ProfileModule, AuthModule],
    providers: [
        {
            provide: 'NEO4J_DRIVER',
            useFactory: (configService: ConfigService) => {
                const uri = configService.get<string>('neo4j.uri') || 'bolt://localhost:7687';
                const username = configService.get<string>('neo4j.username') || 'neo4j';
                const password = configService.get<string>('neo4j.password') || 'password';
                return neo4j.driver(uri, neo4j.auth.basic(username, password));
            },
            inject: [ConfigService],
        },
        GraphService,
    ],
    controllers: [GraphController],
    exports: [GraphService],
})
export class GraphModule implements OnModuleDestroy {
    constructor(@Inject('NEO4J_DRIVER') private readonly driver: Driver) { }

    async onModuleDestroy() {
        await this.driver.close();
    }
}
