import axios from "axios";
import { Tool } from "@/src/types/mainTypes";

const API_BASE_URL = "/api/tools"; // Adjust if your API endpoint is different

export class ToolService {
  /**
   * Fetches all tools from the backend API.
   * @returns A promise that resolves to an array of Tool objects.
   * @throws Will throw an error if the API request fails.
   */
  static async getAll(): Promise<Tool[]> {
    try {
      const response = await axios.get<Tool[]>(API_BASE_URL);
      return response.data;
    } catch (error) {
      console.error("Error fetching tools:", error);
      // Enhance error handling as needed: e.g., check error.response for specific status codes
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Failed to fetch tools: ${error.response.status} ${error.response.data?.message || error.response.statusText}`
        );
      }
      throw new Error("Failed to fetch tools. An unexpected error occurred.");
    }
  }

  /**
   * Fetches a single tool by its ID from the backend API.
   * @param id The ID of the tool to fetch.
   * @returns A promise that resolves to a Tool object, or null if not found.
   * @throws Will throw an error if the API request fails (excluding 404).
   */
  static async getById(id: string): Promise<Tool | null> {
    try {
      const response = await axios.get<Tool>(`${API_BASE_URL}/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching tool with ID ${id}:`, error);
      if (axios.isAxiosError(error) && error.response) {
        if (error.response.status === 404) {
          return null; // Tool not found
        }
        throw new Error(
          `Failed to fetch tool ${id}: ${error.response.status} ${error.response.data?.message || error.response.statusText}`
        );
      }
      throw new Error(`Failed to fetch tool ${id}. An unexpected error occurred.`);
    }
  }

  // Add other methods as needed, e.g., create, update, delete
  // static async create(data: Omit<Tool, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tool> { ... }
  // static async update(id: string, data: Partial<Omit<Tool, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Tool> { ... }
  // static async delete(id: string): Promise<void> { ... }
}

export default ToolService;
