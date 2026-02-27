import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import app from '../app.js';
import prisma from '../db.js';
import { initializeWebSocket } from '../websocket/index.js';

describe('WebSocket', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let clientSocket: ClientSocket;
  let authToken: string;
  let channelId: number;
  let port: number;

  const testUser = {
    email: 'ws-test@example.com',
    password: 'password123',
    name: 'WebSocket Test User',
  };

  beforeAll(async () => {
    // Clean database
    await prisma.message.deleteMany();
    await prisma.channelMember.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.user.deleteMany();

    // Create user and get token
    const userRes = await request(app).post('/auth/register').send(testUser);
    authToken = userRes.body.token;

    // Create channel
    const channelRes = await request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'ws-test-channel' });
    channelId = channelRes.body.id;

    // Start HTTP server with WebSocket
    httpServer = createServer(app);
    io = initializeWebSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const address = httpServer.address();
        port = typeof address === 'object' && address ? address.port : 3001;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    io.close();
    httpServer.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  it('should connect with valid token', (done) => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: authToken },
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });

    clientSocket.on('connect_error', (err) => {
      done(err);
    });
  });

  it('should reject connection without token', (done) => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: {},
    });

    clientSocket.on('connect', () => {
      done(new Error('Should not connect'));
    });

    clientSocket.on('connect_error', (err) => {
      expect(err.message).toBe('Authentication required');
      done();
    });
  });

  it('should reject connection with invalid token', (done) => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: 'invalid-token' },
    });

    clientSocket.on('connect', () => {
      done(new Error('Should not connect'));
    });

    clientSocket.on('connect_error', (err) => {
      expect(err.message).toBe('Invalid token');
      done();
    });
  });

  it('should join a channel room', (done) => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: authToken },
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('join:channel', channelId);
      // Give it a moment to join
      setTimeout(() => {
        done();
      }, 100);
    });
  });

  it('should send and receive messages', (done) => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: authToken },
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('join:channel', channelId);

      clientSocket.on('message:new', (message) => {
        expect(message.content).toBe('Hello via WebSocket!');
        expect(message.channelId).toBe(channelId);
        done();
      });

      // Wait a bit for join to complete, then send message
      setTimeout(() => {
        clientSocket.emit('message:send', {
          channelId,
          content: 'Hello via WebSocket!',
        });
      }, 100);
    });
  });

  it('should broadcast typing indicators', (done) => {
    // Create second user
    let secondToken: string;
    let clientSocket2: ClientSocket;

    request(app)
      .post('/auth/register')
      .send({
        email: 'ws-test2@example.com',
        password: 'password123',
        name: 'WebSocket Test User 2',
      })
      .then((res) => {
        secondToken = res.body.token;
        return request(app)
          .post(`/channels/${channelId}/join`)
          .set('Authorization', `Bearer ${secondToken}`);
      })
      .then(() => {
        // Connect both clients
        clientSocket = Client(`http://localhost:${port}`, {
          auth: { token: authToken },
        });

        clientSocket.on('connect', () => {
          clientSocket.emit('join:channel', channelId);

          clientSocket2 = Client(`http://localhost:${port}`, {
            auth: { token: secondToken },
          });

          clientSocket2.on('connect', () => {
            clientSocket2.emit('join:channel', channelId);

            // Listen for typing indicator on client1
            clientSocket.on('typing:start', (data) => {
              expect(data.email).toBe('ws-test2@example.com');
              clientSocket2.disconnect();
              done();
            });

            // Client2 starts typing
            setTimeout(() => {
              clientSocket2.emit('typing:start', channelId);
            }, 100);
          });
        });
      });
  });

  it('should only receive messages in joined channel room', (done) => {
    let secondToken: string;
    let channel2Id: number;
    let clientSocket2: ClientSocket;
    let receivedInChannel1 = false;
    let receivedInChannel2 = false;

    // Create second user and second channel
    request(app)
      .post('/auth/register')
      .send({
        email: 'ws-room-test@example.com',
        password: 'password123',
        name: 'Room Test User',
      })
      .then((res) => {
        secondToken = res.body.token;
        // Create second channel
        return request(app)
          .post('/channels')
          .set('Authorization', `Bearer ${secondToken}`)
          .send({ name: 'ws-test-channel-2' });
      })
      .then((res) => {
        channel2Id = res.body.id;

        // Connect client 1 to channel 1
        clientSocket = Client(`http://localhost:${port}`, {
          auth: { token: authToken },
        });

        clientSocket.on('connect', () => {
          clientSocket.emit('join:channel', channelId);

          clientSocket.on('message:new', (message) => {
            if (message.channelId === channelId) {
              receivedInChannel1 = true;
            }
            if (message.channelId === channel2Id) {
              receivedInChannel2 = true;
            }
          });

          // Connect client 2 to channel 2
          clientSocket2 = Client(`http://localhost:${port}`, {
            auth: { token: secondToken },
          });

          clientSocket2.on('connect', () => {
            clientSocket2.emit('join:channel', channel2Id);

            // Wait for joins to complete
            setTimeout(() => {
              // Send message to channel 2
              clientSocket2.emit('message:send', {
                channelId: channel2Id,
                content: 'Message to channel 2',
              });

              // Wait and check results
              setTimeout(() => {
                // Client 1 should NOT have received the message from channel 2
                expect(receivedInChannel2).toBe(false);
                clientSocket2.disconnect();
                done();
              }, 200);
            }, 100);
          });
        });
      });
  });

  it('should receive messages after joining multiple channels', (done) => {
    let channel2Id: number;
    let receivedMessages: any[] = [];

    // Create second channel with same user
    request(app)
      .post('/channels')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'ws-multi-channel' })
      .then((res) => {
        channel2Id = res.body.id;

        clientSocket = Client(`http://localhost:${port}`, {
          auth: { token: authToken },
        });

        clientSocket.on('connect', () => {
          // Join both channels
          clientSocket.emit('join:channel', channelId);
          clientSocket.emit('join:channel', channel2Id);

          clientSocket.on('message:new', (message) => {
            receivedMessages.push(message);
          });

          // Wait for joins to complete
          setTimeout(() => {
            // Send message to channel 1
            clientSocket.emit('message:send', {
              channelId,
              content: 'Message to channel 1',
            });

            // Send message to channel 2
            clientSocket.emit('message:send', {
              channelId: channel2Id,
              content: 'Message to channel 2',
            });

            // Wait and check results
            setTimeout(() => {
              expect(receivedMessages.length).toBe(2);
              const channelIds = receivedMessages.map((m) => m.channelId);
              expect(channelIds).toContain(channelId);
              expect(channelIds).toContain(channel2Id);
              done();
            }, 200);
          }, 100);
        });
      });
  });
});
