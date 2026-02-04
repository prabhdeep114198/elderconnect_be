import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { GraphService } from './graph.service';

@ApiTags('Knowledge Graph')
@Controller('v1/graph')
@UseGuards(AuthGuard(['jwt', 'firebase']))
@ApiBearerAuth()
export class GraphController {
    constructor(private readonly graphService: GraphService) { }

    @Get('user/:userId')
    @ApiOperation({ summary: 'Get user knowledge graph data' })
    @ApiResponse({ status: 200, description: 'Graph data retrieved successfully' })
    async getUserGraph(@Param('userId') userId: string) {
        return this.graphService.getUserGraph(userId);
    }

    @Post('sync/:userId')
    @ApiOperation({ summary: 'Trigger graph synchronization' })
    @ApiResponse({ status: 200, description: 'Graph sync triggered' })
    async syncGraph(@Param('userId') userId: string) {
        return this.graphService.syncGraph(userId);
    }
}
