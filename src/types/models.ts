// src/types/models.ts
import { UserRole } from '@prisma/client';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  organizationId: string | null;
  isPublic: boolean;
  owner?: {
    id: string;
    name: string | null;
    email: string | null;
  };
  organization?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    drawings: number;
    components: number;
  };
}

export interface Drawing {
  id: string;
  name: string;
  description: string | null;
  data: any; // Stores the drawing elements (consider typing more specifically)
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  project?: Project;
  versions?: DrawingVersion[];
  toolPaths?: ToolPath[];
}

export interface DrawingVersion {
  id: string;
  version: number;
  data: any; // Stores the drawing elements for this version
  createdAt: Date;
  drawingId: string;
  drawing?: Drawing;
}

export interface Component {
  id: string;
  name: string;
  description: string | null;
  data: any; // Stores the component definition
  thumbnail: string | null;
  type: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  project?: Project;
}

export interface Material {
  id: string;
  name: string;
  description: string | null;
  properties: any; // Properties like density, hardness, etc.
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string | null;
  organizationId: string | null;
  owner?: User | null;
  organization?: Organization | null;
  toolPaths?: ToolPath[];
}

export interface Tool {
  id: string;
  name: string;
  type: string; // endmill, drillbit, turningTool, etc.
  diameter: number;
  material: string; // HSS, Carbide, etc.
  numberOfFlutes: number | null;
  maxRPM: number | null;
  coolantType: string | null;
  cuttingLength: number | null;
  totalLength: number | null;
  shankDiameter: number | null;
  notes: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string | null;
  organizationId: string | null;
  owner?: User | null;
  organization?: Organization | null;
  toolPaths?: ToolPath[];
}

export interface ToolPath {
  id: string;
  name: string;
  description: string | null;
  data: any; // Stores the toolpath data
  gcode: string | null;
  simulation?: any | null; // Simulation data
  createdAt: Date;
  updatedAt: Date;
  drawingId: string;
  materialId: string | null;
  machineConfigId: string | null;
  toolId: string | null;
  drawing: Drawing;
  material?: Material | null;
  machineConfig?: MachineConfig | null;
  tool?: Tool | null;
}

export interface MachineConfig {
  id: string;
  name: string;
  type: string; // mill, lathe, printer
  description: string | null;
  config: any; // Machine configuration parameters
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  owner: User;
  toolPaths?: ToolPath[];
}

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  password: string | null;
  createdAt: Date;
  updatedAt: Date;
  organizations?: UserOrganization[];
  projects?: Project[];
  materials?: Material[];
  tools?: Tool[];
  machineConfigs?: MachineConfig[];
  activityLogs?: ActivityLog[];
}

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  users?: UserOrganization[];
  projects?: Project[];
  invitations?: OrganizationInvitation[];
  materials?: Material[];
  tools?: Tool[];
  libraryItems?: LibraryItem[];
}

export interface UserOrganization {
  id: string;
  userId: string;
  organizationId: string;
  role: UserRole; // 'ADMIN', 'MANAGER', 'MEMBER'
  joinedAt: Date;
  user: User;
  organization: Organization;
}

export interface OrganizationInvitation {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  organizationId: string;
  createdAt: Date;
  expiresAt: Date;
  organization: Organization;
}

export interface ActivityLog {
  id: string;
  userId: string;
  itemId: string;
  itemType: string; // project, drawing, component, etc.
  action: string; // created, updated, deleted, etc.
  details: any | null;
  timestamp: Date;
  user: User;
}

export interface AIAnalysisLog {
  id: string;
  userId: string;
  objectId: string;
  objectType: string;
  analysisType: string;
  result: any;
  createdAt: Date;
  user: User;
}

export interface FileUpload {
  id: string;
  fileName: string;
  s3Key: string;
  s3Bucket: string;
  s3ContentType: string;
  s3Size: number;
  objectId: string | null;
  objectType: string | null;
  ownerId: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LibraryItem {
  id: string;
  name: string;
  description: string | null;
  category: string; // 'component', 'tool', 'material', 'machine'
  type: string;
  data: any;
  properties: any | null;
  tags: string[];
  thumbnail: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string | null;
  organizationId: string | null;
  owner?: User | null;
  organization?: Organization | null;
}

// Input type interfaces for create/update operations

export interface CreateProjectInput {
  name: string;
  description?: string;
  organizationId?: string;
  isPublic?: boolean;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  id: string;
}

export interface CreateDrawingInput {
  name: string;
  description?: string;
  data?: any;
  projectId: string;
}

export interface UpdateDrawingInput extends Partial<CreateDrawingInput> {
  id: string;
  thumbnail?: string;
}

export interface CreateComponentInput {
  name: string;
  description?: string;
  data?: any;
  projectId: string;
  type?: string;
  isPublic?: boolean;
}

export interface UpdateComponentInput extends Partial<CreateComponentInput> {
  id: string;
  thumbnail?: string;
}

export interface CreateMaterialInput {
  name: string;
  description?: string;
  properties: any;
  organizationId?: string;
  isPublic?: boolean;
}

export interface UpdateMaterialInput extends Partial<CreateMaterialInput> {
  id: string;
}

export interface CreateToolInput {
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
  isPublic?: boolean;
}

export interface UpdateToolInput extends Partial<CreateToolInput> {
  id: string;
}

export interface CreateToolPathInput {
  name: string;
  description?: string;
  data: any;
  gcode?: string;
  drawingId: string;
  materialId?: string;
  machineConfigId?: string;
  toolId?: string;
  simulation?: any;
}

export interface UpdateToolPathInput extends Partial<CreateToolPathInput> {
  id: string;
}

export interface CreateMachineConfigInput {
  name: string;
  type: string;
  description?: string;
  config: any;
  isPublic?: boolean;
}

export interface UpdateMachineConfigInput extends Partial<CreateMachineConfigInput> {
  id: string;
}

export interface UpdateUserInput {
  name?: string;
  image?: string;
}

export interface UpdatePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface CreateOrganizationInput {
  name: string;
  description?: string;
}

export interface UpdateOrganizationInput extends Partial<CreateOrganizationInput> {
  id: string;
}

export interface InviteToOrganizationInput {
  email: string;
  role?: UserRole;
  organizationId: string;
}

export interface UpdateMemberRoleInput {
  memberId: string;
  role: UserRole;
  organizationId: string;
}

export interface RemoveMemberInput {
  memberId: string;
  organizationId: string;
}

export interface CreateLibraryItemInput {
  name: string;
  description?: string;
  category: string;
  type: string;
  data: any;
  properties?: any;
  tags?: string[];
  organizationId?: string;
  isPublic?: boolean;
}

export interface UpdateLibraryItemInput extends Partial<CreateLibraryItemInput> {
  id: string;
  thumbnail?: string;
}
