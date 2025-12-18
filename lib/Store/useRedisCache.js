/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                      PASTORINI API                            ║
 * ║              Redis Cache Layer for Sessions                   ║
 * ║                     © 2025 Pastorini                          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
import { proto } from '../../WAProto';
import { BufferJSON } from '../Utils/index.js';
const CACHE_TTL = 3600; // 1 hour cache TTL
/**
 * Redis-cached PostgreSQL auth state
 * Uses Redis as L1 cache and PostgreSQL as persistent storage
 * Best of both worlds: speed + durability
 */
export const useRedisCachedAuthState = async (redis, pool, sessionId) => {
    const cacheKey = (key) => `wa:${sessionId}:${key}`;
    // Ensure PostgreSQL tables exist
    await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_sessions (
            session_id VARCHAR(255) NOT NULL,
            data_key VARCHAR(255) NOT NULL,
            data_value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (session_id, data_key)
        )
    `);
    const writeData = async (key, data) => {
        const value = JSON.stringify(data, BufferJSON.replacer);
        // Write to Redis cache
        await redis.setex(cacheKey(key), CACHE_TTL, value);
        // Write to PostgreSQL (async, non-blocking)
        pool.query(`INSERT INTO wa_sessions (session_id, data_key, data_value, updated_at) 
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (session_id, data_key) 
             DO UPDATE SET data_value = $3, updated_at = CURRENT_TIMESTAMP`, [sessionId, key, value]).catch(err => console.error(`[Redis+PG] Error writing to PG:`, err));
    };
    const readData = async (key) => {
        // Try Redis first (L1 cache)
        const cached = await redis.get(cacheKey(key));
        if (cached) {
            return JSON.parse(cached, BufferJSON.reviver);
        }
        // Fallback to PostgreSQL
        const result = await pool.query('SELECT data_value FROM wa_sessions WHERE session_id = $1 AND data_key = $2', [sessionId, key]);
        if (result.rows.length === 0)
            return null;
        const value = result.rows[0].data_value;
        // Populate cache for next time
        await redis.setex(cacheKey(key), CACHE_TTL, value);
        return JSON.parse(value, BufferJSON.reviver);
    };
    const removeData = async (key) => {
        // Remove from both
        await Promise.all([
            redis.del(cacheKey(key)),
            pool.query('DELETE FROM wa_sessions WHERE session_id = $1 AND data_key = $2', [sessionId, key])
        ]);
    };
    // Load or initialize credentials
    const { initAuthCreds } = await import('../Utils/auth-utils.js');
    let creds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData('creds', creds);
    }
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    // Batch get from Redis
                    const keys = ids.map(id => cacheKey(`${type}-${id}`));
                    const cached = await redis.mget(...keys);
                    await Promise.all(ids.map(async (id, index) => {
                        let value = null;
                        if (cached[index]) {
                            value = JSON.parse(cached[index], BufferJSON.reviver);
                        }
                        else {
                            // Fallback to PostgreSQL
                            value = await readData(`${type}-${id}`);
                        }
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        const categoryData = data[category];
                        if (categoryData) {
                            for (const id in categoryData) {
                                const value = categoryData[id];
                                const key = `${category}-${id}`;
                                tasks.push(value ? writeData(key, value) : removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData('creds', creds);
        }
    };
};
/**
 * Delete all session data from both Redis and PostgreSQL
 */
export const deleteRedisCachedSession = async (redis, pool, sessionId) => {
    // Delete from Redis (pattern match)
    const keys = await redis.keys(`wa:${sessionId}:*`);
    if (keys.length > 0) {
        await redis.del(...keys);
    }
    // Delete from PostgreSQL
    await pool.query('DELETE FROM wa_sessions WHERE session_id = $1', [sessionId]);
};
//# sourceMappingURL=useRedisCache.js.map