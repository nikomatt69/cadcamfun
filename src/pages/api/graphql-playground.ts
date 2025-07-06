// pages/api/graphql-playground.ts
import { NextApiRequest, NextApiResponse } from "next";
import { renderPlaygroundPage, RenderPageOptions } from "graphql-playground-html";
import { requireAuth } from "@/src/lib/api/auth";

// Define CursorShape type if not directly exported (adjust based on actual library export)
type CursorShape = "line" | "block" | "underline";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) {
    // If requireAuth returns falsy, it means auth failed and it already sent a response.
    return;
  }

  const playgroundOptions: RenderPageOptions = {
    endpoint: "/api/graphql",
    settings: {
      "schema.polling.enable": false,
      "editor.theme": "dark",
      "editor.cursorShape": "line" as CursorShape,
      "editor.reuseHeaders": true,
      "tracing.hideTracingResponse": true,
      "editor.fontSize": 14,
      "editor.fontFamily": '"Source Code Pro", "Consolas", "Inconsolata", "Droid Sans Mono", "Monaco", monospace'
    },
    tabs: [
      {
        name: "My Profile",
        endpoint: "/api/graphql",
        query: `query Me {
  me {
    id
    name
    email
    organizations {
      id
      organization {
        id
        name
      }
      role
    }
  }
}`
      },
      {
        name: "My Organizations",
        endpoint: "/api/graphql",
        query: `query MyOrganizations {
  myOrganizations {
    id
    name
    description
    users {
      id
      user {
        id
        name
        email
      }
      role
    }
  }
}`
      },
      {
        name: "Create Project",
        endpoint: "/api/graphql",
        query: `mutation CreateProject($input: CreateProjectInput!) {
  createProject(input: $input) {
    id
    name
    description
    isPublic
    owner {
      id
      name
    }
    organization {
      id
      name
    }
  }
}

# Variables:
# {
#   "input": {
#     "name": "My New Project",
#     "description": "Project description",
#     "organizationId": "org-id-here",
#     "isPublic": false
#   }
# }`
      },
      {
        name: "Project Details",
        endpoint: "/api/graphql",
        query: `query ProjectDetails($id: ID!) {
  project(id: $id) {
    id
    name
    description
    isPublic
    owner {
      id
      name
    }
    drawings {
      edges {
        node {
          id
          name
        }
      }
    }
    components {
      edges {
        node {
          id
          name
          type
        }
      }
    }
  }
}

# Variables:
# {
#   "id": "project-id-here"
# }`
      },
      {
        name: "Create Component",
        endpoint: "/api/graphql",
        query: `mutation CreateComponent($input: CreateComponentInput!) {
  createComponent(input: $input) {
    id
    name
    description
    type
    project {
      id
      name
    }
  }
}

# Variables:
# {
#   "input": {
#     "name": "New Component",
#     "description": "Component description",
#     "type": "custom",
#     "projectId": "project-id-here",
#     "data": {},
#     "isPublic": false
#   }
# }`
      },
      {
        name: "Materials Library",
        endpoint: "/api/graphql",
        query: `query Materials($take: Int) {
  materials(take: $take) {
    id
    name
    properties
    isPublic
  }
  publicMaterials(take: $take) {
    id
    name
    properties
  }
}

# Variables:
# {
#   "take": 10
# }`
      },
      {
        name: "Tool Details",
        endpoint: "/api/graphql",
        query: `query ToolDetails($id: ID!) {
  tool(id: $id) {
    id
    name
    type
    diameter
    material
    numberOfFlutes
    maxRPM
    coolantType
    cuttingLength
    totalLength
    shankDiameter
    isPublic
  }
}

# Variables:
# {
#   "id": "tool-id-here"
# }`
      },
      {
        name: "Create Drawing",
        endpoint: "/api/graphql",
        query: `mutation CreateDrawing($input: CreateDrawingInput!) {
  createDrawing(input: $input) {
    id
    name
    description
    project {
      id
      name
    }
  }
}

# Variables:
# {
#   "input": {
#     "name": "New Drawing",
#     "description": "Drawing description",
#     "projectId": "project-id-here",
#     "data": {}
#   }
# }`
      },
      {
        name: "Create Organization",
        endpoint: "/api/graphql",
        query: `mutation CreateOrganization($input: CreateOrganizationInput!) {
  createOrganization(input: $input) {
    id
    name
    description
    users {
      id
      user {
        id
        name
      }
      role
    }
  }
}

# Variables:
# {
#   "input": {
#     "name": "New Organization",
#     "description": "Organization description"
#   }
# }`
      },
      {
        name: "Library Items",
        endpoint: "/api/graphql",
        query: `query LibraryItems($category: String, $take: Int) {
  libraryItems(category: $category, take: $take) {
    id
    name
    category
    type
    isPublic
    tags
  }
}

# Variables:
# {
#   "category": "component",
#   "take": 10
# }`
      },
      {
        name: "Messages",
        endpoint: "/api/graphql",
        query: `query Messages($conversationId: ID!, $take: Int) {
  messages(conversationId: $conversationId, take: $take) {
    id
    content
    createdAt
    sender {
      id
      name
    }
    fileUrl
  }
}

# Variables:
# {
#   "conversationId": "conversation-id-here",
#   "take": 20
# }`
      },
      {
        name: "Create Toolpath",
        endpoint: "/api/graphql",
        query: `mutation CreateToolpath($input: CreateToolpathInput!) {
  createToolpath(input: $input) {
    id
    name
    description
    type
    operationType
    project {
      id
      name
    }
    drawing {
      id
      name
    }
    material {
      id
      name
    }
    tool {
      id
      name
      type
    }
  }
}

# Variables:
# {
#   "input": {
#     "name": "New Toolpath",
#     "description": "Toolpath description",
#     "projectId": "project-id-here",
#     "drawingId": "drawing-id-here",
#     "materialId": "material-id-here",
#     "toolId": "tool-id-here",
#     "type": "mill",
#     "operationType": "contour"
#   }
# }`
      }
    ]
  };

  res.setHeader("Content-Type", "text/html");
  res.status(200).send(renderPlaygroundPage(playgroundOptions));
}
