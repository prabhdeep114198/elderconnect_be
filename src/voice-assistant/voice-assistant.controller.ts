import {
    Controller,
    Post,
    Body,
    HttpCode,
    HttpStatus,
    Logger,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceAssistantRequestDto, VoiceAssistantResponse } from './dto/voice-assistant.dto';

@ApiTags('Voice Assistant')
@Controller('v1/voice-assistant')
@UseGuards(ApiKeyGuard)
export class VoiceAssistantController {
    private readonly logger = new Logger(VoiceAssistantController.name);

    constructor(private readonly voiceAssistantService: VoiceAssistantService) { }

    @Post('process-public')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Process voice command to intent and action' })
    @ApiResponse({ status: 200, description: 'Success' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    async processPublic(
        @Body() dto: VoiceAssistantRequestDto,
    ): Promise<VoiceAssistantResponse> {
        this.logger.log(`[VoiceAssistantController] Received request: ${dto.text.substring(0, 50)}...`);
        return this.voiceAssistantService.processVoiceCommand(dto);
    }
}
