import {
    Controller,
    Post,
    Body,
    HttpCode,
    HttpStatus,
    Logger,
    UseGuards,
    Headers,
    UnauthorizedException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiHeader,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceAssistantRequestDto } from './dto/voice-assistant.dto';

@ApiTags('Voice Assistant')
@Controller('v1/voice-assistant')
export class VoiceAssistantController {
    private readonly logger = new Logger(VoiceAssistantController.name);
    private readonly internalApiKey: string;

    constructor(
        private readonly voiceAssistantService: VoiceAssistantService,
        private readonly configService: ConfigService,
    ) {
        this.internalApiKey =
            this.configService.get<string>('INTERNAL_API_KEY') ||
            this.configService.get<string>('HUGGINGFACE_API_KEY') ||
            '';

        if (!this.internalApiKey) {
            this.logger.error('[VoiceAssistantController] Internal API key not configured');
        }
    }

    /**
     * POST /api/v1/voice-assistant/process
     *
     * Replicates the ElderConnect N8N voice assistant workflow.
     * Accepts raw text + userContext + JWT, calls HuggingFace DeepSeek
     * for intent parsing, then routes to the correct action handler.
     */
    @Post('process')
    @HttpCode(HttpStatus.OK)
    @UseGuards(AuthGuard(['jwt', 'firebase']))
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Process a voice command',
        description:
            'Accepts a transcribed voice text, detects intent via HuggingFace DeepSeek, and performs the appropriate backend action (create event, log vital, set reminder, etc.)',
    })
    @ApiResponse({
        status: 200,
        description: 'Voice command processed successfully',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async processVoiceCommand(@Body() dto: VoiceAssistantRequestDto) {
        this.logger.log(`[VoiceAssistant Controller] JWT request for user: ${dto.userContext?.userId} | text: "${dto.text}"`);
        return this.voiceAssistantService.processVoiceCommand(dto);
    }

    /**
     * POST /api/v1/voice-assistant/process-public
     *
     * Public endpoint — validates X-API-KEY header (replicates N8N security)
     */
    @Post('process-public')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Process a voice command (X-API-KEY auth)',
        description: 'Public endpoint that validates the X-API-KEY header before processing. Replicates N8N webhook behavior.',
    })
    @ApiHeader({
        name: 'x-api-key',
        description: 'Internal API key',
        required: true,
    })
    @ApiResponse({ status: 200, description: 'Voice command processed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
    async processVoiceCommandPublic(
        @Headers('x-api-key') apiKey: string,
        @Body() dto: any,
    ) {
        if (!apiKey || apiKey !== this.internalApiKey) {
            throw new UnauthorizedException('Missing or invalid API key');
        }

        // Handle stringified userContext from older frontend bundles
        let parsedContext = dto.userContext;
        if (typeof parsedContext === 'string') {
            try {
                parsedContext = JSON.parse(parsedContext);
            } catch (e) {
                // Keep as is if parsing fails
            }
        }

        const finalDto = {
            ...dto,
            userContext: parsedContext
        };

        this.logger.log(`[VoiceAssistant] Public request for user: ${finalDto.userContext?.userId}`);
        return this.voiceAssistantService.processVoiceCommand(finalDto);
    }
}
