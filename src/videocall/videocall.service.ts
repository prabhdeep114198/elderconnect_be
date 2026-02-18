import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { VideoCallEntity } from './videocall.entity';
import { CallStatus, CallType } from './videocall.enums';
import {
  InitiateCallDto,
  InitiateCallResponseDto,
  JoinCallResponseDto,
} from './videocall.dto';

const CALL_TIMEOUT_SECONDS = 30;

@Injectable()
export class VideoCallService {
  private readonly logger = new Logger(VideoCallService.name);

  constructor(
    @InjectRepository(VideoCallEntity, 'profile')
    private readonly callRepo: Repository<VideoCallEntity>,
  ) {}

  // ── INITIATE ──────────────────────────────────────────────────────────────

  async initiateCall(
    callerId: string,
    dto: InitiateCallDto,
  ): Promise<InitiateCallResponseDto> {
    if (callerId === dto.callee_id) {
      throw new BadRequestException('You cannot call yourself.');
    }

    const roomId = `ec_${uuidv4().replace(/-/g, '').slice(0, 20)}`;

    const call = await this.callRepo.save({
      caller_id:  callerId,
      callee_id:  dto.callee_id,
      room_id:    roomId,
      status:     CallStatus.PENDING,
      call_type:  dto.call_type ?? CallType.VIDEO,
    });

    this.scheduleTimeout(call.id);

    return { call_id: call.id, room_id: roomId };
  }

  // ── JOIN ──────────────────────────────────────────────────────────────────

  async joinCall(calleeId: string, callId: string): Promise<JoinCallResponseDto> {
    const call = await this.findOrFail(callId);

    if (call.callee_id !== calleeId) {
      throw new BadRequestException('You are not the intended callee.');
    }
    if (call.status !== CallStatus.PENDING) {
      throw new BadRequestException(`Call is already in "${call.status}" state.`);
    }

    await this.callRepo.update(callId, {
      status:      CallStatus.ACCEPTED,
      accepted_at: new Date(),
    });

    return { room_id: call.room_id, call_type: call.call_type };
  }

  // ── REJECT ────────────────────────────────────────────────────────────────

  async rejectCall(calleeId: string, callId: string, reason?: string): Promise<void> {
    const call = await this.findOrFail(callId);

    if (call.callee_id !== calleeId) {
      throw new BadRequestException('You are not the intended callee.');
    }
    if (call.status !== CallStatus.PENDING) {
      throw new BadRequestException(`Call is already in "${call.status}" state.`);
    }

    await this.callRepo.update(callId, {
      status:   CallStatus.REJECTED,
      ended_at: new Date(),
      reason:   reason ?? 'Rejected by callee',
    });
  }

  // ── END ───────────────────────────────────────────────────────────────────

  async endCall(userId: string, callId: string, reason?: string): Promise<void> {
    const call = await this.findOrFail(callId);

    if (call.caller_id !== userId && call.callee_id !== userId) {
      throw new BadRequestException('You are not a participant of this call.');
    }

    let durationSeconds = 0;
    if (call.status === CallStatus.ACCEPTED && call.accepted_at) {
      durationSeconds = Math.round(
        (Date.now() - new Date(call.accepted_at).getTime()) / 1000,
      );
    }

    await this.callRepo.update(callId, {
      status:           CallStatus.ENDED,
      ended_at:         new Date(),
      duration_seconds: durationSeconds,
      reason:           reason ?? null,
    });
  }

  // ── HISTORY ───────────────────────────────────────────────────────────────

  async getCallHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: VideoCallEntity[]; total: number }> {
    const where: FindOptionsWhere<VideoCallEntity>[] = [
      { caller_id: userId },
      { callee_id: userId },
    ];

    const [data, total] = await this.callRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip:  (page - 1) * limit,
      take:  limit,
    });

    return { data, total };
  }

  async findById(callId: string): Promise<VideoCallEntity | null> {
    return this.callRepo.findOne({ where: { id: callId } });
  }

  // ── PRIVATE ───────────────────────────────────────────────────────────────

  private async findOrFail(callId: string): Promise<VideoCallEntity> {
    const call = await this.callRepo.findOne({ where: { id: callId } });
    if (!call) throw new NotFoundException(`Call "${callId}" not found.`);
    return call;
  }

  private scheduleTimeout(callId: string): void {
    setTimeout(async () => {
      try {
        const call = await this.callRepo.findOne({ where: { id: callId } });
        if (call && call.status === CallStatus.PENDING) {
          await this.callRepo.update(callId, {
            status:   CallStatus.MISSED,
            ended_at: new Date(),
            reason:   'Callee did not respond within timeout.',
          });
          this.logger.log(`Call ${callId} marked MISSED (timeout).`);
        }
      } catch (err) {
        this.logger.error(`Timeout error for call ${callId}`, err);
      }
    }, CALL_TIMEOUT_SECONDS * 1000);
  }
}