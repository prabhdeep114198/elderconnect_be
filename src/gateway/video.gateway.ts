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

@WebSocketGateway({ cors: { origin: '*' } })
export class VideoGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(socket: Socket) { 
    console.log('Connected:', socket.id); 
  }

  handleDisconnect(socket: Socket) { 
    console.log('Disconnected:', socket.id);
    // Optional: You could broadcast a leave event to all rooms the socket was in
    // this.server.emit('peer:left', { id: socket.id });
  }

  @SubscribeMessage('room:join')
  handleRoomJoin(@MessageBody() data: { email: string; room: string }, @ConnectedSocket() socket: Socket) {
    const { room } = data;
    socket.join(room);
    socket.to(room).emit('user:joined', { id: socket.id, email: data.email });
    socket.emit('room:join', data);
  }

  @SubscribeMessage('user:call')
  handleUserCall(@MessageBody() data: { to: string; offer: any }, @ConnectedSocket() socket: Socket) {
    this.server.to(data.to).emit('incomming:call', { from: socket.id, offer: data.offer });
  }

  @SubscribeMessage('call:accepted')
  handleCallAccepted(@MessageBody() data: { to: string; ans: any }, @ConnectedSocket() socket: Socket) {
    this.server.to(data.to).emit('call:accepted', { from: socket.id, ans: data.ans });
  }

  @SubscribeMessage('peer:ice:candidate')
  handleIce(@MessageBody() data: { to: string; candidate: any }, @ConnectedSocket() socket: Socket) {
    this.server.to(data.to).emit('peer:ice:candidate', { from: socket.id, candidate: data.candidate });
  }

  // --- NEW: Handle Manual Hang-up ---
  @SubscribeMessage('peer:leave')
  handlePeerLeave(@MessageBody() data: { to: string }, @ConnectedSocket() socket: Socket) {
    console.log(`User ${socket.id} left room ${data.to}`);
    // Broadcast to the room that this specific peer has left
    socket.to(data.to).emit('peer:left', { id: socket.id });
  }
}