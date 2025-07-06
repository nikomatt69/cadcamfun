// src/lib/ai/codeInterpreter/containerManager.ts
import {
  ContainerInfo,
  ContainerFile,
  ContainerCreateRequest,
  ContainerListResponse,
  FileUploadRequest,
  FileUploadResponse
} from "@/src/types/codeInterpreterTypes";

/**
 * Container Manager for OpenAI Code Interpreter
 * Handles container lifecycle, file management, and cleanup
 */
export class ContainerManager {
  private containers: Map<string, ContainerInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CONTAINER_EXPIRY_TIME = 20 * 60 * 1000; // 20 minutes
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.startCleanupTask();
  }

  /**
   * Create a new container
   */
  async createContainer(request: ContainerCreateRequest = {}): Promise<ContainerInfo> {
    try {
      const response = await fetch("/api/ai/code-interpreter/containers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "create",
          name: request.name,
          files: request.files,
          metadata: request.metadata
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create container");
      }

      const containerData = await response.json();
      const containerInfo: ContainerInfo = {
        id: containerData.id,
        name: request.name,
        status: "active",
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.CONTAINER_EXPIRY_TIME).toISOString(),
        fileCount: 0,
        metadata: request.metadata
      };

      this.containers.set(containerInfo.id, containerInfo);
      console.log(`[ContainerManager] Created container: ${containerInfo.id}`);

      return containerInfo;
    } catch (error) {
      console.error("[ContainerManager] Failed to create container:", error);
      throw error;
    }
  }

  /**
   * Get container by ID
   */
  async getContainer(id: string): Promise<ContainerInfo | null> {
    try {
      // Check local cache first
      let container = this.containers.get(id);

      if (!container) {
        // Fetch from API
        const response = await fetch(`/api/ai/code-interpreter/containers/${id}`, {
          method: "GET"
        });

        if (response.ok) {
          const containerData = await response.json();
          container = {
            id: containerData.id,
            name: containerData.name,
            status: this.isExpired(containerData.last_active_at) ? "expired" : "active",
            createdAt: containerData.created_at,
            lastActiveAt: containerData.last_active_at,
            expiresAt: new Date(
              new Date(containerData.last_active_at).getTime() + this.CONTAINER_EXPIRY_TIME
            ).toISOString(),
            fileCount: containerData.file_count || 0,
            metadata: containerData.metadata
          };

          this.containers.set(id, container);
        }
      }

      // Check if container is expired
      if (container && this.isExpired(container.lastActiveAt)) {
        container.status = "expired";
        this.containers.set(id, container);
      }

      return container || null;
    } catch (error) {
      console.error(`[ContainerManager] Failed to get container ${id}:`, error);
      return null;
    }
  }

  /**
   * List all containers
   */
  async listContainers(): Promise<ContainerListResponse> {
    try {
      const response = await fetch("/api/ai/code-interpreter/containers", {
        method: "GET"
      });

      if (!response.ok) {
        throw new Error("Failed to list containers");
      }

      const data = await response.json();
      const containers: ContainerInfo[] = data.containers.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: this.isExpired(c.last_active_at) ? "expired" : "active",
        createdAt: c.created_at,
        lastActiveAt: c.last_active_at,
        expiresAt: new Date(new Date(c.last_active_at).getTime() + this.CONTAINER_EXPIRY_TIME).toISOString(),
        fileCount: c.file_count || 0,
        metadata: c.metadata
      }));

      // Update local cache
      containers.forEach(container => {
        this.containers.set(container.id, container);
      });

      const active = containers.filter(c => c.status === "active").length;
      const expired = containers.filter(c => c.status === "expired").length;

      return {
        containers,
        total: containers.length,
        active,
        expired
      };
    } catch (error) {
      console.error("[ContainerManager] Failed to list containers:", error);
      return {
        containers: Array.from(this.containers.values()),
        total: this.containers.size,
        active: Array.from(this.containers.values()).filter(c => c.status === "active").length,
        expired: Array.from(this.containers.values()).filter(c => c.status === "expired").length
      };
    }
  }

  /**
   * Delete a container
   */
  async deleteContainer(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/ai/code-interpreter/containers/${id}`, {
        method: "DELETE"
      });

      if (response.ok) {
        this.containers.delete(id);
        console.log(`[ContainerManager] Deleted container: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`[ContainerManager] Failed to delete container ${id}:`, error);
      return false;
    }
  }

  /**
   * Upload files to container
   */
  async uploadFiles(request: FileUploadRequest): Promise<FileUploadResponse> {
    try {
      const formData = new FormData();
      formData.append("containerId", request.containerId);

      request.files.forEach((file, index) => {
        const blob = new Blob([file.content], { type: file.contentType });
        formData.append(`file_${index}`, blob, file.name);
      });

      const response = await fetch("/api/ai/code-interpreter/files/upload", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload files");
      }

      const result = await response.json();

      // Update container file count
      const container = this.containers.get(request.containerId);
      if (container) {
        container.fileCount = (container.fileCount || 0) + result.uploadedFiles.length;
        container.lastActiveAt = new Date().toISOString();
        this.containers.set(request.containerId, container);
      }

      return result;
    } catch (error) {
      console.error("[ContainerManager] Failed to upload files:", error);
      return {
        success: false,
        uploadedFiles: [],
        errors: [error instanceof Error ? error.message : "Upload failed"]
      };
    }
  }

  /**
   * Download file from container
   */
  async downloadFile(containerId: string, fileId: string): Promise<Blob | null> {
    try {
      const response = await fetch(`/api/ai/code-interpreter/files/${fileId}?containerId=${containerId}`);

      if (response.ok) {
        return await response.blob();
      }

      return null;
    } catch (error) {
      console.error(`[ContainerManager] Failed to download file ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Get files in container
   */
  async getContainerFiles(containerId: string): Promise<ContainerFile[]> {
    try {
      const response = await fetch(`/api/ai/code-interpreter/containers/${containerId}/files`);

      if (response.ok) {
        const data = await response.json();
        return data.files || [];
      }

      return [];
    } catch (error) {
      console.error(`[ContainerManager] Failed to get container files:`, error);
      return [];
    }
  }

  /**
   * Update container activity timestamp
   */
  async updateActivity(containerId: string): Promise<void> {
    const container = this.containers.get(containerId);
    if (container) {
      container.lastActiveAt = new Date().toISOString();
      container.expiresAt = new Date(Date.now() + this.CONTAINER_EXPIRY_TIME).toISOString();
      this.containers.set(containerId, container);
    }
  }

  /**
   * Check if container is expired
   */
  private isExpired(lastActiveAt: string): boolean {
    const lastActive = new Date(lastActiveAt);
    const now = new Date();
    return now.getTime() - lastActive.getTime() > this.CONTAINER_EXPIRY_TIME;
  }

  /**
   * Start cleanup task for expired containers
   */
  private startCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredContainers();
    }, this.CLEANUP_INTERVAL);

    console.log("[ContainerManager] Cleanup task started");
  }

  /**
   * Cleanup expired containers
   */
  private async cleanupExpiredContainers(): Promise<void> {
    const now = new Date();
    const expiredContainers: string[] = [];

    for (const [id, container] of Array.from(this.containers.entries())) {
      if (this.isExpired(container.lastActiveAt)) {
        expiredContainers.push(id);
      }
    }

    if (expiredContainers.length > 0) {
      console.log(`[ContainerManager] Cleaning up ${expiredContainers.length} expired containers`);

      for (const id of expiredContainers) {
        try {
          await this.deleteContainer(id);
        } catch (error) {
          console.error(`[ContainerManager] Failed to cleanup container ${id}:`, error);
        }
      }
    }
  }

  /**
   * Stop cleanup task
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const containerManager = new ContainerManager();
