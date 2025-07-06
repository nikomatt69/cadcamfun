// src/lib/api/libraries.ts

import { Component } from "@prisma/client";

// Common filters interface for library items
export interface LibraryItemsFilter {
  search?: string;
  type?: string;
  projectId?: string;
  [key: string]: any;
}

// Helper function for making API calls
const makeApiCall = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return { data };
};

const makeApiPost = async (url: string, body: any) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return { data };
};

// Components -----------------------------------------------------------------

// Fetch all components with optional filters
export async function fetchComponents(filters?: LibraryItemsFilter) {
  const queryParams = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        queryParams.append(key, String(value));
      }
    });
  }

  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
  return await makeApiCall(`/api/components${query}`);
}

// Fetch a single component by ID
export async function fetchComponentById(id: string) {
  return await makeApiCall(`/api/components/${id}`);
}

// Fetch components for a specific project
export async function fetchProjectComponents(projectId: string) {
  return await makeApiCall(`/api/projects/${projectId}/components`);
}

// Materials -----------------------------------------------------------------

// Fetch all materials with optional filters
export async function fetchMaterials(filters?: LibraryItemsFilter) {
  const queryParams = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        queryParams.append(key, String(value));
      }
    });
  }

  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
  return await makeApiCall(`/api/materials${query}`);
}

// Fetch a single material by ID
export async function fetchMaterialById(id: string) {
  return await makeApiCall(`/api/materials/${id}`);
}

// Tools -----------------------------------------------------------------

// Fetch all tools with optional filters
export async function fetchTools(filters?: LibraryItemsFilter) {
  const queryParams = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        queryParams.append(key, String(value));
      }
    });
  }

  const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
  return await makeApiCall(`/api/tools${query}`);
}

// Fetch a single tool by ID
export async function fetchToolById(id: string) {
  return await makeApiCall(`/api/tools/${id}`);
}

// Library Management -----------------------------------------------------------------

// Export components to a file
export async function exportComponents(ids?: string[], format: "json" | "zip" | "bucket" = "json") {
  const queryParams = new URLSearchParams();

  if (ids && ids.length > 0) {
    ids.forEach(id => queryParams.append("ids", id));
  }

  queryParams.append("format", format);

  return await makeApiCall(`/api/components/export-import?${queryParams.toString()}`);
}

// Import components from data or a file path
export async function importComponents(
  data: any | { path: string },
  importMode: "create" | "update" | "skip" = "create"
) {
  return await makeApiPost("/api/components/export-import", {
    data,
    importMode
  });
}

// Export materials to a file
export async function exportMaterials(ids?: string[], format: "json" | "zip" | "bucket" = "json") {
  const queryParams = new URLSearchParams();

  if (ids && ids.length > 0) {
    ids.forEach(id => queryParams.append("ids", id));
  }

  queryParams.append("format", format);

  return await makeApiCall(`/api/materials/export-import?${queryParams.toString()}`);
}

// Import materials from data or a file path
export async function importMaterials(
  data: any | { path: string },
  importMode: "create" | "update" | "skip" = "create"
) {
  return await makeApiPost("/api/materials/export-import", {
    data,
    importMode
  });
}

// Export tools to a file
export async function exportTools(ids?: string[], format: "json" | "zip" | "bucket" = "json") {
  const queryParams = new URLSearchParams();

  if (ids && ids.length > 0) {
    ids.forEach(id => queryParams.append("ids", id));
  }

  queryParams.append("format", format);

  return await makeApiCall(`/api/tools/export-import?${queryParams.toString()}`);
}

// Import tools from data or a file path
export async function importTools(data: any | { path: string }, importMode: "create" | "update" | "skip" = "create") {
  return await makeApiPost("/api/tools/export-import", {
    data,
    importMode
  });
}
