/**
 * videocall.gateway.ts
 *
 * BEFORE THIS WORKS: install the two missing packages:
 *   npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
 *
 * These are standard NestJS WebSocket packages - they just weren't
 * installed in your project yet.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { VideoCallService } from './videocall.service';

@WebSocketGateway({ cors: { origin: '*' } })
@Injectable()
export class VideoCallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(VideoCallGateway.name);

  /** userId → Set<Socket> */
  private readonly clients = new Map<string, Set<Socket>>();
  /** socketId → userId */
  private readonly socketToUser = new Map<string, string>();

  constructor(private readonly videoCallService: VideoCallService) {}

  // ── LIFECYCLE ──────────────────────────────────────────────────────────────

  handleConnection(socket: Socket): void {
    this.logger.log(`Socket connected: ${socket.id}`);
  }

  handleDisconnect(socket: Socket): void {
    const userId = this.socketToUser.get(socket.id);
    if (userId) {
      const sockets = this.clients.get(userId);
      sockets?.delete(socket);
      if (!sockets?.size) this.clients.delete(userId);
      this.socketToUser.delete(socket.id);
    }
    this.logger.log(`Socket disconnected: ${socket.id}`);
  }

  // ── AUTH ───────────────────────────────────────────────────────────────────

  @SubscribeMessage('authenticate')
  handleAuth(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { userId: string },
  ): void {
    const { userId } = payload;
    if (!this.clients.has(userId)) this.clients.set(userId, new Set());
    this.clients.get(userId)!.add(socket);
    this.socketToUser.set(socket.id, userId);
    this.logger.log(`User ${userId} authenticated on socket ${socket.id}`);
  }

  // ── CALL SIGNALING ─────────────────────────────────────────────────────────

  @SubscribeMessage('call:invite')
  async handleInvite(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { call_id: string },
  ): Promise<void> {
    const call = await this.videoCallService.findById(payload.call_id);
    if (!call) { socket.emit('call:error', { message: 'Call not found' }); return; }

    this.emitToUser(call.callee_id, 'call:incoming', {
      call_id:   call.id,
      caller_id: call.caller_id,
      call_type: call.call_type,
    });
  }

  @SubscribeMessage('call:accept')
  async handleAccept(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { call_id: string },
  ): Promise<void> {
    const call = await this.videoCallService.findById(payload.call_id);
    if (!call) return;

    const calleeId = this.socketToUser.get(socket.id);
    if (calleeId) {
      await this.videoCallService.joinCall(calleeId, payload.call_id);
    }

    this.emitToUser(call.caller_id, 'call:accepted', {
      call_id: payload.call_id,
      room_id: call.room_id,
    });
  }

  @SubscribeMessage('call:reject')
  async handleReject(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { call_id: string; reason?: string },
  ): Promise<void> {
    const calleeId = this.socketToUser.get(socket.id);
    if (calleeId) {
      await this.videoCallService.rejectCall(calleeId, payload.call_id, payload.reason);
    }

    const call = await this.videoCallService.findById(payload.call_id);
    if (call) {
      this.emitToUser(call.caller_id, 'call:rejected', {
        call_id: payload.call_id,
        reason:  payload.reason ?? 'Declined',
      });
    }
  }

  @SubscribeMessage('call:end')
  async handleEnd(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { call_id: string },
  ): Promise<void> {
    const userId = this.socketToUser.get(socket.id);
    if (userId) {
      await this.videoCallService.endCall(userId, payload.call_id);
    }

    const call = await this.videoCallService.findById(payload.call_id);
    if (call && userId) {
      const otherId = call.caller_id === userId ? call.callee_id : call.caller_id;
      this.emitToUser(otherId, 'call:ended', {
        call_id:          payload.call_id,
        duration_seconds: call.duration_seconds,
      });
    }
  }

  // ── WEBRTC SIGNALING RELAY ─────────────────────────────────────────────────

  @SubscribeMessage('webrtc:offer')
  async handleOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { call_id: string; sdp: RTCSessionDescriptionInit },
  ): Promise<void> {
    const call = await this.videoCallService.findById(payload.call_id);
    if (!call) return;

    const senderId = this.socketToUser.get(socket.id);
    const otherId  = call.caller_id === senderId ? call.callee_id : call.caller_id;
    this.emitToUser(otherId, 'webrtc:offer', { call_id: payload.call_id, sdp: payload.sdp });
  }

  @SubscribeMessage('webrtc:answer')
  async handleAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { call_id: string; sdp: RTCSessionDescriptionInit },
  ): Promise<void> {
    const call = await this.videoCallService.findById(payload.call_id);
    if (!call) return;

    const senderId = this.socketToUser.get(socket.id);
    const otherId  = call.caller_id === senderId ? call.callee_id : call.caller_id;
    this.emitToUser(otherId, 'webrtc:answer', { call_id: payload.call_id, sdp: payload.sdp });
  }

  @SubscribeMessage('webrtc:ice-candidate')
  async handleIceCandidate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { call_id: string; candidate: RTCIceCandidateInit },
  ): Promise<void> {
    const call = await this.videoCallService.findById(payload.call_id);
    if (!call) return;

    const senderId = this.socketToUser.get(socket.id);
    const otherId  = call.caller_id === senderId ? call.callee_id : call.caller_id;
    this.emitToUser(otherId, 'webrtc:ice-candidate', {
      call_id:   payload.call_id,
      candidate: payload.candidate,
    });
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private emitToUser(userId: string, event: string, data: unknown): void {
    const sockets = this.clients.get(userId);
    if (sockets?.size) {
      sockets.forEach((s) => s.emit(event, data));
    } else {
      this.logger.warn(`No socket for user ${userId} – event "${event}" dropped.`);
    }
  }
}