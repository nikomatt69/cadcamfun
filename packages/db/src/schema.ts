// Generated from the legacy Prisma schema (SQLite flavour), now owned by Drizzle.
// Table/column names are unchanged so existing dev.db data stays compatible.
import { sqliteTable, blob, index, integer, real, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"

export const newId = () => crypto.randomUUID()

export const UserRoleValues = ["ADMIN", "MANAGER", "MEMBER"] as const
export type UserRole = (typeof UserRoleValues)[number]

export const NotificationTypeValues = ["NEW_MESSAGE", "PROJECT_CREATED", "COMPONENT_CREATED", "MEMBER_JOINED", "ORGANIZATION_INVITATION", "PR_OPENED", "PR_MERGED", "PR_REVIEWED", "AI_COMMITTED", "WORKFLOW_FAILED", "WORKFLOW_PASSED"] as const
export type NotificationType = (typeof NotificationTypeValues)[number]

export const userTable = sqliteTable(
  "User",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  password: text("password"),
  bio: text("bio"),
  location: text("location"),
  website: text("website"),
  company: text("company"),
  title: text("title"),
  publicProfile: integer("publicProfile", { mode: "boolean" }).notNull().default(true),
  showEmail: integer("showEmail", { mode: "boolean" }).notNull().default(false),
  twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).notNull().default(false),
  stripeCustomerId: text("stripeCustomerId"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  }
)

export type User = typeof userTable.$inferSelect
export type NewUser = typeof userTable.$inferInsert

export const authenticatorTable = sqliteTable(
  "authenticators",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  credentialID: text("credentialID").notNull().unique(),
  credentialPublicKey: blob("credentialPublicKey", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull(),
  credentialDeviceType: text("credentialDeviceType").notNull(),
  credentialBackedUp: integer("credentialBackedUp", { mode: "boolean" }).notNull(),
  transports: text("transports"),
  }
)

export type Authenticator = typeof authenticatorTable.$inferSelect
export type NewAuthenticator = typeof authenticatorTable.$inferInsert

export const verificationTokenTable = sqliteTable(
  "verification_tokens",
  {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("verification_tokens_identifier_token_key").on(t.identifier, t.token),
  ]
)

export type VerificationToken = typeof verificationTokenTable.$inferSelect
export type NewVerificationToken = typeof verificationTokenTable.$inferInsert

export const subscriptionTable = sqliteTable(
  "Subscription",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  plan: text("plan").notNull(),
  referenceId: text("referenceId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripeCustomerId"),
  stripeSubscriptionId: text("stripeSubscriptionId"),
  status: text("status").notNull().default("active"),
  periodStart: integer("periodStart", { mode: "timestamp_ms" }),
  periodEnd: integer("periodEnd", { mode: "timestamp_ms" }),
  cancelAtPeriodEnd: integer("cancelAtPeriodEnd", { mode: "boolean" }).default(false),
  seats: integer("seats"),
  groupId: text("groupId"),
  priceId: text("priceId"),
  trialStart: integer("trialStart", { mode: "timestamp_ms" }),
  trialEnd: integer("trialEnd", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  stripePriceId: text("stripePriceId"),
  stripeCurrentPeriodStart: integer("stripeCurrentPeriodStart", { mode: "timestamp_ms" }),
  stripeCurrentPeriodEnd: integer("stripeCurrentPeriodEnd", { mode: "timestamp_ms" }),
  lsCustomerId: text("lsCustomerId"),
  lsSubscriptionId: text("lsSubscriptionId"),
  lsVariantId: text("lsVariantId"),
  lsCurrentPeriodEnd: integer("lsCurrentPeriodEnd", { mode: "timestamp_ms" }),
  trialEndsAt: integer("trialEndsAt", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("Subscription_referenceId_idx").on(t.referenceId),
    index("Subscription_stripeCustomerId_idx").on(t.stripeCustomerId),
    index("Subscription_stripeSubscriptionId_idx").on(t.stripeSubscriptionId),
  ]
)

export type Subscription = typeof subscriptionTable.$inferSelect
export type NewSubscription = typeof subscriptionTable.$inferInsert

export const accountTable = sqliteTable(
  "Account",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("Account_providerId_accountId_key").on(t.providerId, t.accountId),
  ]
)

export type Account = typeof accountTable.$inferSelect
export type NewAccount = typeof accountTable.$inferInsert

export const sessionTable = sqliteTable(
  "Session",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  token: text("token").notNull().unique(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  }
)

export type Session = typeof sessionTable.$inferSelect
export type NewSession = typeof sessionTable.$inferInsert

export const organizationTable = sqliteTable(
  "Organization",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  }
)

export type Organization = typeof organizationTable.$inferSelect
export type NewOrganization = typeof organizationTable.$inferInsert

export const organizationInvitationTable = sqliteTable(
  "OrganizationInvitation",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  email: text("email").notNull(),
  role: text("role", { enum: UserRoleValues }).notNull().default("MEMBER"),
  token: text("token").notNull().unique(),
  organizationId: text("organizationId").notNull().references((): AnySQLiteColumn => organizationTable.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  }
)

export type OrganizationInvitation = typeof organizationInvitationTable.$inferSelect
export type NewOrganizationInvitation = typeof organizationInvitationTable.$inferInsert

export const userOrganizationTable = sqliteTable(
  "UserOrganization",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  organizationId: text("organizationId").notNull().references((): AnySQLiteColumn => organizationTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: UserRoleValues }).notNull().default("MEMBER"),
  joinedAt: integer("joinedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("UserOrganization_userId_organizationId_key").on(t.userId, t.organizationId),
  ]
)

export type UserOrganization = typeof userOrganizationTable.$inferSelect
export type NewUserOrganization = typeof userOrganizationTable.$inferInsert

export const projectTable = sqliteTable(
  "Project",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").notNull().references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
  }
)

export type Project = typeof projectTable.$inferSelect
export type NewProject = typeof projectTable.$inferInsert

export const drawingTable = sqliteTable(
  "Drawing",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  description: text("description"),
  data: text("data", { mode: "json" }).notNull(),
  thumbnail: text("thumbnail"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  }
)

export type Drawing = typeof drawingTable.$inferSelect
export type NewDrawing = typeof drawingTable.$inferInsert

export const drawingVersionTable = sqliteTable(
  "DrawingVersion",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  version: integer("version").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  drawingId: text("drawingId").notNull().references((): AnySQLiteColumn => drawingTable.id, { onDelete: "cascade" }),
  }
)

export type DrawingVersion = typeof drawingVersionTable.$inferSelect
export type NewDrawingVersion = typeof drawingVersionTable.$inferInsert

export const componentTable = sqliteTable(
  "Component",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  description: text("description"),
  data: text("data", { mode: "json" }).notNull(),
  thumbnail: text("thumbnail"),
  type: text("type"),
  isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  }
)

export type Component = typeof componentTable.$inferSelect
export type NewComponent = typeof componentTable.$inferInsert

export const materialTable = sqliteTable(
  "Material",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  description: text("description"),
  properties: text("properties", { mode: "json" }).notNull(),
  isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type Material = typeof materialTable.$inferSelect
export type NewMaterial = typeof materialTable.$inferInsert

export const toolTable = sqliteTable(
  "Tool",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  type: text("type").notNull(),
  diameter: real("diameter").notNull(),
  material: text("material").notNull(),
  numberOfFlutes: integer("numberOfFlutes"),
  maxRPM: integer("maxRPM"),
  coolantType: text("coolantType"),
  cuttingLength: real("cuttingLength"),
  totalLength: real("totalLength"),
  shankDiameter: real("shankDiameter"),
  // Shape of the tool for its 3D model (spec 31): corner / nose radius, included or taper angle, thread pitch, holder.
  cornerRadius: real("cornerRadius"),
  tipAngle: real("tipAngle"),
  threadPitch: real("threadPitch"),
  holderDiameter: real("holderDiameter"),
  holderLength: real("holderLength"),
  stickout: real("stickout"),
  notes: text("notes"),
  isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type Tool = typeof toolTable.$inferSelect
export type NewTool = typeof toolTable.$inferInsert

export const toolpathTable = sqliteTable(
  "Toolpath",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  description: text("description"),
  data: text("data", { mode: "json" }),
  type: text("type"),
  operationType: text("operationType"),
  gcode: text("gcode"),
  thumbnail: text("thumbnail"),
  isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
  projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  createdBy: text("createdBy").notNull().references((): AnySQLiteColumn => userTable.id),
  drawingId: text("drawingId").references((): AnySQLiteColumn => drawingTable.id),
  materialId: text("materialId").references((): AnySQLiteColumn => materialTable.id),
  toolId: text("toolId").references((): AnySQLiteColumn => toolTable.id),
  machineConfigId: text("machineConfigId").references((): AnySQLiteColumn => machineConfigTable.id),
  }
)

export type Toolpath = typeof toolpathTable.$inferSelect
export type NewToolpath = typeof toolpathTable.$inferInsert

export const toolpathVersionTable = sqliteTable(
  "ToolpathVersion",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  toolpathId: text("toolpathId").notNull().references((): AnySQLiteColumn => toolpathTable.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }),
  gcode: text("gcode"),
  changeMessage: text("changeMessage"),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  }
)

export type ToolpathVersion = typeof toolpathVersionTable.$inferSelect
export type NewToolpathVersion = typeof toolpathVersionTable.$inferInsert

export const toolpathCommentTable = sqliteTable(
  "ToolpathComment",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  toolpathId: text("toolpathId").notNull().references((): AnySQLiteColumn => toolpathTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  }
)

export type ToolpathComment = typeof toolpathCommentTable.$inferSelect
export type NewToolpathComment = typeof toolpathCommentTable.$inferInsert

export const machineConfigTable = sqliteTable(
  "MachineConfig",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  config: text("config", { mode: "json" }).notNull(),
  isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").notNull().references((): AnySQLiteColumn => userTable.id),
  }
)

export type MachineConfig = typeof machineConfigTable.$inferSelect
export type NewMachineConfig = typeof machineConfigTable.$inferInsert

export const activityLogTable = sqliteTable(
  "ActivityLog",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id),
  itemId: text("itemId").notNull(),
  itemType: text("itemType").notNull(),
  action: text("action").notNull(),
  details: text("details", { mode: "json" }),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  }
)

export type ActivityLog = typeof activityLogTable.$inferSelect
export type NewActivityLog = typeof activityLogTable.$inferInsert

export const aIAnalysisLogTable = sqliteTable(
  "AIAnalysisLog",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id),
  objectId: text("objectId").notNull(),
  objectType: text("objectType").notNull(),
  analysisType: text("analysisType").notNull(),
  result: text("result", { mode: "json" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  }
)

export type AIAnalysisLog = typeof aIAnalysisLogTable.$inferSelect
export type NewAIAnalysisLog = typeof aIAnalysisLogTable.$inferInsert

export const fileUploadTable = sqliteTable(
  "FileUpload",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  fileName: text("fileName").notNull(),
  s3Key: text("s3Key").notNull(),
  s3Bucket: text("s3Bucket").notNull(),
  s3ContentType: text("s3ContentType").notNull(),
  s3Size: integer("s3Size").notNull(),
  objectId: text("objectId"),
  objectType: text("objectType"),
  ownerId: text("ownerId").notNull(),
  organizationId: text("organizationId"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  }
)

export type FileUpload = typeof fileUploadTable.$inferSelect
export type NewFileUpload = typeof fileUploadTable.$inferInsert

export const libraryItemTable = sqliteTable(
  "LibraryItem",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  type: text("type").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  properties: text("properties", { mode: "json" }),
  tags: text("tags", { mode: "json" }),
  thumbnail: text("thumbnail"),
  isPublic: integer("isPublic", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type LibraryItem = typeof libraryItemTable.$inferSelect
export type NewLibraryItem = typeof libraryItemTable.$inferInsert

export const conversationTable = sqliteTable(
  "Conversation",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name"),
  organizationId: text("organizationId").notNull().references((): AnySQLiteColumn => organizationTable.id, { onDelete: "cascade" }),
  isGroupChat: integer("isGroupChat", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  }
)

export type Conversation = typeof conversationTable.$inferSelect
export type NewConversation = typeof conversationTable.$inferInsert

export const conversationParticipantTable = sqliteTable(
  "ConversationParticipant",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  conversationId: text("conversationId").notNull().references((): AnySQLiteColumn => conversationTable.id, { onDelete: "cascade" }),
  joinedAt: integer("joinedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastReadAt: integer("lastReadAt", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("ConversationParticipant_userId_conversationId_key").on(t.userId, t.conversationId),
  ]
)

export type ConversationParticipant = typeof conversationParticipantTable.$inferSelect
export type NewConversationParticipant = typeof conversationParticipantTable.$inferInsert

export const messageTable = sqliteTable(
  "Message",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  content: text("content").notNull(),
  senderId: text("senderId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  conversationId: text("conversationId").notNull().references((): AnySQLiteColumn => conversationTable.id, { onDelete: "cascade" }),
  fileId: text("fileId").references((): AnySQLiteColumn => fileUploadTable.id, { onDelete: "set null" }),
  fileUrl: text("fileUrl"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("Message_conversationId_idx").on(t.conversationId),
  ]
)

export type Message = typeof messageTable.$inferSelect
export type NewMessage = typeof messageTable.$inferInsert

export const notificationTable = sqliteTable(
  "Notification",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  type: text("type", { enum: NotificationTypeValues }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isRead: integer("isRead", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id, { onDelete: "cascade" }),
  projectId: text("projectId").references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  componentId: text("componentId").references((): AnySQLiteColumn => componentTable.id, { onDelete: "cascade" }),
  messageId: text("messageId").references((): AnySQLiteColumn => messageTable.id, { onDelete: "cascade" }),
  linkUrl: text("linkUrl"),
  }
)

export type Notification = typeof notificationTable.$inferSelect
export type NewNotification = typeof notificationTable.$inferInsert

export const pushSubscriptionTable = sqliteTable(
  "PushSubscription",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  }
)

export type PushSubscription = typeof pushSubscriptionTable.$inferSelect
export type NewPushSubscription = typeof pushSubscriptionTable.$inferInsert

export const componentVersionTable = sqliteTable(
  "ComponentVersion",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  componentId: text("componentId").notNull().references((): AnySQLiteColumn => componentTable.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull(),
  changeMessage: text("changeMessage"),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  }
)

export type ComponentVersion = typeof componentVersionTable.$inferSelect
export type NewComponentVersion = typeof componentVersionTable.$inferInsert

export const componentCommentTable = sqliteTable(
  "ComponentComment",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  componentId: text("componentId").notNull().references((): AnySQLiteColumn => componentTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  }
)

export type ComponentComment = typeof componentCommentTable.$inferSelect
export type NewComponentComment = typeof componentCommentTable.$inferInsert

export const tokenTable = sqliteTable(
  "Token",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  token: text("token").notNull().unique(),
  type: text("type").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("Token_userId_idx").on(t.userId),
    index("Token_token_idx").on(t.token),
  ]
)

export type Token = typeof tokenTable.$inferSelect
export type NewToken = typeof tokenTable.$inferInsert

export const pluginRegistryEntryTable = sqliteTable(
  "PluginRegistryEntry",
  {
  id: text("id").primaryKey(),
  manifestJson: text("manifestJson").notNull(),
  state: text("state").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  version: text("version").notNull(),
  installedAt: integer("installedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  errorCount: integer("errorCount").notNull().default(0),
  lastError: text("lastError"),
  }
)

export type PluginRegistryEntry = typeof pluginRegistryEntryTable.$inferSelect
export type NewPluginRegistryEntry = typeof pluginRegistryEntryTable.$inferInsert

export const pluginConfigurationTable = sqliteTable(
  "PluginConfiguration",
  {
  pluginId: text("pluginId").primaryKey().references((): AnySQLiteColumn => pluginRegistryEntryTable.id, { onDelete: "cascade" }),
  configJson: text("configJson").notNull(),
  }
)

export type PluginConfiguration = typeof pluginConfigurationTable.$inferSelect
export type NewPluginConfiguration = typeof pluginConfigurationTable.$inferInsert

export const apiKeyTable = sqliteTable(
  "ApiKey",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  keyHash: text("keyHash").notNull().unique(),
  name: text("name").notNull(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  lastUsed: integer("lastUsed", { mode: "timestamp_ms" }),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("ApiKey_userId_idx").on(t.userId),
  ]
)

export type ApiKey = typeof apiKeyTable.$inferSelect
export type NewApiKey = typeof apiKeyTable.$inferInsert

export const toolWearCostTable = sqliteTable(
  "ToolWearCost",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  toolId: text("toolId").notNull().references((): AnySQLiteColumn => toolTable.id, { onDelete: "cascade" }),
  wearRatePerMeter: real("wearRatePerMeter").notNull(),
  replacementCost: real("replacementCost").notNull(),
  replacementThreshold: real("replacementThreshold").notNull().default(100),
  currencyCode: text("currencyCode").notNull().default("EUR"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type ToolWearCost = typeof toolWearCostTable.$inferSelect
export type NewToolWearCost = typeof toolWearCostTable.$inferInsert

export const materialCostTable = sqliteTable(
  "MaterialCost",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  materialId: text("materialId").notNull().references((): AnySQLiteColumn => materialTable.id, { onDelete: "cascade" }),
  costPerUnit: real("costPerUnit").notNull(),
  wasteFactor: real("wasteFactor").notNull().default(0),
  minimumCharge: real("minimumCharge").notNull().default(0),
  currencyCode: text("currencyCode").notNull().default("EUR"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type MaterialCost = typeof materialCostTable.$inferSelect
export type NewMaterialCost = typeof materialCostTable.$inferInsert

export const operationCostTable = sqliteTable(
  "OperationCost",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  machineHourlyRate: real("machineHourlyRate").notNull(),
  operatorHourlyRate: real("operatorHourlyRate").notNull(),
  setupTime: real("setupTime").notNull().default(30),
  currencyCode: text("currencyCode").notNull().default("EUR"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").notNull().references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type OperationCost = typeof operationCostTable.$inferSelect
export type NewOperationCost = typeof operationCostTable.$inferInsert

export const productionCostEstimateTable = sqliteTable(
  "ProductionCostEstimate",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  toolpathId: text("toolpathId").notNull().references((): AnySQLiteColumn => toolpathTable.id, { onDelete: "cascade" }),
  materialCost: real("materialCost").notNull(),
  toolWearCost: real("toolWearCost").notNull(),
  machineTime: real("machineTime").notNull(),
  machineTimeCost: real("machineTimeCost").notNull(),
  operatorTime: real("operatorTime").notNull(),
  operatorTimeCost: real("operatorTimeCost").notNull(),
  setupCost: real("setupCost").notNull(),
  totalCost: real("totalCost").notNull(),
  currencyCode: text("currencyCode").notNull().default("EUR"),
  details: text("details", { mode: "json" }).notNull().default({}),
  operationCostId: text("operationCostId").references((): AnySQLiteColumn => operationCostTable.id),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").notNull().references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type ProductionCostEstimate = typeof productionCostEstimateTable.$inferSelect
export type NewProductionCostEstimate = typeof productionCostEstimateTable.$inferInsert

export const costSettingsTable = sqliteTable(
  "CostSettings",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  defaultCurrencyCode: text("defaultCurrencyCode").notNull().default("EUR"),
  defaultMachineHourlyRate: real("defaultMachineHourlyRate").notNull().default(50),
  defaultOperatorHourlyRate: real("defaultOperatorHourlyRate").notNull().default(30),
  defaultSetupTime: real("defaultSetupTime").notNull().default(30),
  calculateAutomatically: integer("calculateAutomatically", { mode: "boolean" }).notNull().default(true),
  additionalSettings: text("additionalSettings", { mode: "json" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  ownerId: text("ownerId").notNull().unique().references((): AnySQLiteColumn => userTable.id),
  organizationId: text("organizationId").unique().references((): AnySQLiteColumn => organizationTable.id),
  }
)

export type CostSettings = typeof costSettingsTable.$inferSelect
export type NewCostSettings = typeof costSettingsTable.$inferInsert

export const mCPServerConfigTable = sqliteTable(
  "MCPServerConfig",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  type: text("type").notNull().default("sse"),
  url: text("url"),
  command: text("command"),
  args: text("args", { mode: "json" }),
  workingDirectory: text("workingDirectory"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  userId: text("userId"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("MCPServerConfig_userId_idx").on(t.userId),
  ]
)

export type MCPServerConfig = typeof mCPServerConfigTable.$inferSelect
export type NewMCPServerConfig = typeof mCPServerConfigTable.$inferInsert

export const passkeyTable = sqliteTable(
  "passkey",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name"),
  publicKey: text("publicKey").notNull(),
  userId: text("userId").notNull().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  credentialID: text("credentialID").notNull().unique(),
  counter: integer("counter").notNull(),
  deviceType: text("deviceType").notNull(),
  backedUp: integer("backedUp", { mode: "boolean" }).notNull(),
  transports: text("transports"),
  aaguid: text("aaguid"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  }
)

export type Passkey = typeof passkeyTable.$inferSelect
export type NewPasskey = typeof passkeyTable.$inferInsert

export const twoFactorTable = sqliteTable(
  "twoFactor",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  userId: text("userId").notNull().unique().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backupCodes").notNull(),
  }
)

export type TwoFactor = typeof twoFactorTable.$inferSelect
export type NewTwoFactor = typeof twoFactorTable.$inferInsert


// ── Version control (WP11): one git-compatible repository per project ───────

export const gitRepoTable = sqliteTable(
  "GitRepo",
  {
  projectId: text("projectId").primaryKey().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  /** Symbolic HEAD, e.g. `refs/heads/main`. */
  head: text("head").notNull().default("refs/heads/main"),
  /** Optional GitHub mirror as `owner/repo`; the token lives in the OS keychain, never here. */
  remote: text("remote"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  }
)

export type GitRepo = typeof gitRepoTable.$inferSelect

export const gitObjectTable = sqliteTable(
  "GitObject",
  {
  projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  oid: text("oid").notNull(),
  type: text("type", { enum: ["blob", "tree", "commit"] }).notNull(),
  body: blob("body", { mode: "buffer" }).notNull(),
  },
  (t) => [uniqueIndex("GitObject_projectId_oid_key").on(t.projectId, t.oid)]
)

export type GitObject = typeof gitObjectTable.$inferSelect

export const gitRefTable = sqliteTable(
  "GitRef",
  {
  projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  oid: text("oid").notNull(),
  },
  (t) => [uniqueIndex("GitRef_projectId_name_key").on(t.projectId, t.name)]
)

export type GitRef = typeof gitRefTable.$inferSelect

/**
 * Each user's local git identity (`user.name` / `user.email`): every commit, merge and restore that user
 * makes is signed with it, and an AI commit on their behalf as `<name> (AI)`. Created on first use.
 */
export const gitProfileTable = sqliteTable(
  "GitProfile",
  {
  userId: text("userId").primaryKey().references((): AnySQLiteColumn => userTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  }
)

export type GitProfile = typeof gitProfileTable.$inferSelect

export const pullRequestTable = sqliteTable(
  "PullRequest",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  /** Per-project sequence, shown as `#n`. */
  number: integer("number").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  /** Source and target branch names. */
  head: text("head").notNull(),
  base: text("base").notNull(),
  state: text("state", { enum: ["open", "merged", "closed"] }).notNull().default("open"),
  authorId: text("authorId").notNull().references((): AnySQLiteColumn => userTable.id),
  /** `user`, or `ai` when opened by the mobile companion / an AI agent on the author's behalf. */
  authorKind: text("authorKind", { enum: ["user", "ai"] }).notNull().default("user"),
  mergeCommit: text("mergeCommit"),
  /** Number of the mirrored pull request on GitHub, when the project has a remote. */
  remoteNumber: integer("remoteNumber"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [uniqueIndex("PullRequest_projectId_number_key").on(t.projectId, t.number)]
)

export type PullRequest = typeof pullRequestTable.$inferSelect

export const pullRequestReviewTable = sqliteTable(
  "PullRequestReview",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  pullRequestId: text("pullRequestId").notNull().references((): AnySQLiteColumn => pullRequestTable.id, { onDelete: "cascade" }),
  reviewerId: text("reviewerId").notNull().references((): AnySQLiteColumn => userTable.id),
  verdict: text("verdict", { enum: ["comment", "approve", "request-changes"] }).notNull(),
  body: text("body").notNull().default(""),
  /** Optional anchor: repository path and JSON pointer of the entity property being discussed. */
  path: text("path"),
  pointer: text("pointer"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("PullRequestReview_pullRequestId_idx").on(t.pullRequestId)]
)

export type PullRequestReview = typeof pullRequestReviewTable.$inferSelect

export const workflowRunTable = sqliteTable(
  "WorkflowRun",
  {
  id: text("id").primaryKey().$defaultFn(newId),
  projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
  /** Workflow file name under `.cadcamfun/workflows/`. */
  workflow: text("workflow").notNull(),
  event: text("event", { enum: ["push", "pull-request", "manual"] }).notNull(),
  ref: text("ref").notNull(),
  sha: text("sha").notNull(),
  status: text("status", { enum: ["queued", "running", "success", "failure"] }).notNull().default("queued"),
  /** Streamed `RunEvent`s of @cadcamfun/workflow. */
  events: text("events", { mode: "json" }).notNull().$defaultFn(() => []),
  startedAt: integer("startedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  finishedAt: integer("finishedAt", { mode: "timestamp_ms" }),
  },
  (t) => [index("WorkflowRun_projectId_idx").on(t.projectId)]
)

export type WorkflowRun = typeof workflowRunTable.$inferSelect

// CAD surfacing slice (`specs/14-cad-cam-parity-roadmap.md` §5.1): persisted
// triangle-mesh results and a focused audit log for CAD surface operations.
// These two tables live alongside the existing ActivityLog and AIAnalysisLog
// because they record a higher-frequency, lower-stakes stream than the
// general activity log. Foreign keys cascade from the owning project.

export const meshAssetTable = sqliteTable(
  "MeshAsset",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
    /** Shape kind that produced this asset (e.g. "chamferBox", "sweep", "loft"). */
    kind: text("kind").notNull(),
    /** Inputs to the operation as JSON: the BoxSolid schema, sweep profile/path, etc. */
    inputs: text("inputs", { mode: "json" }).notNull(),
    /** Compact summary: vertex count, triangle count, signed volume (mm³), bounds. */
    stats: text("stats", { mode: "json" }).notNull(),
    /** The actual triangle mesh, stored as a JSON-friendly view (positions + indices as `number[]`). */
    mesh: text("mesh", { mode: "json" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("MeshAsset_projectId_kind_idx").on(t.projectId, t.kind)]
)

export type MeshAsset = typeof meshAssetTable.$inferSelect
export type NewMeshAsset = typeof meshAssetTable.$inferInsert

export const cadOperationLogTable = sqliteTable(
  "CadOperationLog",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    projectId: text("projectId").notNull().references((): AnySQLiteColumn => projectTable.id, { onDelete: "cascade" }),
    /** Surface kind: "chamferBox" | "chamferCylinderTop" | "sweep" | "loft" | "shell". */
    operation: text("operation").notNull(),
    /** Asset that resulted, when successful; null on error. */
    meshAssetId: text("meshAssetId").references((): AnySQLiteColumn => meshAssetTable.id, { onDelete: "set null" }),
    /** Outcome: "ok" or "error". */
    outcome: text("outcome", { enum: ["ok", "error"] }).notNull(),
    /** Wall-clock cost in milliseconds (recorded by the OTel span exporter). */
    durationMs: real("durationMs").notNull(),
    /** Inputs as JSON for replay; errors carry a message in `error`. */
    inputs: text("inputs", { mode: "json" }).notNull(),
    error: text("error"),
    /** OpenTelemetry trace id, hex-encoded (32 chars). */
    traceId: text("traceId"),
    /** OpenTelemetry span id, hex-encoded (16 chars). */
    spanId: text("spanId"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("CadOperationLog_projectId_idx").on(t.projectId)]
)

export type CadOperationLog = typeof cadOperationLogTable.$inferSelect
export type NewCadOperationLog = typeof cadOperationLogTable.$inferInsert

/** Local application KV state. Provider credentials belong in the protected credential store, never here. */
export const localKeyValueTable = sqliteTable("LocalKeyValue", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date())
})

export type LocalKeyValue = typeof localKeyValueTable.$inferSelect
export type NewLocalKeyValue = typeof localKeyValueTable.$inferInsert

