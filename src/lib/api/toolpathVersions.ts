import { ToolpathVersion } from "@prisma/client";

export interface ToolpathVersionData {
  id: string;
  toolpathId: string;
  data: any;
  gcode: string | null;
  changeMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolpathVersionCreateData {
  toolpathId: string;
  data?: any;
  gcode?: string;
  changeMessage?: string;
}

export interface ToolpathVersionRestoreData {
  id: string;
  versionId: string;
}

// Fetch all versions for a toolpath
export const fetchToolpathVersions = async (toolpathId: string): Promise<ToolpathVersion[]> => {
  try {
    const response = await fetch(`/api/toolpaths/${toolpathId}/versions`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch toolpath versions');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error fetching versions for toolpath ${toolpathId}:`, error);
    throw error;
  }
};

// Fetch a specific version
export const fetchToolpathVersion = async (toolpathId: string, versionId: string): Promise<ToolpathVersion> => {
  try {
    const response = await fetch(`/api/toolpaths/${toolpathId}/versions/${versionId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch toolpath version');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error fetching version ${versionId} for toolpath ${toolpathId}:`, error);
    throw error;
  }
};

// Create a new version
export const createToolpathVersion = async (data: ToolpathVersionCreateData): Promise<ToolpathVersion> => {
  try {
    const response = await fetch(`/api/toolpaths/${data.toolpathId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create toolpath version');
    }

    return await response.json();
  } catch (error) {
    console.error('API error creating toolpath version:', error);
    throw error;
  }
};

// Restore a version
export const restoreToolpathVersion = async (data: ToolpathVersionRestoreData): Promise<ToolpathVersion> => {
  try {
    const response = await fetch(`/api/toolpaths/${data.id}/versions/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to restore toolpath version');
    }

    return await response.json();
  } catch (error) {
    console.error('API error restoring toolpath version:', error);
    throw error;
  }
};

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  fetchToolpathVersions,
  fetchToolpathVersion,
  createToolpathVersion,
  restoreToolpathVersion,
};