import express, { Express, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import path from 'path';
import { AlertData, Market, TraderStats, Trade } from '../types';

export class WebServer {
  private app: Express;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private port: number;
  private recentAlerts: AlertData[] = [];
  private recentTrades: Trade[] = [];
  private maxStoredAlerts = 100;
  private maxStoredTrades = 200;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer);

    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupRoutes(): void {
    // Serve static files from public directory
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // API endpoint for bot status
    this.app.get('/api/status', (req: Request, res: Response) => {
      res.json({
        status: 'running',
        uptime: process.uptime(),
        timestamp: Date.now(),
      });
    });

    // API endpoint for recent alerts
    this.app.get('/api/alerts', (req: Request, res: Response) => {
      res.json(this.recentAlerts);
    });

    // API endpoint for recent trades
    this.app.get('/api/trades', (req: Request, res: Response) => {
      res.json(this.recentTrades);
    });

    // Serve the dashboard HTML
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('📱 Web client connected');

      // Send initial data
      socket.emit('initial-data', {
        alerts: this.recentAlerts,
        trades: this.recentTrades,
      });

      socket.on('disconnect', () => {
        console.log('📱 Web client disconnected');
      });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`🌐 Web dashboard available at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    this.httpServer.close();
    this.io.close();
  }

  // Emit events to connected clients
  emitAlert(alert: AlertData): void {
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > this.maxStoredAlerts) {
      this.recentAlerts = this.recentAlerts.slice(0, this.maxStoredAlerts);
    }
    this.io.emit('new-alert', alert);
  }

  emitTrade(trade: Trade): void {
    this.recentTrades.unshift(trade);
    if (this.recentTrades.length > this.maxStoredTrades) {
      this.recentTrades = this.recentTrades.slice(0, this.maxStoredTrades);
    }
    this.io.emit('new-trade', trade);
  }

  emitMarkets(markets: Market[]): void {
    this.io.emit('markets-update', markets);
  }

  emitStats(stats: {
    marketsTracked: number;
    tradersTracked: number;
    processedTrades: number;
    topPercentileThreshold: number;
  }): void {
    this.io.emit('stats-update', stats);
  }

  emitTraders(traders: Map<string, TraderStats>): void {
    const tradersArray = Array.from(traders.values())
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 50); // Top 50 traders
    this.io.emit('traders-update', tradersArray);
  }

  emitBotStatus(status: 'starting' | 'running' | 'error', message?: string): void {
    this.io.emit('bot-status', { status, message, timestamp: Date.now() });
  }
}
