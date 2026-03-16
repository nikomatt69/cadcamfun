-- Add performance indexes for frequently queried fields

-- Project indexes
CREATE INDEX IF NOT EXISTS "Project_ownerId_idx" ON "Project"("ownerId");
CREATE INDEX IF NOT EXISTS "Project_organizationId_idx" ON "Project"("organizationId");
CREATE INDEX IF NOT EXISTS "Project_isPublic_idx" ON "Project"("isPublic");
CREATE INDEX IF NOT EXISTS "Project_createdAt_idx" ON "Project"("createdAt");
CREATE INDEX IF NOT EXISTS "Project_updatedAt_idx" ON "Project"("updatedAt");

-- Drawing indexes
CREATE INDEX IF NOT EXISTS "Drawing_projectId_idx" ON "Drawing"("projectId");
CREATE INDEX IF NOT EXISTS "Drawing_createdAt_idx" ON "Drawing"("createdAt");

-- Component indexes
CREATE INDEX IF NOT EXISTS "Component_projectId_idx" ON "Component"("projectId");
CREATE INDEX IF NOT EXISTS "Component_ownerId_idx" ON "Component"("ownerId");
CREATE INDEX IF NOT EXISTS "Component_isPublic_idx" ON "Component"("isPublic");

-- Toolpath indexes
CREATE INDEX IF NOT EXISTS "Toolpath_projectId_idx" ON "Toolpath"("projectId");
CREATE INDEX IF NOT EXISTS "Toolpath_createdById_idx" ON "Toolpath"("createdById");
CREATE INDEX IF NOT EXISTS "Toolpath_drawingId_idx" ON "Toolpath"("drawingId");
CREATE INDEX IF NOT EXISTS "Toolpath_createdAt_idx" ON "Toolpath"("createdAt");

-- Material indexes
CREATE INDEX IF NOT EXISTS "Material_ownerId_idx" ON "Material"("ownerId");
CREATE INDEX IF NOT EXISTS "Material_organizationId_idx" ON "Material"("organizationId");
CREATE INDEX IF NOT EXISTS "Material_isPublic_idx" ON "Material"("isPublic");

-- Tool indexes
CREATE INDEX IF NOT EXISTS "Tool_ownerId_idx" ON "Tool"("ownerId");
CREATE INDEX IF NOT EXISTS "Tool_organizationId_idx" ON "Tool"("organizationId");
CREATE INDEX IF NOT EXISTS "Tool_isPublic_idx" ON "Tool"("isPublic");

-- MachineConfig indexes
CREATE INDEX IF NOT EXISTS "MachineConfig_ownerId_idx" ON "MachineConfig"("ownerId");
CREATE INDEX IF NOT EXISTS "MachineConfig_organizationId_idx" ON "MachineConfig"("organizationId");

-- LibraryItem indexes
CREATE INDEX IF NOT EXISTS "LibraryItem_ownerId_idx" ON "LibraryItem"("ownerId");
CREATE INDEX IF NOT EXISTS "LibraryItem_organizationId_idx" ON "LibraryItem"("organizationId");
CREATE INDEX IF NOT EXISTS "LibraryItem_category_idx" ON "LibraryItem"("category");

-- Notification indexes
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx" ON "Notification"("isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

-- UserOrganization indexes
CREATE INDEX IF NOT EXISTS "UserOrganization_userId_idx" ON "UserOrganization"("userId");
CREATE INDEX IF NOT EXISTS "UserOrganization_organizationId_idx" ON "UserOrganization"("organizationId");

-- Message indexes
CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
