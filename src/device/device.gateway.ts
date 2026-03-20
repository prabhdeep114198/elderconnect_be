import { WebSocketGateway, WebSocketServer, OnGatewayConnection, SubscribeMessage, ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class DeviceGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(socket: Socket) {
    // Client connected
  }

  // Frontend joins their own personal room when they log in
  @SubscribeMessage('room:join_user')
  handleJoinUserRoom(@MessageBody() data: { userId: string }, @ConnectedSocket() socket: Socket) {
    socket.join(`user:${data.userId}`);
    console.log(`[DeviceGateway] Socket ${socket.id} joined user room: user:${data.userId}`);
    return { success: true, room: `user:${data.userId}` };
  }

  emitHardwareSOS(userId: string, alertData: any) {
    console.log(`[DeviceGateway] Emitting hardware:sos_alert to room user:${userId}`);
    this.server.to(`user:${userId}`).emit('hardware:sos_alert', alertData);
  }
}
