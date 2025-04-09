// User related types
export type UserRole = 'ADMIN' | 'MANAGER' | 'MEMBER';

export interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Account {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

export interface Session {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
}

// Organization related types
export interface Organization {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationInvitation {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  organizationId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface UserOrganization {
  id: string;
  userId: string;
  organizationId: string;
  role: UserRole;
  joinedAt: Date;
}

// Project related types
export interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  organizationId?: string | null;
}

export interface ProjectWithRelations extends Project {
  owner: User;
  organization?: Organization | null;
  _count?: {
    drawings: number;
    components: number;
  };
}

// Drawing related types
export interface Drawing {
  id: string;
  name: string;
  description?: string | null;
  data: any; // JSON data
  thumbnail?: string | null;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
}

export interface DrawingWithRelations extends Drawing {
  project: Project;
  versions?: DrawingVersion[];
  toolPaths?: ToolPath[];
}

export interface DrawingVersion {
  id: string;
  version: number;
  data: any; // JSON data
  createdAt: Date;
  drawingId: string;
}

// Component related types
export interface ComponentMetadata {
  createdAt: string;
  isComposite: boolean;
  elementCount: number;
  elementTypes: string[];
}

export interface ComponentGeometry {
  type: string;
  elements: any[];
}

export interface ComponentElement {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  z: number;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  color?: string;
  wireframe?: boolean;
  layerId?: string;
  rotation?: {
    x: number;
    y: number;
    z: number;
  };
  description?: string;
  [key: string]: any; // Per proprietà specifiche del tipo
}

export interface ComponentData {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  z: number;
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  wireframe?: boolean;
  layerId?: string;
  version: string;
  elements: ComponentElement[];
  geometry: ComponentGeometry;
  metadata: ComponentMetadata;
  properties: Record<string, any>;
}

export interface Component {
  id: string;
  name: string;
  description?: string | null;
  data: ComponentData;
  thumbnail?: string | null;
  type: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  project?: {
    id: string;
    name: string;
    ownerId: string;
  };
}

export interface ComponentWithRelations extends Component {
  project: Project;
}

// Material related types
export interface Material {
  id: string;
  name: string;
  description?: string | null;
  properties: any; // JSON data
  createdAt: Date;
  updatedAt: Date;
}

// Tool related types
export interface Tool {
  id: string;
  name: string;
  type: string;
  diameter: number;
  material: string;
  numberOfFlutes?: number | null;
  maxRPM?: number | null;
  coolantType?: string | null;
  cuttingLength?: number | null;
  totalLength?: number | null;
  shankDiameter?: number | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ToolPath related types
export interface ToolPath {
  id: string;
  name: string;
  description?: string | null;
  data: any; // JSON data
  gcode?: string | null;
  createdAt: Date;
  updatedAt: Date;
  drawingId: string;
  materialId?: string | null;
  machineConfigId?: string | null;
  toolId?: string | null;
}

export interface ToolPathWithRelations extends ToolPath {
  drawing: Drawing;
  material?: Material | null;
  machineConfig?: MachineConfig | null;
  tool?: Tool | null;
}

// MachineConfig related types
export interface MachineConfig {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  config: any; // JSON data
  createdAt: Date;
  updatedAt: Date;
}

// ActivityLog related types
export interface ActivityLog {
  id: string;
  userId: string;
  itemId: string;
  itemType: string;
  action: string;
  details?: any | null; // JSON data
  timestamp: Date;
}

// AIAnalysisLog related types
export interface AIAnalysisLog {
  id: string;
  userId: string;
  objectId: string;
  objectType: string;
  analysisType: string;
  result: any; // JSON data
  createdAt: Date;
}

// API request/response types
export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  error?: string;
  statusCode?: number;
}

// Common request bodies
export interface CreateProjectRequest {
  name: string;
  description?: string;
  organizationId?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  organizationId?: string;
}

export interface CreateDrawingRequest {
  name: string;
  description?: string;
  data?: any;
  projectId: string;
}

export interface UpdateDrawingRequest {
  name?: string;
  description?: string;
  data?: any;
  thumbnail?: string;
}

export interface CreateComponentRequest {
  name: string;
  description?: string;
  data?: any;
  projectId: string;
  type?: string;
  isPublic?: boolean;
}

export interface UpdateComponentRequest {
  name?: string;
  description?: string;
  data?: any;
  thumbnail?: string;
  type?: string;
  isPublic?: boolean;
}

export interface CreateToolRequest {
  name: string;
  type: string;
  diameter: number;
  material: string;
  numberOfFlutes?: number;
  maxRPM?: number;
  coolantType?: string;
  cuttingLength?: number;
  totalLength?: number;
  shankDiameter?: number;
  notes?: string;
  organizationId?: string;
}

export interface CreateMaterialRequest {
  name: string;
  description?: string;
  properties: any;
  organizationId?: string;
}

export interface CreateMachineConfigRequest {
  name: string;
  description?: string;
  type: string;
  config: any;
}

export interface CreateToolPathRequest {
  name: string;
  description?: string;
  data: any;
  drawingId: string;
  materialId?: string;
  machineConfigId?: string;
  toolId?: string;
}

export interface InviteUserRequest {
  email: string;
  role: UserRole;
  organizationId: string;
}

// Auth related types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  name: string;
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Extended session type for NextAuth
export interface ExtendedSession extends Session {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}