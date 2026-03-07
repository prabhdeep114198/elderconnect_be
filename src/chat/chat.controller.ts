
import { Controller, Post, Body, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post()
    @HttpCode(HttpStatus.OK)
    async chat(
        @CurrentUser() user: User,
        @Body() chatRequest: ChatRequestDto,
    ): Promise<ChatResponseDto> {
        // Determine userId from the authenticated user
        // The CurrentUser decorator should extract the user object from the request
        return this.chatService.sendMessage(user.id, chatRequest);
    }

    @Post('nutrition')
    @HttpCode(HttpStatus.OK)
    async getDynamicNutritionPlan(
        @CurrentUser() user: User,
        @Body() body: { dietType?: string }
    ) {
        const dietType = body.dietType || 'vegetarian';
        const data = await this.chatService.getDynamicNutritionPlan(user.id, dietType);
        return { message: `Dynamic ${dietType} nutrition plan generated successfully`, data };
    }

    @Post('exercises')
    @HttpCode(HttpStatus.OK)
    async getDynamicExercises(@CurrentUser() user: User) {
        const data = await this.chatService.getDynamicExercises(user.id);
        return { message: 'Dynamic exercises generated successfully', data };
    }
}
