-- Continuation of migration.sql - Part 4 (Indexes, Constraints & Foreign Keys)

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Authenticator_credentialID_key" ON "Authenticator"("credentialID");
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE UNIQUE INDEX "OrganizationInvitation_token_key" ON "OrganizationInvitation"("token");
CREATE UNIQUE INDEX "UserOrganization_userId_organizationId_key" ON "UserOrganization"("userId", "organizationId");
CREATE UNIQUE INDEX "ConversationParticipant_userId_conversationId_key" ON "ConversationParticipant"("userId", "conversationId");
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE UNIQUE INDEX "Token_token_key" ON "Token"("token");
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE UNIQUE INDEX "CostSettings_ownerId_key" ON "CostSettings"("ownerId");
CREATE UNIQUE INDEX "CostSettings_organizationId_key" ON "CostSettings"("organizationId");
CREATE UNIQUE INDEX "MarketplaceItem_polarProductId_key" ON "MarketplaceItem"("polarProductId");
CREATE UNIQUE INDEX "MarketplaceSeller_userId_key" ON "MarketplaceSeller"("userId");
CREATE UNIQUE INDEX "MarketplaceSeller_storeUrl_key" ON "MarketplaceSeller"("storeUrl");
CREATE UNIQUE INDEX "MarketplaceSeller_polarCustomerId_key" ON "MarketplaceSeller"("polarCustomerId");
CREATE UNIQUE INDEX "MarketplaceOrder_orderNumber_key" ON "MarketplaceOrder"("orderNumber");
CREATE UNIQUE INDEX "MarketplaceOrder_polarCheckoutId_key" ON "MarketplaceOrder"("polarCheckoutId");
CREATE UNIQUE INDEX "MarketplaceReview_orderId_key" ON "MarketplaceReview"("orderId");
CREATE UNIQUE INDEX "MarketplaceCategory_slug_key" ON "MarketplaceCategory"("slug");
CREATE UNIQUE INDEX "MarketplaceCollection_slug_key" ON "MarketplaceCollection"("slug");
CREATE UNIQUE INDEX "MarketplaceCollectionItem_collectionId_itemId_key" ON "MarketplaceCollectionItem"("collectionId", "itemId");
CREATE UNIQUE INDEX "MarketplaceWishlist_userId_itemId_key" ON "MarketplaceWishlist"("userId", "itemId");

-- CreateIndex for performance
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX "Token_userId_idx" ON "Token"("userId");
CREATE INDEX "Token_token_idx" ON "Token"("token");
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE INDEX "MCPServerConfig_userId_idx" ON "MCPServerConfig"("userId");
CREATE INDEX "MarketplaceItem_sellerId_idx" ON "MarketplaceItem"("sellerId");
CREATE INDEX "MarketplaceItem_type_idx" ON "MarketplaceItem"("type");
CREATE INDEX "MarketplaceItem_status_idx" ON "MarketplaceItem"("status");
CREATE INDEX "MarketplaceItem_category_idx" ON "MarketplaceItem"("category");
CREATE INDEX "MarketplaceItem_featured_idx" ON "MarketplaceItem"("featured");
CREATE INDEX "MarketplaceOrder_buyerId_idx" ON "MarketplaceOrder"("buyerId");
CREATE INDEX "MarketplaceOrder_sellerId_idx" ON "MarketplaceOrder"("sellerId");
CREATE INDEX "MarketplaceOrder_itemId_idx" ON "MarketplaceOrder"("itemId");
CREATE INDEX "MarketplaceOrder_status_idx" ON "MarketplaceOrder"("status");
CREATE INDEX "MarketplaceReview_itemId_idx" ON "MarketplaceReview"("itemId");
CREATE INDEX "MarketplaceReview_buyerId_idx" ON "MarketplaceReview"("buyerId");
CREATE INDEX "MarketplaceCategory_parentId_idx" ON "MarketplaceCategory"("parentId");
CREATE INDEX "MarketplaceCollection_sellerId_idx" ON "MarketplaceCollection"("sellerId");
CREATE INDEX "MarketplacePayout_sellerId_idx" ON "MarketplacePayout"("sellerId");

-- AddForeignKey
ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrawingVersion" ADD CONSTRAINT "DrawingVersion_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Component" ADD CONSTRAINT "Component_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_machineConfigId_fkey" FOREIGN KEY ("machineConfigId") REFERENCES "MachineConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolpathVersion" ADD CONSTRAINT "ToolpathVersion_toolpathId_fkey" FOREIGN KEY ("toolpathId") REFERENCES "Toolpath"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolpathVersion" ADD CONSTRAINT "ToolpathVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolpathComment" ADD CONSTRAINT "ToolpathComment_toolpathId_fkey" FOREIGN KEY ("toolpathId") REFERENCES "Toolpath"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolpathComment" ADD CONSTRAINT "ToolpathComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MachineConfig" ADD CONSTRAINT "MachineConfig_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIAnalysisLog" ADD CONSTRAINT "AIAnalysisLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentVersion" ADD CONSTRAINT "ComponentVersion_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentVersion" ADD CONSTRAINT "ComponentVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComponentComment" ADD CONSTRAINT "ComponentComment_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponentComment" ADD CONSTRAINT "ComponentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Token" ADD CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PluginConfiguration" ADD CONSTRAINT "PluginConfiguration_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginRegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Production Cost Foreign Keys
ALTER TABLE "ToolWearCost" ADD CONSTRAINT "ToolWearCost_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolWearCost" ADD CONSTRAINT "ToolWearCost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolWearCost" ADD CONSTRAINT "ToolWearCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialCost" ADD CONSTRAINT "MaterialCost_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialCost" ADD CONSTRAINT "MaterialCost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialCost" ADD CONSTRAINT "MaterialCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationCost" ADD CONSTRAINT "OperationCost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationCost" ADD CONSTRAINT "OperationCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_toolpathId_fkey" FOREIGN KEY ("toolpathId") REFERENCES "Toolpath"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_operationCostId_fkey" FOREIGN KEY ("operationCostId") REFERENCES "OperationCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostSettings" ADD CONSTRAINT "CostSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostSettings" ADD CONSTRAINT "CostSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Marketplace Foreign Keys
ALTER TABLE "MarketplaceItem" ADD CONSTRAINT "MarketplaceItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "MarketplaceSeller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceSeller" ADD CONSTRAINT "MarketplaceSeller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "MarketplaceSeller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MarketplaceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MarketplaceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplaceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceCategory" ADD CONSTRAINT "MarketplaceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MarketplaceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketplaceCollection" ADD CONSTRAINT "MarketplaceCollection_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "MarketplaceSeller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketplaceCollectionItem" ADD CONSTRAINT "MarketplaceCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MarketplaceCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceCollectionItem" ADD CONSTRAINT "MarketplaceCollectionItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MarketplaceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceWishlist" ADD CONSTRAINT "MarketplaceWishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceWishlist" ADD CONSTRAINT "MarketplaceWishlist_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MarketplaceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplacePayout" ADD CONSTRAINT "MarketplacePayout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "MarketplaceSeller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insert some initial data
INSERT INTO "MarketplaceCategory" ("id", "name", "slug", "description") VALUES 
  ('cat_components', 'Components', 'components', 'CAD components and parts'),
  ('cat_drawings', 'Drawings', 'drawings', '2D technical drawings'),
  ('cat_projects', 'Projects', 'projects', 'Complete CAD/CAM projects'),
  ('cat_gcode', 'G-Code', 'gcode', 'CNC machine code files'),
  ('cat_toolpaths', 'Toolpaths', 'toolpaths', 'Machining toolpath definitions');

-- Migration completed successfully 