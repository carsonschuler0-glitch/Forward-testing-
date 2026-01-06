import { Pool, PoolClient, QueryResult } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PostgreSQL Database Client
 * Manages connection pool and provides query interface
 */
export class DatabaseClient {
  private pool: Pool;
  private static instance: DatabaseClient;

  private constructor() {
    const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;

    if (!connectionString) {
      console.warn('⚠️  No DATABASE_URL found. Running without persistent storage.');
      // Create a dummy pool that won't actually connect
      this.pool = new Pool({
        max: 0,
        connectionString: 'postgresql://localhost/dummy'
      });
    } else {
      this.pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
      });

      // Test connection
      this.pool.on('error', (err) => {
        console.error('❌ Unexpected database error:', err);
      });

      this.testConnection();
    }
  }

  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  private async testConnection(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('✅ Database connected successfully');
    } catch (error: any) {
      console.error('❌ Database connection failed:', error.message);
    }
  }

  public async initialize(): Promise<void> {
    const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;
    if (!connectionString) {
      console.log('⚠️  Skipping database initialization (no DATABASE_URL)');
      return;
    }

    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await this.query(schema);
      console.log('✅ Database schema initialized');
    } catch (error: any) {
      console.error('❌ Failed to initialize database schema:', error.message);
      throw error;
    }
  }

  public async query(text: string, params?: any[]): Promise<QueryResult<any>> {
    const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;
    if (!connectionString) {
      // Return empty result if no database
      return {
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: []
      } as QueryResult<any>;
    }

    try {
      return await this.pool.query(text, params);
    } catch (error: any) {
      console.error('❌ Query error:', error.message);
      throw error;
    }
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;
    if (!connectionString) {
      throw new Error('Database not configured');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public isConfigured(): boolean {
    return !!(process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL);
  }
}

export const db = DatabaseClient.getInstance();
