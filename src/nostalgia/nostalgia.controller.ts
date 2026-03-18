import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';

import { NostalgiaService } from './nostalgia.service';
import { CreateMemoryDto } from './dto/nostalgia.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { TierGuard } from '../common/guards/tier.guard';
import { RequireTier } from '../common/decorators/require-tier.decorator';
import { SubscriptionTier } from '../common/enums/subscription-tier.enum';

@ApiTags('Nostalgia AI')
@Controller('v1/nostalgia')
@UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
@ApiBearerAuth()
export class NostalgiaController {
  constructor(private readonly nostalgiaService: NostalgiaService) {}

  @Get('prompt')
  @ApiOperation({ summary: 'Get an AI-generated nostalgic prompt to ask the user' })
  @ApiResponse({ status: 200, description: 'Prompt successfully generated' })
  async getPrompt(@CurrentUser() currentUser) {
    const prompt = await this.nostalgiaService.generatePrompt(currentUser.id);
    return {
      message: 'Generated prompt successfully',
      data: { prompt },
    };
  }

  @Post('memory')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a recorded memory transcript and audio file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Memory successfully saved' })
  @UseInterceptors(FileInterceptor('audioFile'))
  async saveMemory(
    @CurrentUser() currentUser,
    @Body() createMemoryDto: CreateMemoryDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB limit
        ],
        fileIsRequired: false,
      })
    )
    audioFile?: Express.Multer.File,
  ) {
    const memory = await this.nostalgiaService.saveMemory(
      currentUser.id,
      createMemoryDto,
      audioFile,
    );

    return {
      message: 'Memory saved successfully',
      data: { memory },
    };
  }

  @Get('timeline/:userId')
  @ApiOperation({ summary: 'Get the memory timeline for an elder. Restricted to care network & premium.' })
  @ApiResponse({ status: 200, description: 'Timeline successfully retrieved' })
  @UseGuards(TierGuard)
  @RequireTier(SubscriptionTier.PREMIUM, SubscriptionTier.ENTERPRISE)
  async getTimeline(
    @Param('userId') targetUserId: string,
    @CurrentUser() currentUser,
  ) {
    // Basic auth check: Can only view own timeline or caregiver viewing elder's timeline
    if (
      currentUser.id !== targetUserId &&
      !currentUser.roles.includes(UserRole.CAREGIVER) &&
      !currentUser.roles.includes(UserRole.ADMIN)
    ) {
      throw new Error('Unauthorized to view this memory timeline');
    }

    const timeline = await this.nostalgiaService.getTimeline(targetUserId);

    return {
      message: 'Timeline retrieved successfully',
      data: { timeline, count: timeline.length },
    };
  }
}
