/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                      PASTORINI API                            ║
 * ║         PostgreSQL Auth State for Baileys Sessions            ║
 * ║                     © 2025 Pastorini                          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
import { proto } from '../../WAProto';
import { initAuthCreds } from '../Utils/auth-utils.js';
import { BufferJSON } from '../Utils/index.js';
/**
 * Stores the full authentication state in PostgreSQL
 * Far superior for scaling compared to file-based storage
 */
export const usePostgresAuthState = async (pool, sessionId) => {
    // Ensure tables exist
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
    // Create index for faster lookups
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_wa_sessions_session_id 
        ON wa_sessions(session_id)
    `).catch(() => { }); // Ignore if exists
    const writeData = async (key, data) => {
        const value = JSON.stringify(data, BufferJSON.replacer);
        await pool.query(`INSERT INTO wa_sessions (session_id, data_key, data_value, updated_at) 
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (session_id, data_key) 
             DO UPDATE SET data_value = $3, updated_at = CURRENT_TIMESTAMP`, [sessionId, key, value]);
    };
    const readData = async (key) => {
        const result = await pool.query('SELECT data_value FROM wa_sessions WHERE session_id = $1 AND data_key = $2', [sessionId, key]);
        if (result.rows.length === 0)
            return null;
        return JSON.parse(result.rows[0].data_value, BufferJSON.reviver);
    };
    const removeData = async (key) => {
        await pool.query('DELETE FROM wa_sessions WHERE session_id = $1 AND data_key = $2', [sessionId, key]);
    };
    // Load or initialize credentials
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
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
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
 * Delete all session data for a given session ID
 */
export const deletePostgresSession = async (pool, sessionId) => {
    await pool.query('DELETE FROM wa_sessions WHERE session_id = $1', [sessionId]);
};
/**
 * List all session IDs in the database
 */
export const listPostgresSessions = async (pool) => {
    // Ensure table exists before querying
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
    const result = await pool.query('SELECT DISTINCT session_id FROM wa_sessions');
    return result.rows.map(row => row.session_id);
};
//# sourceMappingURL=usePostgresAuthState.js.map