// Docker Manager - Gestisce PostgreSQL Docker tramite Tauri commands

import { invoke } from '@tauri-apps/api/core';
import React from 'react';

export interface DockerStatus {
    dockerRunning: boolean;
    postgresRunning: boolean;
    error?: string;
}

export class DockerManager {

    /**
     * Controlla se Docker è in esecuzione
     */
    static async checkDockerStatus(): Promise<boolean> {
        try {
            return await invoke<boolean>('check_docker_status');
        } catch (error) {
            console.error('Failed to check Docker status:', error);
            return false;
        }
    }

    /**
     * Controlla se PostgreSQL Docker container è in esecuzione
     */
    static async checkPostgresStatus(): Promise<boolean> {
        try {
            return await invoke<boolean>('check_postgres_docker_status');
        } catch (error) {
            console.error('Failed to check PostgreSQL status:', error);
            return false;
        }
    }

    /**
     * Avvia PostgreSQL Docker container
     */
    static async startPostgres(): Promise<string> {
        try {
            return await invoke<string>('start_postgres_docker');
        } catch (error) {
            console.error('Failed to start PostgreSQL:', error);
            throw error;
        }
    }

    /**
     * Ferma PostgreSQL Docker container
     */
    static async stopPostgres(): Promise<string> {
        try {
            return await invoke<string>('stop_postgres_docker');
        } catch (error) {
            console.error('Failed to stop PostgreSQL:', error);
            throw error;
        }
    }

    /**
     * Ottiene lo stato completo di Docker e PostgreSQL
     */
    static async getFullStatus(): Promise<DockerStatus> {
        try {
            const [dockerRunning, postgresRunning] = await Promise.all([
                this.checkDockerStatus(),
                this.checkPostgresStatus()
            ]);

            return {
                dockerRunning,
                postgresRunning
            };
        } catch (error) {
            return {
                dockerRunning: false,
                postgresRunning: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Avvia PostgreSQL se non è già in esecuzione
     */
    static async ensurePostgresRunning(): Promise<boolean> {
        try {
            // Controlla se Docker è in esecuzione
            const dockerRunning = await this.checkDockerStatus();
            if (!dockerRunning) {
                throw new Error('Docker is not running. Please start Docker Desktop first.');
            }

            // Controlla se PostgreSQL è già in esecuzione
            const postgresRunning = await this.checkPostgresStatus();
            if (postgresRunning) {
                console.log('PostgreSQL is already running');
                return true;
            }

            // Avvia PostgreSQL
            console.log('Starting PostgreSQL...');
            await this.startPostgres();

            // Attendi che sia pronto (con timeout)
            const maxRetries = 30; // 30 secondi
            for (let i = 0; i < maxRetries; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const isRunning = await this.checkPostgresStatus();
                if (isRunning) {
                    console.log('PostgreSQL started successfully');
                    return true;
                }
            }

            throw new Error('PostgreSQL failed to start within timeout');
        } catch (error) {
            console.error('Failed to ensure PostgreSQL is running:', error);
            return false;
        }
    }

    /**
     * Riavvia PostgreSQL
     */
    static async restartPostgres(): Promise<boolean> {
        try {
            console.log('Restarting PostgreSQL...');

            // Ferma se è in esecuzione
            const isRunning = await this.checkPostgresStatus();
            if (isRunning) {
                await this.stopPostgres();
                // Attendi che si fermi
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Avvia di nuovo
            return await this.ensurePostgresRunning();
        } catch (error) {
            console.error('Failed to restart PostgreSQL:', error);
            return false;
        }
    }
}

// Hook React per usare Docker Manager
export function useDockerManager() {
    const [status, setStatus] = React.useState<DockerStatus>({
        dockerRunning: false,
        postgresRunning: false
    });
    const [loading, setLoading] = React.useState(false);

    const refreshStatus = React.useCallback(async () => {
        setLoading(true);
        try {
            const newStatus = await DockerManager.getFullStatus();
            setStatus(newStatus);
        } finally {
            setLoading(false);
        }
    }, []);

    const startPostgres = React.useCallback(async () => {
        setLoading(true);
        try {
            const success = await DockerManager.ensurePostgresRunning();
            if (success) {
                await refreshStatus();
            }
            return success;
        } finally {
            setLoading(false);
        }
    }, [refreshStatus]);

    const stopPostgres = React.useCallback(async () => {
        setLoading(true);
        try {
            await DockerManager.stopPostgres();
            await refreshStatus();
            return true;
        } catch (error) {
            console.error('Failed to stop PostgreSQL:', error);
            return false;
        } finally {
            setLoading(false);
        }
    }, [refreshStatus]);

    React.useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    return {
        status,
        loading,
        refreshStatus,
        startPostgres,
        stopPostgres,
        restartPostgres: React.useCallback(async () => {
            setLoading(true);
            try {
                const success = await DockerManager.restartPostgres();
                if (success) {
                    await refreshStatus();
                }
                return success;
            } finally {
                setLoading(false);
            }
        }, [refreshStatus])
    };
} 