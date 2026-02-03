import { Controller, Get, Param, UseGuards, Post } from '@nestjs/common';
import { GraphService } from './graph.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('graph')
@UseGuards(AuthGuard('jwt'))
export class GraphController {
    constructor(private readonly graphService: GraphService) { }

    @Get('user/:userId')
    async getUserGraph(@Param('userId') userId: string) {
        return this.graphService.getUserGraph(userId);
    }

    @Post('sync/:userId')
    async syncUserGraph(@Param('userId') userId: string) {
        await this.graphService.syncUserData(userId);
        return { success: true };
    }
}
