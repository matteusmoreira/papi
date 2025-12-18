/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                      PASTORINI API                            ║
 * ║              Database Connection Manager                      ║
 * ║                     © 2025 Pastorini                          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
let pgPool = null;
let redisClient = null;
let currentConfig = null;
/**
 * Get database configuration from environment variables
 */
export function getDatabaseConfig() {
    const storageType = (process.env.STORAGE_TYPE || 'file');
    const config = {
        storageType
    };
    if (storageType === 'postgres' || storageType === 'postgres+redis') {
        config.postgres = {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            database: process.env.POSTGRES_DB || 'pastorini_api',
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || '',
            ssl: process.env.POSTGRES_SSL === 'true'
        };
    }
    if (storageType === 'postgres+redis') {
        config.redis = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB || '0')
        };
    }
    return config;
}
/**
 * Initialize database connections
 */
export async function initDatabase(config) {
    currentConfig = config || getDatabaseConfig();
    console.log(`[Database] Initializing with storage type: ${currentConfig.storageType}`);
    if (currentConfig.storageType === 'postgres' || currentConfig.storageType === 'postgres+redis') {
        if (!currentConfig.postgres) {
            throw new Error('PostgreSQL configuration is required');
        }
        console.log(`[Database] Connecting to PostgreSQL: ${currentConfig.postgres.user}@${currentConfig.postgres.host}:${currentConfig.postgres.port}/${currentConfig.postgres.database}`);
        console.log(`[Database] Password length: ${currentConfig.postgres.password?.length || 0}`);
        pgPool = new Pool({
            host: currentConfig.postgres.host,
            port: currentConfig.postgres.port,
            database: currentConfig.postgres.database,
            user: currentConfig.postgres.user,
            password: currentConfig.postgres.password,
            ssl: currentConfig.postgres.ssl ? { rejectUnauthorized: false } : false,
            max: 20, // Maximum connections in pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000
        });
        // Test connection
        try {
            const client = await pgPool.connect();
            console.log('[Database] PostgreSQL connected successfully');
            client.release();
        }
        catch (error) {
            console.error('[Database] PostgreSQL connection failed:', error);
            throw error;
        }
    }
    if (currentConfig.storageType === 'postgres+redis') {
        if (!currentConfig.redis) {
            throw new Error('Redis configuration is required');
        }
        redisClient = new Redis({
            host: currentConfig.redis.host,
            port: currentConfig.redis.port,
            password: currentConfig.redis.password,
            db: currentConfig.redis.db,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 3000)
        });
        redisClient.on('connect', () => {
            console.log('[Database] Redis connected successfully');
        });
        redisClient.on('error', (error) => {
            console.error('[Database] Redis error:', error);
        });
    }
}
/**
 * Get PostgreSQL pool
 */
export function getPostgresPool() {
    return pgPool;
}
/**
 * Get Redis client
 */
export function getRedisClient() {
    return redisClient;
}
/**
 * Get current storage type
 */
export function getStorageType() {
    return currentConfig?.storageType || 'file';
}
/**
 * Close all database connections
 */
export async function closeDatabase() {
    if (pgPool) {
        await pgPool.end();
        pgPool = null;
        console.log('[Database] PostgreSQL connection closed');
    }
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        console.log('[Database] Redis connection closed');
    }
}
//# sourceMappingURL=database.js.map