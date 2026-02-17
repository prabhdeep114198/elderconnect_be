import { Controller, Get, Post, Body, UseGuards, Param, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PersonalizationService } from './personalization.service';
import { CreateInteractionDto, PersonalizationResponseDto } from './dto/personalization.dto';

@ApiTags('Personalization')
@Controller('v1/personalization')
@UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
@ApiBearerAuth()
export class PersonalizationController {
    private readonly logger = new Logger(PersonalizationController.name);

    constructor(private readonly personalizationService: PersonalizationService) { }

    @Get('journey')
    @ApiOperation({ summary: 'Get personalized user journey and recommendations' })
    @ApiResponse({ status: 200, type: PersonalizationResponseDto })
    async getJourney(@CurrentUser() user: any) {
        this.logger.log(`Fetching personalized journey for user ${user.id}`);
        const data = await this.personalizationService.getPersonalizedCare(user.id);
        return {
            message: 'Personalized journey retrieved successfully',
            data,
        };
    }

    @Post('interaction')
    @ApiOperation({ summary: 'Track user interaction for personalization' })
    @ApiResponse({ status: 201, description: 'Interaction tracked successfully' })
    async trackInteraction(@CurrentUser() user: any, @Body() dto: CreateInteractionDto) {
        this.logger.log(`Tracking interaction ${dto.type} for user ${user.id}`);
        const result = await this.personalizationService.trackInteraction(user.id, dto);
        return {
            message: 'Interaction tracked successfully',
            data: result,
        };
    }
}
