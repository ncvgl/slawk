import request from 'supertest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import app from '../app.js';
import prisma from '../db.js';
import { initializeWebSocket } from '../websocket/index.js';

describe('User Presence', () => {
  let authToken: string;
  let userId: number;
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let serverPort: number;

  const testUser = {
    email: 'presence-test@example.com',
    password: 'password123',
    name: 'Presence Test User',
  };

  beforeAll(async () => {
    // Start HTTP server with WebSocket
    httpServer = createServer(app);
    io = initializeWebSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        serverPort = typeof address === 'object' && address ? address.port : 3001;
        resolve();
      });
    });
  });

  afterAll(async () => {
    io.close();
    httpServer.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.directMessage.deleteMany();
    await prisma.reaction.deleteMany();
    await prisma.file.deleteMany();
    await prisma.message.deleteMany();
    await prisma.channelRead.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    const userRes = await request(app).post('/auth/register').send(testUser);
    authToken = userRes.body.token;
    userId = userRes.body.user.id;
  });

  describe('GET /users/:id/presence', () => {
    it('should return user presence status', async () => {
      const res = await request(app)
        .get(`/users/${userId}/presence`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('lastSeen');
      expect(res.body).toHaveProperty('isOnline');
      expect(res.body.userId).toBe(userId);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .get('/users/99999/presence')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/users/${userId}/presence`);

      expect(res.status).toBe(401);
    });

    it('should return invalid user ID error', async () => {
      const res = await request(app)
        .get('/users/invalid/presence')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid/i);
    });
  });

  describe('WebSocket Presence', () => {
    let clientSocket: ClientSocket;

    afterEach(() => {
      if (clientSocket?.connected) {
        clientSocket.disconnect();
      }
    });

    it('should mark user online when connected', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token: authToken },
      });

      clientSocket.on('connect', async () => {
        // Give the server time to update the database
        await new Promise((resolve) => setTimeout(resolve, 100));

        const res = await request(app)
          .get(`/users/${userId}/presence`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(res.body.isOnline).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should mark user offline and update lastSeen on disconnect', (done) => {
      clientSocket = Client(`http://localhost:${serverPort}`, {
        auth: { token: authToken },
      });

      clientSocket.on('connect', async () => {
        // Give server time to mark online
        await new Promise((resolve) => setTimeout(resolve, 100));

        const beforeDisconnect = new Date();
        clientSocket.disconnect();

        // Wait for disconnect to be processed
        await new Promise((resolve) => setTimeout(resolve, 200));

        const res = await request(app)
          .get(`/users/${userId}/presence`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(res.body.isOnline).toBe(false);
        expect(new Date(res.body.lastSeen).getTime()).toBeGreaterThanOrEqual(
          beforeDisconnect.getTime() - 1000
        );
        done();
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('should stay online with multiple connections', (done) => {
      const socket1 = Client(`http://localhost:${serverPort}`, {
        auth: { token: authToken },
      });

      const socket2 = Client(`http://localhost:${serverPort}`, {
        auth: { token: authToken },
      });

      let connected = 0;

      const onConnect = async () => {
        connected++;
        if (connected === 2) {
          // Both connected, disconnect socket1
          await new Promise((resolve) => setTimeout(resolve, 100));
          socket1.disconnect();

          // Wait for disconnect to be processed
          await new Promise((resolve) => setTimeout(resolve, 200));

          // User should still be online (socket2 connected)
          const res = await request(app)
            .get(`/users/${userId}/presence`)
            .set('Authorization', `Bearer ${authToken}`);

          expect(res.body.isOnline).toBe(true);

          socket2.disconnect();
          done();
        }
      };

      socket1.on('connect', onConnect);
      socket2.on('connect', onConnect);

      socket1.on('connect_error', (err) => done(err));
      socket2.on('connect_error', (err) => done(err));
    });

    it('should broadcast presence:update to shared channel members', (done) => {
      // Create user2 and have them join same channel
      let user2Token: string;
      let channelId: number;

      const setup = async () => {
        // Create channel
        const channelRes = await request(app)
          .post('/channels')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'presence-test-channel' });
        channelId = channelRes.body.id;

        // Create user2
        const user2Res = await request(app).post('/auth/register').send({
          email: 'presence-user2@example.com',
          password: 'password123',
          name: 'Presence User 2',
        });
        user2Token = user2Res.body.token;

        // User2 joins channel
        await request(app)
          .post(`/channels/${channelId}/join`)
          .set('Authorization', `Bearer ${user2Token}`);

        // User2 connects to WebSocket
        const socket2 = Client(`http://localhost:${serverPort}`, {
          auth: { token: user2Token },
        });

        socket2.on('connect', () => {
          // Listen for presence updates from user1
          socket2.on('presence:update', (data) => {
            expect(data).toHaveProperty('userId');
            expect(data).toHaveProperty('status');
            socket2.disconnect();
            clientSocket.disconnect();
            done();
          });

          // User1 connects - should trigger presence:update to user2
          clientSocket = Client(`http://localhost:${serverPort}`, {
            auth: { token: authToken },
          });
        });

        socket2.on('connect_error', (err) => done(err));
      };

      setup().catch(done);
    });
  });
});
