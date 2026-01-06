import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { ForwardTestRunner } from '../forwardTest/runner';
import { ForwardTestAnalysis } from '../forwardTest/types';

/**
 * Web server for Forward Test Dashboard
 */
export class DashboardServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private runner: ForwardTestRunner;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server);
    this.runner = new ForwardTestRunner();
    this.port = port;

    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // Health check for Railway
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // API endpoints
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        uptime: process.uptime(),
        markets: this.runner['activeMarkets'].size,
        trades: this.runner['allTrades'].length,
      });
    });

    // Serve dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('📱 Client connected:', socket.id);

      // Send initial data
      socket.emit('status', {
        markets: this.runner['activeMarkets'].size,
        trades: this.runner['allTrades'].length,
      });

      socket.on('disconnect', () => {
        console.log('📱 Client disconnected:', socket.id);
      });
    });
  }

  /**
   * Broadcast update to all connected clients
   */
  private broadcastUpdate(analysis: ForwardTestAnalysis, newTradesCount: number): void {
    this.io.emit('update', {
      timestamp: Date.now(),
      newTrades: newTradesCount,
      analysis,
      markets: this.runner['activeMarkets'].size,
      totalTrades: this.runner['allTrades'].length,
    });
  }

  /**
   * Start server and forward test runner
   */
  async start(): Promise<void> {
    // Start web server
    this.server.listen(this.port, () => {
      console.log(`\n🌐 Dashboard running at http://localhost:${this.port}`);
      console.log(`📊 Real-time updates via WebSocket\n`);
    });

    // Initialize forward test
    await this.runner.initialize(100); // Track 100 markets

    // Start polling loop
    this.startPollingLoop();
  }

  private async startPollingLoop(): Promise<void> {
    const pollInterval = 60000; // 60 seconds
    let iteration = 0;

    setInterval(async () => {
      iteration++;
      console.log(`\n--- Poll #${iteration} at ${new Date().toLocaleTimeString()} ---`);

      const beforeCount = this.runner['allTrades'].length;

      // Poll for new trades
      await this.runner.pollTrades();
      await this.runner.checkResolvedMarkets();

      const afterCount = this.runner['allTrades'].length;
      const newTrades = afterCount - beforeCount;

      // Generate analysis
      const analysis = this.runner['analyzer'].generateAnalysis(
        this.runner['allTrades'],
        this.runner['activeMarkets'],
        this.runner['snapshots']
      );

      // Broadcast to all clients
      this.broadcastUpdate(analysis, newTrades);

      // Print to console every 10 polls
      if (iteration % 10 === 0) {
        this.runner.printAnalysis();
      }
    }, pollInterval);
  }
}
