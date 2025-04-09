import { ToolpathComment } from "@prisma/client";

export interface ToolpathCommentData {
  id: string;
  toolpathId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ToolpathCommentCreateData {
  toolpathId: string;
  content: string;
  createdBy: string;
}

// Fetch all comments for a toolpath
export const fetchToolpathComments = async (toolpathId: string): Promise<ToolpathComment[]> => {
  try {
    const response = await fetch(`/api/toolpaths/${toolpathId}/comments`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to fetch toolpath comments');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error fetching comments for toolpath ${toolpathId}:`, error);
    throw error;
  }
};

// Create a new comment
export const createToolpathComment = async (data: ToolpathCommentCreateData): Promise<ToolpathComment> => {
  try {
    const response = await fetch(`/api/toolpaths/${data.toolpathId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create toolpath comment');
    }

    return await response.json();
  } catch (error) {
    console.error('API error creating toolpath comment:', error);
    throw error;
  }
};

// Update a comment
export const updateToolpathComment = async (
  toolpathId: string,
  commentId: string,
  content: string
): Promise<ToolpathComment> => {
  try {
    const response = await fetch(`/api/toolpaths/${toolpathId}/comments/${commentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update toolpath comment');
    }

    return await response.json();
  } catch (error) {
    console.error(`API error updating comment ${commentId} for toolpath ${toolpathId}:`, error);
    throw error;
  }
};

// Delete a comment
export const deleteToolpathComment = async (toolpathId: string, commentId: string): Promise<void> => {
  try {
    const response = await fetch(`/api/toolpaths/${toolpathId}/comments/${commentId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to delete toolpath comment');
    }
  } catch (error) {
    console.error(`API error deleting comment ${commentId} for toolpath ${toolpathId}:`, error);
    throw error;
  }
};

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  fetchToolpathComments,
  createToolpathComment,
  updateToolpathComment,
  deleteToolpathComment,
};