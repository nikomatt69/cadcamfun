// SQL Client for Tauri SQL Plugin
// Handles both PostgreSQL and SQLite connections with proper lifecycle management

import { invoke } from '@tauri-apps/api/core';

// Extend Window interface for Tauri
declare global {
    interface Window {
        __TAURI_INTERNALS__?: any;
    }
}

let Database: any = null;

// Dynamically import the SQL plugin only in desktop environment
const loadSqlPlugin = async () => {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
        try {
            const sqlModule = await import('@tauri-apps/plugin-sql');
            Database = sqlModule.default;
            return sqlModule;
        } catch (error) {
            console.warn('⚠️ SQL Plugin not available:', error);
            return null;
        }
    }
    return null;
};

export interface DatabaseConnectionInfo {
    connectionType: 'postgresql' | 'sqlite' | 'http_only';
    localDbPath: string;
    isOffline: boolean;
    hasAuthToken: boolean;
}

export interface SqlQueryResult {
    success: boolean;
    data?: any[];
    error?: string;
    rowsAffected?: number;
}

export class TauriSqlClient {
    private db: any = null;
    private connectionInfo: DatabaseConnectionInfo | null = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;

    constructor() {
        // Do not automatically initialize in the constructor
    }

    /**
     * Initialize the SQL client with proper connection detection.
     * This should be called explicitly.
     */
    async init(): Promise<void> {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this.initialize();
        return this.initPromise;
    }

    /**
     * Initialize the SQL client with proper connection detection
     */
    private async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Load SQL plugin
            const sqlModule = await loadSqlPlugin();
            if (!sqlModule) {
                console.warn('🌐 SQL Plugin not available, using HTTP-only mode');
                this.isInitialized = true;
                return;
            }

            // Get connection info from Rust backend
            this.connectionInfo = await invoke<DatabaseConnectionInfo>('get_db_connection_info');
            console.log('🔗 Database connection info:', this.connectionInfo);

            // Establish connection based on type
            await this.establishConnection();

            this.isInitialized = true;
            console.log('✅ SQL Client initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize SQL client:', error);
            this.isInitialized = true; // Mark as initialized even on failure
        } finally {
            this.initPromise = null;
        }
    }

    /**
     * Establish database connection based on detected type
     */
    private async establishConnection(): Promise<void> {
        if (!this.connectionInfo || !Database) return;

        try {
            switch (this.connectionInfo.connectionType) {
                case 'postgresql':
                    await this.connectPostgreSQL();
                    break;
                case 'sqlite':
                    await this.connectSQLite();
                    break;
                case 'http_only':
                    console.log('🌐 Running in HTTP-only mode, no local database');
                    break;
                default:
                    throw new Error(`Unknown connection type: ${this.connectionInfo.connectionType}`);
            }
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            // Fallback to SQLite if PostgreSQL fails
            if (this.connectionInfo.connectionType === 'postgresql') {
                console.log('🔄 Falling back to SQLite...');
                await this.connectSQLite();
            }
        }
    }

    /**
     * Connect to PostgreSQL database
     */
    private async connectPostgreSQL(): Promise<void> {
        const dbPath = await invoke<string>('get_local_db_path');
        console.log('🐘 Connecting to PostgreSQL:', dbPath.substring(0, 30) + '...');

        this.db = await Database.open(dbPath);
        console.log('✅ PostgreSQL connection established');
    }

    /**
     * Connect to SQLite database
     */
    private async connectSQLite(): Promise<void> {
        const dbPath = await invoke<string>('get_local_db_path');
        console.log('💾 Connecting to SQLite:', dbPath);

        this.db = await Database.open(dbPath);

        // Initialize SQLite schema
        await this.initializeSQLiteSchema();
        console.log('✅ SQLite connection established');
    }

    /**
     * Initialize SQLite schema for local caching
     */
    private async initializeSQLiteSchema(): Promise<void> {
        if (!this.db) return;

        const schemas = [
            // Users cache table
            `CREATE TABLE IF NOT EXISTS users_cache (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        image TEXT,
        created_at TEXT,
        updated_at TEXT,
        last_synced TEXT DEFAULT CURRENT_TIMESTAMP
      )`,

            // Projects cache table
            `CREATE TABLE IF NOT EXISTS projects_cache (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT,
        organization_id TEXT,
        is_public BOOLEAN DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        last_synced TEXT DEFAULT CURRENT_TIMESTAMP
      )`,

            // Sync queue table
            `CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        synced BOOLEAN DEFAULT 0,
        retries INTEGER DEFAULT 0
      )`,

            // Settings table
            `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,

            // Create indexes for performance
            `CREATE INDEX IF NOT EXISTS idx_users_email ON users_cache(email)`,
            `CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects_cache(owner_id)`,
            `CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced)`,
        ];

        for (const schema of schemas) {
            try {
                await this.db.execute(schema);
            } catch (error) {
                console.error('❌ Failed to create schema:', error);
            }
        }

        console.log('📋 SQLite schema initialized');
    }

    /**
     * Execute a SQL query
     */
    async query<T = any>(sql: string, params?: any[]): Promise<SqlQueryResult> {
        await this.ensureInitialized();

        if (!this.db) {
            return {
                success: false,
                error: 'No database connection available'
            };
        }

        try {
            const result = await this.db.select(sql, params || []) as T[];
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('❌ SQL Query failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown SQL error'
            };
        }
    }

    /**
     * Execute a SQL command (INSERT, UPDATE, DELETE)
     */
    async execute(sql: string, params?: any[]): Promise<SqlQueryResult> {
        await this.ensureInitialized();

        if (!this.db) {
            return {
                success: false,
                error: 'No database connection available'
            };
        }

        try {
            const result = await this.db.execute(sql, params || []);
            return {
                success: true,
                rowsAffected: result.rowsAffected || 0
            };
        } catch (error) {
            console.error('❌ SQL Execute failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown SQL error'
            };
        }
    }

    /**
     * Get cached user data
     */
    async getCachedUser(email: string): Promise<any | null> {
        const result = await this.query(
            'SELECT * FROM users_cache WHERE email = ? LIMIT 1',
            [email]
        );

        return result.success && result.data && result.data.length > 0
            ? result.data[0]
            : null;
    }

    /**
     * Cache user data
     */
    async cacheUser(user: any): Promise<boolean> {
        const result = await this.execute(
            `INSERT OR REPLACE INTO users_cache 
       (id, name, email, image, created_at, updated_at, last_synced) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [user.id, user.name, user.email, user.image, user.created_at, user.updated_at]
        );

        return result.success;
    }

    /**
     * Get cached projects
     */
    async getCachedProjects(userId: string): Promise<any[]> {
        const result = await this.query(
            'SELECT * FROM projects_cache WHERE owner_id = ? ORDER BY updated_at DESC',
            [userId]
        );

        return result.success && result.data ? result.data : [];
    }

    /**
     * Cache project data
     */
    async cacheProject(project: any): Promise<boolean> {
        const result = await this.execute(
            `INSERT OR REPLACE INTO projects_cache 
       (id, name, description, owner_id, organization_id, is_public, created_at, updated_at, last_synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                project.id,
                project.name,
                project.description,
                project.owner_id,
                project.organization_id,
                project.is_public,
                project.created_at,
                project.updated_at
            ]
        );

        return result.success;
    }

    /**
     * Add operation to sync queue
     */
    async addToSyncQueue(operation: {
        id: string;
        operation_type: string;
        endpoint: string;
        data: any;
    }): Promise<boolean> {
        const result = await this.execute(
            `INSERT INTO sync_queue (id, operation_type, endpoint, data, timestamp, synced, retries)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, 0)`,
            [operation.id, operation.operation_type, operation.endpoint, JSON.stringify(operation.data)]
        );

        return result.success;
    }

    /**
     * Get pending sync operations
     */
    async getPendingSyncOperations(): Promise<any[]> {
        const result = await this.query(
            'SELECT * FROM sync_queue WHERE synced = 0 AND retries < 3 ORDER BY timestamp ASC'
        );

        return result.success && result.data ? result.data : [];
    }

    /**
     * Mark sync operation as completed
     */
    async markSyncOperationCompleted(id: string): Promise<boolean> {
        const result = await this.execute(
            'UPDATE sync_queue SET synced = 1 WHERE id = ?',
            [id]
        );

        return result.success;
    }

    /**
     * Set app setting
     */
    async setSetting(key: string, value: string): Promise<boolean> {
        const result = await this.execute(
            'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [key, value]
        );

        return result.success;
    }

    /**
     * Get app setting
     */
    async getSetting(key: string): Promise<string | null> {
        const result = await this.query(
            'SELECT value FROM app_settings WHERE key = ? LIMIT 1',
            [key]
        );

        return result.success && result.data && result.data.length > 0
            ? result.data[0].value
            : null;
    }

    /**
     * Get connection info
     */
    getConnectionInfo(): DatabaseConnectionInfo | null {
        return this.connectionInfo;
    }

    /**
     * Check if database is available
     */
    isAvailable(): boolean {
        return this.db !== null;
    }

    /**
     * Close database connection
     */
    async close(): Promise<void> {
        if (this.db) {
            try {
                await this.db.close();
                console.log('🔒 Database connection closed');
            } catch (error) {
                console.error('❌ Error closing database:', error);
            }
            this.db = null;
        }
    }

    /**
     * Ensure client is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
    }
}

// Singleton instance
let sqlClient: TauriSqlClient | null = null;

/**
 * Get or create the singleton SQL client
 */
export const getSqlClient = (): TauriSqlClient => {
    if (!sqlClient) {
        sqlClient = new TauriSqlClient();
    }
    return sqlClient;
};

/**
 * Initializes and returns the SQL client instance.
 * Ensures that initialization is only attempted once.
 * @returns {Promise<TauriSqlClient>}
 */
export const initializeSqlClient = async (): Promise<TauriSqlClient> => {
    const sqlClient = getSqlClient();
    await sqlClient.init(); // Explicitly call init

    // Setup cleanup on page unload, ensuring it runs only once
    if (typeof window !== 'undefined' && !(window as any).__SQL_CLIENT_LIFECYCLE_SET__) {
        (window as any).__SQL_CLIENT_LIFECYCLE_SET__ = true;

        window.addEventListener('beforeunload', () => {
            sqlClient.close();
        });

        // Setup Tauri close event handler
        if (window.__TAURI_INTERNALS__) {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                listen('tauri://close-requested', () => {
                    sqlClient.close();
                });
            } catch (error) {
                console.warn('⚠️ Could not setup Tauri close handler:', error);
            }
        }
    }

    return sqlClient;
};

// Export default client
export default getSqlClient;