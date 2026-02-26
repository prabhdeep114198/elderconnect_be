import {
    Controller,
    Post,
    Body,
    UseGuards,
    HttpStatus,
    HttpCode,
    Headers,
    UnauthorizedException,
    Logger,
    Get,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiHeader,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@ApiTags('Chatbot')
@Controller('chat')
export class ChatController {
    private readonly logger = new Logger(ChatController.name);
    private readonly internalApiKey: string;

    constructor(
        private readonly chatService: ChatService,
        private readonly configService: ConfigService,
    ) {
        // Fetch internal API key from env only
        // Use the dedicated internal key for x-api-key validation
        this.internalApiKey =
            this.configService.get<string>('INTERNAL_API_KEY') ||
            this.configService.get<string>('HUGGINGFACE_API_KEY') ||
            '';

        if (!this.internalApiKey) {
            this.logger.error('[ChatController] Internal API key not configured in environment (HUGGINGFACE_API_KEY / N8N_API_KEY)');
        }
    }

    /**
     * Authenticated chat — used by the mobile app with JWT
     * POST /api/chat
     */
    @Post()
    @HttpCode(HttpStatus.OK)
    @UseGuards(AuthGuard(['jwt', 'firebase']))
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Send a message to the ElderConnect health chatbot',
        description:
            'Replicates the ElderConnectChatbot N8N workflow natively. Loads user health context (vitals, wellness scores, mood), builds a system prompt, calls HuggingFace DeepSeek-V3, and returns a personalised, risk-aware reply.',
    })
    @ApiResponse({
        status: 200,
        description: 'Chat reply generated successfully',
        schema: {
            example: {
                reply: "It sounds like you're feeling a bit off today. Have you had enough water and rest? If you feel worse, please reach out to your caregiver.",
                conversationId: 'uuid-here',
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async chat(
        @CurrentUser() user: User,
        @Body() chatRequest: ChatRequestDto,
    ): Promise<ChatResponseDto> {
        this.logger.log(`[ChatController] JWT request from user ${user.id}: "${chatRequest.message}"`);
        return this.chatService.sendMessage(user.id, chatRequest);
    }

    /**
     * Internal / N8N-webhook-compatible endpoint — uses X-API-KEY header
     * POST /api/chat/internal
     *
     * Replicates the original N8N webhook at /private-chat-endpoint.
     * Body: { userId, message, context? }
     */
    @Post('internal')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Internal chat endpoint (X-API-KEY auth)',
        description:
            'N8N webhook-compatible endpoint. Validates the X-API-KEY header, then runs the full chatbot pipeline. Accepts userId + message in the body.',
    })
    @ApiHeader({
        name: 'x-api-key',
        description: 'Internal API key (matches HuggingFace token in N8N workflow)',
        required: true,
    })
    @ApiResponse({ status: 200, description: 'Chat reply generated' })
    @ApiResponse({ status: 401, description: 'Missing or invalid x-api-key' })
    async chatInternal(
        @Headers('x-api-key') apiKey: string,
        @Body() body: { userId: string; message: string; context?: any },
    ): Promise<any> {
        // ── Validate API key (same as N8N "Code in JavaScript" node) ──────────
        if (!apiKey) {
            throw new UnauthorizedException('Missing internal API key');
        }
        if (apiKey !== this.internalApiKey) {
            throw new UnauthorizedException('Unauthorized request');
        }

        const { userId, message } = body;
        if (!userId || !message) {
            return { reply: "Please provide both userId and message.", conversationId: null };
        }

        this.logger.log(`[ChatController] Internal request for user ${userId}: "${message}"`);
        return this.chatService.sendMessage(userId, { message });
    }
}
