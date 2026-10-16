# Legacy API inventory (source of truth for API parity)

Generated from `.reference/src/pages/api` (184 route files). The v6 sidecar must expose the **same paths, methods, request/response shapes and status codes** under the same `/api` prefix. Methods are detected heuristically (`?` = read the source file); `auth` = route checks a session/token; `sub` = plan-gated; `tables` = Prisma models touched (map to Drizzle tables of the same name, `xTable`).

| Route | Methods | Auth | Sub | Tables | Lines | Legacy source |
|---|---|---|---|---|---|---|
| `/api` | ? |  |  |  | 14 | `src/pages/api/index.ts` |
| `/api/ai/analyze-gcode` | POST | y |  |  | 28 | `src/pages/api/ai/analyze-gcode.ts` |
| `/api/ai/anthropic-proxy` | POST |  |  |  | 95 | `src/pages/api/ai/anthropic-proxy.ts` |
| `/api/ai/anthropic-stream` | POST | y |  |  | 114 | `src/pages/api/ai/anthropic-stream.ts` |
| `/api/ai/chat` | POST | y |  | mCPServerConfig | 111 | `src/pages/api/ai/chat.ts` |
| `/api/ai/code-interpreter` | POST |  |  |  | 269 | `src/pages/api/ai/code-interpreter/index.ts` |
| `/api/ai/code-interpreter/containers` | GET, POST |  |  |  | 100 | `src/pages/api/ai/code-interpreter/containers/index.ts` |
| `/api/ai/code-interpreter/containers/:id` | DELETE, GET |  |  |  | 94 | `src/pages/api/ai/code-interpreter/containers/[id].ts` |
| `/api/ai/code-interpreter/containers/:id/files` | GET |  |  |  | 53 | `src/pages/api/ai/code-interpreter/containers/[id]/files.ts` |
| `/api/ai/code-interpreter/files` | POST |  |  |  | 115 | `src/pages/api/ai/code-interpreter/files/index.ts` |
| `/api/ai/code-interpreter/files/:id` | GET |  |  |  | 44 | `src/pages/api/ai/code-interpreter/files/[id].ts` |
| `/api/ai/code-interpreter/files/upload` | POST |  |  |  | 100 | `src/pages/api/ai/code-interpreter/files/upload.ts` |
| `/api/ai/completion` | POST | y |  |  | 34 | `src/pages/api/ai/completion.ts` |
| `/api/ai/continuous-agent` | DELETE, GET, OPTIONS, POST |  |  |  | 201 | `src/pages/api/ai/continuous-agent.ts` |
| `/api/ai/feedback` | POST |  |  |  | 44 | `src/pages/api/ai/feedback.ts` |
| `/api/ai/gcode` | POST | y |  |  | 130 | `src/pages/api/ai/gcode.ts` |
| `/api/ai/mcp` | POST | y |  |  | 152 | `src/pages/api/ai/mcp.ts` |
| `/api/ai/mcp-test` | GET, POST | y |  |  | 133 | `src/pages/api/ai/mcp-test.ts` |
| `/api/ai/openai-proxy` | POST |  |  |  | 54 | `src/pages/api/ai/openai-proxy.ts` |
| `/api/ai/openai-vision-proxy` | POST |  |  |  | 237 | `src/pages/api/ai/openai-vision-proxy.ts` |
| `/api/ai/proxy` | POST | y |  |  | 51 | `src/pages/api/ai/proxy.ts` |
| `/api/ai/toolpath-analysis` | POST | y |  |  | 60 | `src/pages/api/ai/toolpath-analysis.ts` |
| `/api/ai/websearch` | POST | y |  |  | 136 | `src/pages/api/ai/websearch.ts` |
| `/api/analytics` | GET | y |  | user | 94 | `src/pages/api/analytics/index.ts` |
| `/api/analytics/dashboard-data` | GET | y |  | component, drawing, project, toolpath | 167 | `src/pages/api/analytics/dashboard-data.ts` |
| `/api/analytics/log-view` | ? | y |  |  | 21 | `src/pages/api/analytics/log-view.ts` |
| `/api/analytics/recent-activity` | GET | y |  | component, drawing, project, toolpath | 154 | `src/pages/api/analytics/recent-activity.ts` |
| `/api/analytics/system-metrics` | GET | y |  |  | 73 | `src/pages/api/analytics/system-metrics.ts` |
| `/api/analytics/track` | POST | y |  |  | 70 | `src/pages/api/analytics/track.ts` |
| `/api/analytics/user-history` | GET | y |  |  | 56 | `src/pages/api/analytics/user-history.ts` |
| `/api/analytics/user-metrics` | GET | y |  | aIAnalysisLog, activityLog, component, drawing, fileUpload, project, toolpath, user | 413 | `src/pages/api/analytics/user-metrics.ts` |
| `/api/analytics/user-usage` | DELETE, GET | y |  | user | 105 | `src/pages/api/analytics/user-usage.ts` |
| `/api/app-control/notify` | POST |  |  |  | 27 | `src/pages/api/app-control/notify.ts` |
| `/api/auth/forgot-password` | POST |  |  | user | 107 | `src/pages/api/auth/forgot-password.ts` |
| `/api/auth/get-session` | GET | y |  | user | 85 | `src/pages/api/auth/get-session.ts` |
| `/api/auth/passkey-register` | POST |  |  |  | 32 | `src/pages/api/auth/passkey-register.ts` |
| `/api/auth/reset-password` | POST |  |  | user | 132 | `src/pages/api/auth/reset-password.ts` |
| `/api/auth/send-magic-link` | POST |  |  | user | 109 | `src/pages/api/auth/send-magic-link.ts` |
| `/api/auth/send-verification-email` | POST |  |  | user | 90 | `src/pages/api/auth/send-verification-email.ts` |
| `/api/auth/signin-direct` | POST |  |  | user | 115 | `src/pages/api/auth/signin-direct.ts` |
| `/api/auth/signout` | POST |  |  |  | 52 | `src/pages/api/auth/signout.ts` |
| `/api/auth/signup` | POST |  |  | user | 131 | `src/pages/api/auth/signup.ts` |
| `/api/auth/test-direct-create` | POST |  |  | user | 63 | `src/pages/api/auth/test-direct-create.ts` |
| `/api/auth/verify-email` | POST |  |  | user | 95 | `src/pages/api/auth/verify-email.ts` |
| `/api/auth/verify-magic-link` | POST |  |  | user | 109 | `src/pages/api/auth/verify-magic-link.ts` |
| `/api/better-auth-stripe/billing-portal` | POST | y |  |  | 47 | `src/pages/api/better-auth-stripe/billing-portal.ts` |
| `/api/better-auth-stripe/feature-access` | POST | y |  |  | 70 | `src/pages/api/better-auth-stripe/feature-access.ts` |
| `/api/better-auth-stripe/subscription` | DELETE, GET, POST, PUT | y |  |  | 118 | `src/pages/api/better-auth-stripe/subscription.ts` |
| `/api/better-auth-stripe/sync` | POST | y |  |  | 45 | `src/pages/api/better-auth-stripe/sync.ts` |
| `/api/components` | GET, POST | y |  | component, project | 122 | `src/pages/api/components/index.ts` |
| `/api/components/:id` | DELETE, GET, PUT | y |  | component, project | 187 | `src/pages/api/components/[id].ts` |
| `/api/components/:id/analysis` | GET | y |  | component | 302 | `src/pages/api/components/[id]/analysis.ts` |
| `/api/components/:id/comments` | GET, POST | y |  | component, componentComment | 80 | `src/pages/api/components/[id]/comments/index.ts` |
| `/api/components/:id/comments/:commentId` | DELETE, PUT | y |  | component, componentComment | 87 | `src/pages/api/components/[id]/comments/[commentId].ts` |
| `/api/components/:id/details` | GET | y |  | component, drawing | 106 | `src/pages/api/components/[id]/details.ts` |
| `/api/components/:id/relationships` | GET | y |  | component | 136 | `src/pages/api/components/[id]/relationships/index.ts` |
| `/api/components/:id/storage` | DELETE, GET, POST | y |  | component | 146 | `src/pages/api/components/[id]/storage.ts` |
| `/api/components/:id/versions` | GET, POST | y |  | component, componentVersion | 120 | `src/pages/api/components/[id]/versions/index.ts` |
| `/api/components/:id/versions/:versionId` | GET | y |  | component, componentVersion | 59 | `src/pages/api/components/[id]/versions/[versionId].ts` |
| `/api/components/:id/versions/restore` | POST | y |  | component, componentVersion | 109 | `src/pages/api/components/[id]/versions/restore.ts` |
| `/api/components/export-import` | GET, POST | y |  | component, project | 350 | `src/pages/api/components/export-import.ts` |
| `/api/components/library` | GET | y |  |  | 67 | `src/pages/api/components/library.ts` |
| `/api/conversation/:id` | GET | y |  | conversation, conversationParticipant | 87 | `src/pages/api/conversation/[id]/index.ts` |
| `/api/conversation/:id` | GET, PATCH | y |  | conversation, conversationParticipant | 147 | `src/pages/api/conversation/[id].ts` |
| `/api/conversation/:id/messages` | GET, POST | y |  | conversation, conversationParticipant, message | 122 | `src/pages/api/conversation/[id]/messages.ts` |
| `/api/conversation/:id/read` | POST | y |  | conversationParticipant | 55 | `src/pages/api/conversation/[id]/read.ts` |
| `/api/cron/update-expired-trials` | GET, POST |  |  |  | 63 | `src/pages/api/cron/update-expired-trials.ts` |
| `/api/desktop/auth/signin` | POST |  |  | activityLog, user | 154 | `src/pages/api/desktop/auth/signin.ts` |
| `/api/desktop/projects` | GET, POST | y |  | activityLog, organization, project | 274 | `src/pages/api/desktop/projects/index.ts` |
| `/api/desktop/user/by-email` | GET | y |  | user | 132 | `src/pages/api/desktop/user/by-email.ts` |
| `/api/download` | GET |  |  |  | 33 | `src/pages/api/download.ts` |
| `/api/drawings/:id` | DELETE, GET, PUT | y |  | drawing | 103 | `src/pages/api/drawings/[id].ts` |
| `/api/drawings/:id/toolpaths` | GET, POST | y |  | drawing, toolpath | 119 | `src/pages/api/drawings/[id]/toolpaths.ts` |
| `/api/graphql-playground` | ? | y |  |  | 354 | `src/pages/api/graphql-playground.ts` |
| `/api/health` | GET |  |  |  | 57 | `src/pages/api/health.ts` |
| `/api/health/stripe` | GET |  |  |  | 35 | `src/pages/api/health/stripe.ts` |
| `/api/invitations/:token/accept` | POST | y |  | organizationInvitation, user, userOrganization | 113 | `src/pages/api/invitations/[token]/accept.ts` |
| `/api/library` | GET, POST | y |  | libraryItem, userOrganization | 113 | `src/pages/api/library/index.ts` |
| `/api/library/:id` | DELETE, GET, PUT | y |  | libraryItem, userOrganization | 132 | `src/pages/api/library/[id].ts` |
| `/api/library/components` | GET | y |  | libraryItem | 35 | `src/pages/api/library/components.ts` |
| `/api/library/materials` | GET | y |  | material | 35 | `src/pages/api/library/materials.ts` |
| `/api/library/tools` | GET | y |  | tool | 35 | `src/pages/api/library/tools.ts` |
| `/api/machine-configs` | GET, POST | y |  | machineConfig | 192 | `src/pages/api/machine-configs/index.ts` |
| `/api/machine-configs/:id` | DELETE, GET, PUT | y |  | machineConfig, toolpath, userOrganization | 261 | `src/pages/api/machine-configs/[id].ts` |
| `/api/machine-configs/:id/clone` | POST | y |  | machineConfig | 77 | `src/pages/api/machine-configs/[id]/clone.ts` |
| `/api/machine-configs/:id/storage` | DELETE, GET, POST | y |  | machineConfig | 143 | `src/pages/api/machine-configs/[id]/storage.ts` |
| `/api/machine-configs/export-import` | GET, POST | y |  | machineConfig, userOrganization | 332 | `src/pages/api/machine-configs/export-import.ts` |
| `/api/materials` | GET, POST | y |  | material, userOrganization | 103 | `src/pages/api/materials/index.ts` |
| `/api/materials/:id` | DELETE, GET, PUT | y |  | material, userOrganization | 127 | `src/pages/api/materials/[id].ts` |
| `/api/materials/:id/storage` | DELETE, GET, POST | y |  | material, userOrganization | 169 | `src/pages/api/materials/[id]/storage.ts` |
| `/api/materials/export-import` | GET, POST | y |  | material, userOrganization | 303 | `src/pages/api/materials/export-import.ts` |
| `/api/mcp` | ? | y |  |  | 688 | `src/pages/api/mcp.ts` |
| `/api/mcp-agent` | POST |  |  |  | 226 | `src/pages/api/mcp-agent.ts` |
| `/api/mcp-protocol` | ? | y |  |  | 834 | `src/pages/api/mcp-protocol.ts` |
| `/api/mcp/config` | DELETE, GET, POST, PUT | y |  | mCPServerConfig | 430 | `src/pages/api/mcp/config.ts` |
| `/api/mcp/config/:id` | DELETE, GET, PUT | y |  | mCPServerConfig | 177 | `src/pages/api/mcp/config/[id].ts` |
| `/api/mcp/generate-assembly` | POST | y |  |  | 152 | `src/pages/api/mcp/generate-assembly.ts` |
| `/api/mcp/resource` | POST | y |  | mCPServerConfig | 405 | `src/pages/api/mcp/resource.ts` |
| `/api/mcp/server-info` | POST | y |  | mCPServerConfig | 259 | `src/pages/api/mcp/server-info.ts` |
| `/api/mcp/session` | DELETE, GET, POST | y |  |  | 158 | `src/pages/api/mcp/session.ts` |
| `/api/mcp/sessions` | GET | y |  |  | 62 | `src/pages/api/mcp/sessions.ts` |
| `/api/mcp/specialized-tools` | POST |  |  |  | 333 | `src/pages/api/mcp/specialized-tools.ts` |
| `/api/mcp/stdio-cleanup` | POST | y |  |  | 50 | `src/pages/api/mcp/stdio-cleanup.ts` |
| `/api/mcp/stdio-server-status` | GET, POST |  |  |  | 200 | `src/pages/api/mcp/stdio-server-status.ts` |
| `/api/mcp/tool` | POST | y |  | mCPServerConfig | 360 | `src/pages/api/mcp/tool.ts` |
| `/api/mcp/utilities` | POST | y |  |  | 235 | `src/pages/api/mcp/utilities.ts` |
| `/api/mcp/websearch` | POST |  |  |  | 93 | `src/pages/api/mcp/websearch.ts` |
| `/api/ml/evaluate` | POST |  |  |  | 152 | `src/pages/api/ml/evaluate.ts` |
| `/api/ml/feedback` | POST |  |  |  | 82 | `src/pages/api/ml/feedback.ts` |
| `/api/ml/train` | POST |  |  |  | 208 | `src/pages/api/ml/train.ts` |
| `/api/notifications` | GET | y |  | notification | 51 | `src/pages/api/notifications/index.ts` |
| `/api/notifications/:id` | DELETE, PUT | y |  | notification | 65 | `src/pages/api/notifications/[id].ts` |
| `/api/notifications/mark-all-read` | POST | y |  | notification | 36 | `src/pages/api/notifications/mark-all-read.ts` |
| `/api/og` | ? |  |  |  | 129 | `src/pages/api/og.tsx` |
| `/api/og-image/*slug` | ? |  |  |  | 152 | `src/pages/api/og-image/[...slug].tsx` |
| `/api/openai/completion` | POST |  |  |  | 72 | `src/pages/api/openai/completion.ts` |
| `/api/organizations` | GET, POST | y |  | organization, userOrganization | 80 | `src/pages/api/organizations/index.ts` |
| `/api/organizations/:id` | DELETE, GET, PUT | y |  | organization, userOrganization | 131 | `src/pages/api/organizations/[id].ts` |
| `/api/organizations/:id/conversations` | GET, POST | y |  | conversation, userOrganization | 267 | `src/pages/api/organizations/[id]/conversations.ts` |
| `/api/organizations/:id/invite` | POST | y |  | organization, organizationInvitation, user, userOrganization | 143 | `src/pages/api/organizations/[id]/invite.ts` |
| `/api/organizations/:id/members` | DELETE, GET, PUT | y |  | userOrganization | 208 | `src/pages/api/organizations/[id]/members.ts` |
| `/api/organizations/:id/projects` | GET, POST | y |  | project, user, userOrganization | 113 | `src/pages/api/organizations/[id]/projects.ts` |
| `/api/plugins` | GET |  |  |  | 40 | `src/pages/api/plugins/index.ts` |
| `/api/plugins/:id` | DELETE, GET |  |  |  | 63 | `src/pages/api/plugins/[id]/index.ts` |
| `/api/plugins/:id/config` | GET, POST, PUT |  |  |  | 55 | `src/pages/api/plugins/[id]/config.ts` |
| `/api/plugins/:id/disable` | POST |  |  |  | 30 | `src/pages/api/plugins/[id]/disable.ts` |
| `/api/plugins/:id/enable` | POST |  |  |  | 30 | `src/pages/api/plugins/[id]/enable.ts` |
| `/api/plugins/:id/update` | PATCH, PUT |  |  |  | 68 | `src/pages/api/plugins/[id]/update.ts` |
| `/api/plugins/bootstrap.js` | ? |  |  |  | 188 | `src/pages/api/plugins/bootstrap.js.ts` |
| `/api/plugins/install` | POST |  |  |  | 121 | `src/pages/api/plugins/install.ts` |
| `/api/plugins/registry` | GET |  |  |  | 72 | `src/pages/api/plugins/registry/index.ts` |
| `/api/plugins/registry/:id` | GET |  |  |  | 71 | `src/pages/api/plugins/registry/[id].ts` |
| `/api/plugins/registry/search` | GET |  |  |  | 89 | `src/pages/api/plugins/registry/search.ts` |
| `/api/plugins/serve` | GET |  |  |  | 179 | `src/pages/api/plugins/serve.ts` |
| `/api/production-costs/estimates` | GET, POST | y |  | productionCostEstimate, project, toolpath, userOrganization | 183 | `src/pages/api/production-costs/estimates/index.ts` |
| `/api/production-costs/estimates/:id` | DELETE, GET, PUT | y |  | productionCostEstimate, userOrganization | 149 | `src/pages/api/production-costs/estimates/[id].ts` |
| `/api/production-costs/estimates/calculate` | POST | y |  | costSettings, materialCost, toolWearCost, toolpath | 227 | `src/pages/api/production-costs/estimates/calculate.ts` |
| `/api/production-costs/material-costs` | GET, POST | y |  | material, materialCost, userOrganization | 148 | `src/pages/api/production-costs/material-costs/index.ts` |
| `/api/production-costs/material-costs/:id` | DELETE, GET, PUT | y |  | materialCost, userOrganization | 128 | `src/pages/api/production-costs/material-costs/[id].ts` |
| `/api/production-costs/operation-costs` | GET, POST | y |  | operationCost, userOrganization | 133 | `src/pages/api/production-costs/operation-costs/index.ts` |
| `/api/production-costs/operation-costs/:id` | DELETE, GET, PUT | y |  | operationCost, userOrganization | 153 | `src/pages/api/production-costs/operation-costs/[id].ts` |
| `/api/production-costs/tool-wear` | GET, POST | y |  | tool, toolWearCost, userOrganization | 139 | `src/pages/api/production-costs/tool-wear/index.ts` |
| `/api/production-costs/tool-wear/:id` | DELETE, GET, PUT | y |  | toolWearCost, userOrganization | 129 | `src/pages/api/production-costs/tool-wear/[id].ts` |
| `/api/projects` | GET, POST | y |  | project, userOrganization | 103 | `src/pages/api/projects/index.ts` |
| `/api/projects/:id` | DELETE, GET, PUT | y |  | project, userOrganization | 164 | `src/pages/api/projects/[id].ts` |
| `/api/projects/:id/components` | GET, POST | y |  | component, project, user | 111 | `src/pages/api/projects/[id]/components.ts` |
| `/api/projects/:id/drawings` | GET, POST | y |  | drawing, project | 84 | `src/pages/api/projects/[id]/drawings.ts` |
| `/api/projects/:id/toolpaths` | GET, POST | y |  | project, toolpath | 118 | `src/pages/api/projects/[id]/toolpaths.ts` |
| `/api/projects/tracked/:id` | DELETE, GET, PUT | y |  | project, userOrganization | 184 | `src/pages/api/projects/tracked/[id].ts` |
| `/api/push-subscription` | DELETE, POST | y |  | pushSubscription | 76 | `src/pages/api/push-subscription.ts` |
| `/api/route` | ? |  |  |  | 11 | `src/pages/api/route.ts` |
| `/api/subscription/info` | GET | y |  | subscription | 50 | `src/pages/api/subscription/info.ts` |
| `/api/subscriptions` | GET, POST | y |  | subscription, user | 346 | `src/pages/api/subscriptions/index.ts` |
| `/api/subscriptions/portal` | POST | y |  | subscription | 50 | `src/pages/api/subscriptions/portal.ts` |
| `/api/test-webauthn` | GET |  |  |  | 43 | `src/pages/api/test-webauthn.ts` |
| `/api/toolpaths` | GET, POST | y |  | project, toolpath | 131 | `src/pages/api/toolpaths/index.ts` |
| `/api/toolpaths/:id` | DELETE, GET, PUT | y |  | project, toolpath | 165 | `src/pages/api/toolpaths/[id].ts` |
| `/api/toolpaths/:id/comments` | GET, POST | y |  | toolpath, toolpathComment | 76 | `src/pages/api/toolpaths/[id]/comments/index.ts` |
| `/api/toolpaths/:id/comments/:commentId` | DELETE, PUT | y |  | toolpath, toolpathComment | 87 | `src/pages/api/toolpaths/[id]/comments/[commentId].ts` |
| `/api/toolpaths/:id/versions` | GET, POST | y |  | toolpath, toolpathVersion | 104 | `src/pages/api/toolpaths/[id]/versions/index.ts` |
| `/api/toolpaths/:id/versions/restore` | POST | y |  | toolpath, toolpathVersion | 95 | `src/pages/api/toolpaths/[id]/versions/restore.ts` |
| `/api/toolpaths/export-import` | GET, POST | y |  | project, toolpath | 346 | `src/pages/api/toolpaths/export-import.ts` |
| `/api/toolpaths/library` | GET | y |  |  | 77 | `src/pages/api/toolpaths/library.ts` |
| `/api/tools` | GET, POST | y |  | tool, userOrganization | 141 | `src/pages/api/tools/index.ts` |
| `/api/tools/:id` | DELETE, GET, PUT | y |  | tool, userOrganization | 147 | `src/pages/api/tools/[id].ts` |
| `/api/tools/:id/export-import` | GET, POST | y |  | tool, userOrganization | 388 | `src/pages/api/tools/[id]/export-import.ts` |
| `/api/tools/:id/storage` | DELETE, GET, POST | y |  | tool | 136 | `src/pages/api/tools/[id]/storage.ts` |
| `/api/tools/export-import` | GET, POST | y |  | tool, userOrganization | 389 | `src/pages/api/tools/export-import.ts` |
| `/api/upload` | POST | y |  | conversationParticipant, fileUpload, userOrganization | 147 | `src/pages/api/upload.ts` |
| `/api/user/:id` | GET | y |  | user | 62 | `src/pages/api/user/[id].ts` |
| `/api/user/api-keys` | DELETE, GET, POST | y |  | apiKey | 98 | `src/pages/api/user/api-keys.ts` |
| `/api/user/components` | GET | y |  | component | 38 | `src/pages/api/user/components.ts` |
| `/api/user/delete-account` | DELETE | y |  | aIAnalysisLog, account, activityLog, apiKey, authenticator, componentComment, componentVersion, conversationParticipant, costSettings, libraryItem, machineConfig, material, materialCost, message, notification, operationCost, productionCostEstimate, project, pushSubscription, session, subscription, tool, toolWearCost, toolpath, toolpathComment, toolpathVersion, user, userOrganization | 228 | `src/pages/api/user/delete-account.ts` |
| `/api/user/organizations` | GET | y |  | userOrganization | 53 | `src/pages/api/user/organizations.ts` |
| `/api/user/password` | PUT | y |  | account, user | 97 | `src/pages/api/user/password.ts` |
| `/api/user/profile` | GET, PUT | y |  | user | 218 | `src/pages/api/user/profile.ts` |
| `/api/user/projects` | GET | y |  | project | 32 | `src/pages/api/user/projects.ts` |
| `/api/user/stats` | GET | y |  | component, drawing, libraryItem, project, toolpath, user | 85 | `src/pages/api/user/stats.ts` |
| `/api/user/tokens` | GET, POST | y |  | apiToken | 102 | `src/pages/api/user/tokens.ts` |
| `/api/user/toolpaths` | GET | y |  | toolpath | 37 | `src/pages/api/user/toolpaths.ts` |
| `/api/user/verify-change` | GET | y |  | token, user | 79 | `src/pages/api/user/verify-change.ts` |
| `/api/waitlist` | POST |  |  |  | 69 | `src/pages/api/waitlist.ts` |
| `/api/webhooks/stripe` | POST |  |  | subscription | 614 | `src/pages/api/webhooks/stripe.ts` |
| `/api/websocket` | GET, POST |  |  |  | 107 | `src/pages/api/websocket.ts` |
