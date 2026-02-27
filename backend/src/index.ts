import { createServer } from 'http';
import app from './app.js';
import { initializeWebSocket } from './websocket/index.js';

const PORT = process.env.PORT || 3000;

const server = createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
