import { NextApiRequest, NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { getToken } from 'next-auth/jwt';

const connectedUsers: Map<string, string[]> = new Map();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (res.socket && (res.socket as any).server.io) {
    res.end();
    return;
  }

  const io = new SocketIOServer((res.socket as any).server, {
    path: '/api/websocket',
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  (res.socket as any).server.io = io;

  // Update middleware to get token from query
  io.use(async (socket, next) => {
    try {
      // Get token from query parameters instead of auth headers
      const token = socket.handshake.query.token as string;
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const secret = process.env.NEXTAUTH_SECRET;
      if (!secret) {
        return next(new Error('Server configuration error: Missing NEXTAUTH_SECRET'));
      }

      // Create a minimal JWT verification approach to avoid excessive data
      const decoded = await getToken({ 
        req: { cookies: { 'next-auth.session-token': token } } as any,
        secret
      });

      if (!decoded || !decoded.sub) {
        return next(new Error('Authentication error: Invalid token'));
      }

      socket.data.userId = decoded.sub;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  });

  // Rest of the server implementation
  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, []);
    }
    connectedUsers.get(userId)?.push(socket.id);

    socket.on('joinOrganization', (organizationId) => {
      socket.join(`org:${organizationId}`);
    });

    socket.on('leaveOrganization', (organizationId) => {
      socket.leave(`org:${organizationId}`);
    });

    socket.on('disconnect', () => {
      const userSockets = connectedUsers.get(userId) || [];
      const updatedSockets = userSockets.filter(id => id !== socket.id);
      
      if (updatedSockets.length === 0) {
        connectedUsers.delete(userId);
      } else {
        connectedUsers.set(userId, updatedSockets);
      }
    });
  });

  res.end();
}

export const sendNotificationToUser = (userId: string, notification: any) => {
  const io = (global as any).io;
  if (!io) return;

  const userSockets = connectedUsers.get(userId);
  if (userSockets && userSockets.length > 0) {
    userSockets.forEach(socketId => {
      io.to(socketId).emit('notification', notification);
    });
  }
};

export const sendNotificationToOrganization = (organizationId: string, notification: any, excludeUserId?: string) => {
  const io = (global as any).io;
  if (!io) return;

  if (excludeUserId) {
    io.to(`org:${organizationId}`).except(connectedUsers.get(excludeUserId) || []).emit('notification', notification);
  } else {
    io.to(`org:${organizationId}`).emit('notification', notification);
  }
};