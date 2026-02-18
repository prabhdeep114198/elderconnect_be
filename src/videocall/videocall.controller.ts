import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { VideoCallService } from './videocall.service';
import {
  InitiateCallDto,
  InitiateCallResponseDto,
  JoinCallDto,
  JoinCallResponseDto,
  RespondCallDto,
  CallHistoryQueryDto,
} from './videocall.dto';

interface AuthenticatedRequest {
  user: { id: string; email: string; roles?: string[] };
}

@ApiTags('Video Calls')
@Controller('v1/videocalls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VideoCallController {
  constructor(private readonly videoCallService: VideoCallService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a video/voice call' })
  @ApiResponse({ status: 201, type: InitiateCallResponseDto })
  async initiateCall(
    @Request() req: AuthenticatedRequest,
    @Body() dto: InitiateCallDto,
  ): Promise<InitiateCallResponseDto> {
    return this.videoCallService.initiateCall(req.user.id, dto);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a call (callee side)' })
  @ApiResponse({ status: 200, type: JoinCallResponseDto })
  async joinCall(
    @Request() req: AuthenticatedRequest,
    @Body() dto: JoinCallDto,
  ): Promise<JoinCallResponseDto> {
    return this.videoCallService.joinCall(req.user.id, dto.call_id);
  }

  @Post('reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject an incoming call' })
  async rejectCall(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RespondCallDto,
  ): Promise<void> {
    return this.videoCallService.rejectCall(req.user.id, dto.call_id, dto.reason);
  }

  @Post('end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End an active call' })
  async endCall(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RespondCallDto,
  ): Promise<void> {
    return this.videoCallService.endCall(req.user.id, dto.call_id, dto.reason);
  }

  @Get('history')
  @ApiOperation({ summary: 'Paginated call history' })
  async getHistory(
    @Request() req: AuthenticatedRequest,
    @Query() query: CallHistoryQueryDto,
  ) {
    return this.videoCallService.getCallHistory(
      req.user.id,
      Number(query.page)  || 1,
      Number(query.limit) || 20,
    );
  }
}