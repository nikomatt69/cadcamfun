export type JsonValue = null | boolean | number | string | Array<JsonValue> | { [key: string]: JsonValue }

export type Unauthorized = { readonly _tag: "Unauthorized"; readonly message: string }
export const isUnauthorized = (value: unknown): value is Unauthorized =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "Unauthorized"

export type AuthInternal = { readonly _tag: "AuthInternal"; readonly error: string; readonly details: string }
export const isAuthInternal = (value: unknown): value is AuthInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AuthInternal"

export type AuthBadRequest = { readonly _tag: "AuthBadRequest"; readonly error: string; readonly details: string }
export const isAuthBadRequest = (value: unknown): value is AuthBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AuthBadRequest"

export type AuthNotFound = { readonly _tag: "AuthNotFound"; readonly error: string; readonly details: string }
export const isAuthNotFound = (value: unknown): value is AuthNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AuthNotFound"

export type AuthUnauthorized = { readonly _tag: "AuthUnauthorized"; readonly error: string; readonly details: string }
export const isAuthUnauthorized = (value: unknown): value is AuthUnauthorized =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AuthUnauthorized"

export type TestCreateBadRequest = { readonly _tag: "TestCreateBadRequest"; readonly error: string }
export const isTestCreateBadRequest = (value: unknown): value is TestCreateBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "TestCreateBadRequest"

export type TestCreateFailure = { readonly _tag: "TestCreateFailure"; readonly error: string; readonly message: string }
export const isTestCreateFailure = (value: unknown): value is TestCreateFailure =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "TestCreateFailure"

export type PasskeyNotImplemented = {
  readonly _tag: "PasskeyNotImplemented"
  readonly error: string
  readonly details: string
  readonly todoImplementation: {
    readonly webauthn: string
    readonly challengeGeneration: string
    readonly credentialStorage: string
    readonly userVerification: string
  }
}
export const isPasskeyNotImplemented = (value: unknown): value is PasskeyNotImplemented =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PasskeyNotImplemented"

export type WaitlistBadRequest = {
  readonly _tag: "WaitlistBadRequest"
  readonly success: false
  readonly message: string
}
export const isWaitlistBadRequest = (value: unknown): value is WaitlistBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "WaitlistBadRequest"

export type WaitlistConflict = { readonly _tag: "WaitlistConflict"; readonly success: false; readonly message: string }
export const isWaitlistConflict = (value: unknown): value is WaitlistConflict =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "WaitlistConflict"

export type WaitlistInternal = { readonly _tag: "WaitlistInternal"; readonly success: false; readonly message: string }
export const isWaitlistInternal = (value: unknown): value is WaitlistInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "WaitlistInternal"

export type KeyedInternal = { readonly _tag: "KeyedInternal"; readonly error: string }
export const isKeyedInternal = (value: unknown): value is KeyedInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "KeyedInternal"

export type AnalyticsFailure = { readonly _tag: "AnalyticsFailure"; readonly success: false; readonly message: string }
export const isAnalyticsFailure = (value: unknown): value is AnalyticsFailure =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AnalyticsFailure"

export type InternalError = { readonly _tag: "InternalError"; readonly message: string }
export const isInternalError = (value: unknown): value is InternalError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InternalError"

export type AnalyticsKeyedBadRequest = { readonly _tag: "AnalyticsKeyedBadRequest"; readonly error: string }
export const isAnalyticsKeyedBadRequest = (value: unknown): value is AnalyticsKeyedBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AnalyticsKeyedBadRequest"

export type AnalyticsKeyedForbidden = { readonly _tag: "AnalyticsKeyedForbidden"; readonly error: string }
export const isAnalyticsKeyedForbidden = (value: unknown): value is AnalyticsKeyedForbidden =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AnalyticsKeyedForbidden"

export type BadRequest = { readonly _tag: "BadRequest"; readonly message: string }
export const isBadRequest = (value: unknown): value is BadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "BadRequest"

export type NotFound = { readonly _tag: "NotFound"; readonly message: string }
export const isNotFound = (value: unknown): value is NotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "NotFound"

export type TokenBadRequest = { readonly _tag: "TokenBadRequest"; readonly error: string }
export const isTokenBadRequest = (value: unknown): value is TokenBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "TokenBadRequest"

export type AiBadRequest = { readonly _tag: "AiBadRequest"; readonly error: string }
export const isAiBadRequest = (value: unknown): value is AiBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AiBadRequest"

export type AiNotFound = { readonly _tag: "AiNotFound"; readonly error: string }
export const isAiNotFound = (value: unknown): value is AiNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AiNotFound"

export type AiFailure = { readonly _tag: "AiFailure"; readonly error: string }
export const isAiFailure = (value: unknown): value is AiFailure =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "AiFailure"

export type Conflict = { readonly _tag: "Conflict"; readonly message: string }
export const isConflict = (value: unknown): value is Conflict =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "Conflict"

export type GcodeActionError = {
  readonly _tag: "GcodeActionError"
  readonly success: false
  readonly error: string
  readonly action?: string | undefined
  readonly processedAt?: string | undefined
}
export const isGcodeActionError = (value: unknown): value is GcodeActionError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "GcodeActionError"

export type GcodeActionFailure = {
  readonly _tag: "GcodeActionFailure"
  readonly success: false
  readonly error: string
  readonly action: string
  readonly processedAt: string
}
export const isGcodeActionFailure = (value: unknown): value is GcodeActionFailure =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "GcodeActionFailure"

export type McpEnvBadRequest = { readonly _tag: "McpEnvBadRequest"; readonly success: false; readonly error: string }
export const isMcpEnvBadRequest = (value: unknown): value is McpEnvBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpEnvBadRequest"

export type McpEnvInternal = { readonly _tag: "McpEnvInternal"; readonly success: false; readonly error: string }
export const isMcpEnvInternal = (value: unknown): value is McpEnvInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpEnvInternal"

export type McpEnvNotFound = { readonly _tag: "McpEnvNotFound"; readonly success: false; readonly error: string }
export const isMcpEnvNotFound = (value: unknown): value is McpEnvNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpEnvNotFound"

export type McpEnvMethodNotAllowed = {
  readonly _tag: "McpEnvMethodNotAllowed"
  readonly success: false
  readonly error: string
}
export const isMcpEnvMethodNotAllowed = (value: unknown): value is McpEnvMethodNotAllowed =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpEnvMethodNotAllowed"

export type McpBadRequest = { readonly _tag: "McpBadRequest"; readonly error: string }
export const isMcpBadRequest = (value: unknown): value is McpBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpBadRequest"

export type McpNotFound = { readonly _tag: "McpNotFound"; readonly error: string }
export const isMcpNotFound = (value: unknown): value is McpNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpNotFound"

export type McpInternal = { readonly _tag: "McpInternal"; readonly error: string }
export const isMcpInternal = (value: unknown): value is McpInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpInternal"

export type McpMethodNotAllowed = { readonly _tag: "McpMethodNotAllowed"; readonly error: string }
export const isMcpMethodNotAllowed = (value: unknown): value is McpMethodNotAllowed =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "McpMethodNotAllowed"

export type BillingBadRequest = { readonly _tag: "BillingBadRequest"; readonly error: string }
export const isBillingBadRequest = (value: unknown): value is BillingBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "BillingBadRequest"

export type BillingForbidden = { readonly _tag: "BillingForbidden"; readonly error: string }
export const isBillingForbidden = (value: unknown): value is BillingForbidden =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "BillingForbidden"

export type BillingNotFound = { readonly _tag: "BillingNotFound"; readonly error: string }
export const isBillingNotFound = (value: unknown): value is BillingNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "BillingNotFound"

export type BillingFailure = { readonly _tag: "BillingFailure"; readonly error: string }
export const isBillingFailure = (value: unknown): value is BillingFailure =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "BillingFailure"

export type CronUnauthorized = { readonly _tag: "CronUnauthorized"; readonly error: string }
export const isCronUnauthorized = (value: unknown): value is CronUnauthorized =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "CronUnauthorized"

export type CronFailure = {
  readonly _tag: "CronFailure"
  readonly success: false
  readonly error: string
  readonly timestamp: string
}
export const isCronFailure = (value: unknown): value is CronFailure =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "CronFailure"

export type StripeUnhealthy = {
  readonly _tag: "StripeUnhealthy"
  readonly status: "unhealthy"
  readonly message: string
  readonly timestamp: string
  readonly service: "stripe"
}
export const isStripeUnhealthy = (value: unknown): value is StripeUnhealthy =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "StripeUnhealthy"

export type NotifyBadRequest = { readonly _tag: "NotifyBadRequest"; readonly success: false; readonly error: string }
export const isNotifyBadRequest = (value: unknown): value is NotifyBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "NotifyBadRequest"

export type NotifyInternal = { readonly _tag: "NotifyInternal"; readonly success: false; readonly error: string }
export const isNotifyInternal = (value: unknown): value is NotifyInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "NotifyInternal"

export type DesktopBadRequest = { readonly _tag: "DesktopBadRequest"; readonly success: false; readonly error: string }
export const isDesktopBadRequest = (value: unknown): value is DesktopBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "DesktopBadRequest"

export type DesktopUnauthorized = {
  readonly _tag: "DesktopUnauthorized"
  readonly success: false
  readonly error: string
}
export const isDesktopUnauthorized = (value: unknown): value is DesktopUnauthorized =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "DesktopUnauthorized"

export type DesktopInternal = { readonly _tag: "DesktopInternal"; readonly success: false; readonly error: string }
export const isDesktopInternal = (value: unknown): value is DesktopInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "DesktopInternal"

export type DesktopConflict = { readonly _tag: "DesktopConflict"; readonly success: false; readonly error: string }
export const isDesktopConflict = (value: unknown): value is DesktopConflict =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "DesktopConflict"

export type DesktopNotFound = { readonly _tag: "DesktopNotFound"; readonly success: false; readonly error: string }
export const isDesktopNotFound = (value: unknown): value is DesktopNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "DesktopNotFound"

export type Forbidden = { readonly _tag: "Forbidden"; readonly message: string }
export const isForbidden = (value: unknown): value is Forbidden =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "Forbidden"

export type PluginBadRequest = {
  readonly _tag: "PluginBadRequest"
  readonly error: string
  readonly details?: ReadonlyArray<string> | undefined
}
export const isPluginBadRequest = (value: unknown): value is PluginBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PluginBadRequest"

export type PluginNotFound = { readonly _tag: "PluginNotFound"; readonly error: string }
export const isPluginNotFound = (value: unknown): value is PluginNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PluginNotFound"

export type EnvBadRequest = {
  readonly _tag: "EnvBadRequest"
  readonly success: false
  readonly message: string
  readonly errors: unknown | null
}
export const isEnvBadRequest = (value: unknown): value is EnvBadRequest =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "EnvBadRequest"

export type EnvForbidden = {
  readonly _tag: "EnvForbidden"
  readonly success: false
  readonly message: string
  readonly errors: unknown | null
}
export const isEnvForbidden = (value: unknown): value is EnvForbidden =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "EnvForbidden"

export type EnvNotFound = {
  readonly _tag: "EnvNotFound"
  readonly success: false
  readonly message: string
  readonly errors: unknown | null
}
export const isEnvNotFound = (value: unknown): value is EnvNotFound =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "EnvNotFound"

export type EnvMethodNotAllowed = {
  readonly _tag: "EnvMethodNotAllowed"
  readonly success: false
  readonly message: string
  readonly errors: unknown | null
}
export const isEnvMethodNotAllowed = (value: unknown): value is EnvMethodNotAllowed =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "EnvMethodNotAllowed"

export type EnvInternal = {
  readonly _tag: "EnvInternal"
  readonly success: false
  readonly message: string
  readonly errors: unknown | null
}
export const isEnvInternal = (value: unknown): value is EnvInternal =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "EnvInternal"

export type AuthIdentityPollPayload = { readonly id: string }

export type AuthIdentityCancelPayload = { readonly id: string }

export type AuthForgotPasswordPayload = {
  readonly email?: string | undefined
  readonly callbackURL?: string | undefined
}

export type AuthResetPasswordPayload = {
  readonly token?: string | undefined
  readonly newPassword?: string | undefined
  readonly confirmPassword?: string | undefined
}

export type AuthSendMagicLinkPayload = {
  readonly email?: string | undefined
  readonly callbackURL?: string | undefined
}

export type AuthSendVerificationEmailPayload = {
  readonly email?: string | undefined
  readonly callbackURL?: string | undefined
}

export type AuthVerifyEmailPayload = { readonly token?: string | undefined }

export type AuthSigninDirectPayload = { readonly email?: string | undefined; readonly password?: string | undefined }

export type AuthSignupPayload = {
  readonly email?: string | undefined
  readonly password?: string | undefined
  readonly confirmPassword?: string | undefined
  readonly name?: string | undefined
}

export type AuthTestDirectCreatePayload = {
  readonly email?: string | undefined
  readonly password?: string | undefined
  readonly name?: string | undefined
}

export type AuthVerifyMagicLinkPayload = { readonly token?: string | undefined }

export type WaitlistJoinPayload = { readonly email: string }

export type AnalyticsLogViewPayload = { readonly path?: string | undefined; readonly query?: unknown | undefined }

export type AnalyticsTrackPayload = {
  readonly itemId?: string | undefined
  readonly itemType?: string | undefined
  readonly action?: string | undefined
  readonly details?: unknown | undefined
}

export type UserCreateApiKeyPayload = { readonly name?: unknown | undefined }

export type UserPasswordPayload = {
  readonly currentPassword?: string | undefined
  readonly newPassword?: string | undefined
}

export type UserCreateTokenPayload = {
  readonly name?: string | undefined
  readonly permissions?: unknown | undefined
  readonly expiresIn?: number | undefined
}

export type UserUpdateGitProfilePayload = { readonly name: string; readonly email: string }

export type AiInvokeActionPayload = {
  readonly projectId: string
  readonly drawingId?: string | undefined
  readonly tool: string
  readonly input: { readonly [x: string]: any }
}

export type AiIssueBridgeTokenPayload = {
  readonly name?: string | undefined
  readonly projectId: string
  readonly mode: "read" | "write"
  readonly days?: number | undefined
}

export type AiSessionControlPayload = {
  readonly sessionId: string
  readonly projectId?: string | undefined
  readonly action:
    | "status"
    | "compact"
    | "cancel_task"
    | "answer_question"
    | "reject_question"
    | "reply_permission"
    | "consolidate_memory"
    | "context"
  readonly taskId?: string | undefined
  readonly requestId?: string | undefined
  readonly answers?: ReadonlyArray<ReadonlyArray<string>> | undefined
  readonly decision?: "once" | "always" | "reject" | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiSessionStatePayload = { readonly sessionId: string; readonly projectId?: string | undefined }

export type AiRemoveSessionPayload = { readonly sessionId: string; readonly projectId?: string | undefined }

export type AiSaveMcpServerPayload = {
  readonly projectId: string
  readonly name: string
  readonly config:
    | {
        readonly type: "local"
        readonly command: ReadonlyArray<string>
        readonly environment?: { readonly [x: string]: string } | undefined
        readonly enabled: boolean
        readonly timeout?: number | undefined
      }
    | {
        readonly type: "remote"
        readonly url: string
        readonly headers?: { readonly [x: string]: string } | undefined
        readonly oauth?: false | undefined
        readonly enabled: boolean
        readonly timeout?: number | undefined
      }
}

export type AiInstallExtensionPluginPayload = {
  readonly manifest: string
  readonly source: string
  readonly files?: { readonly [x: string]: string } | undefined
}

export type AiToggleExtensionPluginPayload = { readonly enabled: boolean }

export type AiToggleExtensionModPayload = { readonly enabled: boolean }

export type AiSaveSkillPayload = {
  readonly markdown?: string | undefined
  readonly name?: string | undefined
  readonly description?: string | undefined
  readonly body?: string | undefined
}

export type AiSetCredentialsPayload = {
  readonly provider?: string | undefined
  readonly key?: string | undefined
  readonly baseUrl?: string | undefined
}

export type AiTitlePayload = {
  readonly excerpt?: string | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiDesignAnalysisPayload = {
  readonly description?: string | undefined
  readonly layer?: string | undefined
  readonly machine?: string | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiMachiningParametersPayload = {
  readonly material?: string | undefined
  readonly tool?: string | undefined
  readonly operation?: string | undefined
  readonly machine?: string | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiGcodeOptimizationPayload = {
  readonly gcode?: string | undefined
  readonly material?: string | undefined
  readonly machineType?: string | undefined
  readonly constraints?: string | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiDesignSuggestionsPayload = {
  readonly elements?: string | undefined
  readonly currentOperation?: string | undefined
  readonly currentTool?: string | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiChatPayload = {
  readonly messages?: unknown | undefined
  readonly mcpServerId?: string | undefined
  readonly mcpReference?: string | undefined
}

export type AiChatStreamPayload = {
  readonly permissionMode?: "auto" | "ask" | "approve" | undefined
  readonly agent?: string | undefined
  readonly mode?: string | undefined
  readonly attachments?:
    | ReadonlyArray<{
        readonly name: string
        readonly mime?: string | undefined
        readonly data: string
        readonly encoding?: "base64" | "text" | undefined
      }>
    | undefined
  readonly message?: string | undefined
  readonly sessionId?: string | undefined
  readonly projectId?: string | undefined
  readonly drawingId?: string | undefined
  readonly context?: string | undefined
  readonly includeContext?: boolean | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiSessionPromptPayload = {
  readonly permissionMode?: "auto" | "ask" | "approve" | undefined
  readonly agent?: string | undefined
  readonly mode?: string | undefined
  readonly attachments?:
    | ReadonlyArray<{
        readonly name: string
        readonly mime?: string | undefined
        readonly data: string
        readonly encoding?: "base64" | "text" | undefined
      }>
    | undefined
  readonly message?: string | undefined
  readonly sessionId?: string | undefined
  readonly projectId?: string | undefined
  readonly drawingId?: string | undefined
  readonly context?: string | undefined
  readonly includeContext?: boolean | undefined
  readonly model?:
    | {
        readonly provider?: string | undefined
        readonly model?: string | undefined
        readonly tier?: "fast" | "balanced" | "best" | undefined
        readonly variant?: string | undefined
      }
    | undefined
}

export type AiChatQueuePayload = {
  readonly sessionId: string
  readonly message: string
  readonly projectId?: string | undefined
  readonly delivery?: "queue" | "steer" | undefined
}

export type AiChatAbortPayload = { readonly sessionId?: string | undefined; readonly projectId?: string | undefined }

export type AiPermissionReplyPayload = {
  readonly sessionId: string
  readonly projectId?: string | undefined
  readonly requestId: string
  readonly decision: "once" | "always" | "reject"
}

export type AiCompletionPayload = {
  readonly prompt?: string | undefined
  readonly systemPrompt?: string | undefined
  readonly model?: string | undefined
  readonly temperature?: number | undefined
}

export type AiAnalyzeGcodePayload = { readonly gcode?: string | undefined; readonly model?: string | undefined }

export type AiGcodePayload = {
  readonly action?: string | undefined
  readonly gcode?: string | undefined
  readonly partialCode?: string | undefined
  readonly machineType?: string | undefined
  readonly material?: string | undefined
  readonly model?: string | undefined
  readonly options?: unknown | undefined
  readonly description?: string | undefined
  readonly toolpathType?: string | undefined
}

export type AiToolpathAnalysisPayload = {
  readonly gcode?: string | undefined
  readonly model?: string | undefined
  readonly max_tokens?: number | undefined
}

export type AiFeedbackPayload = {
  readonly messageId?: string | undefined
  readonly rating?: string | undefined
  readonly comment?: string | undefined
}

export type AiProxyPayload = {
  readonly model?: string | undefined
  readonly messages?: unknown | undefined
  readonly max_tokens?: number | undefined
  readonly temperature?: number | undefined
  readonly system?: unknown | undefined
  readonly reasoning?: unknown | undefined
}

export type AiOauthAuthorizePayload = { readonly provider: "openai" | "xai" }

export type AiOauthCompletePayload = {
  readonly provider: "openai" | "xai"
  readonly attemptId: string
  readonly code?: string | undefined
}

export type McpUpdateConfigPayload = {
  readonly id?: string | undefined
  readonly name?: string | undefined
  readonly type?: string | undefined
  readonly url?: string | undefined
  readonly command?: string | undefined
  readonly args?: unknown | undefined
  readonly workingDirectory?: string | undefined
  readonly defaultWorkingDirectory?: string | undefined
  readonly enabled?: boolean | undefined
  readonly serverName?: string | undefined
  readonly testConnection?: boolean | undefined
  readonly mcpServers?: unknown | undefined
  readonly tool_configuration?: unknown | undefined
  readonly authorization_token?: string | undefined
}

export type McpServerInfoPayload = { readonly serverId?: string | undefined }

export type BillingSubscribePayload = {
  readonly priceId?: string | undefined
  readonly startTrial?: boolean | undefined
}

export type BillingPortalPayload = { readonly returnUrl?: string | undefined }

export type BillingBaCheckoutPayload = {
  readonly plan?: string | undefined
  readonly successUrl?: string | undefined
  readonly cancelUrl?: string | undefined
  readonly trialDays?: number | undefined
}

export type BillingBaUpdatePayload = { readonly newPlan?: string | undefined }

export type BillingBaPortalPayload = { readonly returnUrl?: string | undefined }

export type BillingBaFeaturePayload = { readonly feature?: string | undefined; readonly features?: unknown | undefined }

export type MiscPushSubscribePayload = {
  readonly endpoint?: string | undefined
  readonly keys?: { readonly p256dh?: string | undefined; readonly auth?: string | undefined } | undefined
}

export type MiscPushUnsubscribePayload = { readonly endpoint?: string | undefined }

export type MiscNotifyPayload = { readonly userId?: string | undefined; readonly message?: unknown | undefined }

export type MiscDesktopSigninPayload = {
  readonly email?: string | undefined
  readonly password?: string | undefined
  readonly deviceId?: string | undefined
  readonly platform?: string | undefined
}

export type MiscDesktopCreateProjectPayload = {
  readonly name?: unknown | undefined
  readonly description?: string | undefined
  readonly organization_id?: string | undefined
  readonly is_public?: boolean | undefined
}

export type MiscTrackedUpdatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly organizationId?: string | null | undefined
}

export type KvSetPayload = { readonly value: unknown }

export type ProductionCostsCreateEstimatePayload = {
  readonly toolpathId: string
  readonly totalCost: number
  readonly materialCost?: number | undefined
  readonly toolWearCost?: number | undefined
  readonly machineTime?: number | undefined
  readonly machineTimeCost?: number | undefined
  readonly operatorTime?: number | undefined
  readonly operatorTimeCost?: number | undefined
  readonly setupCost?: number | undefined
  readonly currencyCode?: string | undefined
  readonly details?: unknown | undefined
  readonly operationCostId?: string | null | undefined
  readonly costSettingsId?: string | null | undefined
  readonly organizationId?: string | null | undefined
}

export type ProductionCostsUpdateEstimatePayload = {
  readonly currencyCode?: string | undefined
  readonly details?: unknown | undefined
  readonly notes?: string | undefined
}

export type ProductionCostsCalculateEstimatePayload = {
  readonly toolpathId: string
  readonly costSettingsId?: string | null | undefined
  readonly organizationId?: string | null | undefined
}

export type ProductionCostsCreateMaterialCostPayload = {
  readonly costPerUnit: number
  readonly wasteFactor?: number | undefined
  readonly minimumCharge?: number | undefined
  readonly currencyCode?: string | undefined
  readonly materialId: string
  readonly organizationId?: string | null | undefined
}

export type ProductionCostsUpdateMaterialCostPayload = {
  readonly costPerUnit?: number | undefined
  readonly wasteFactor?: number | undefined
  readonly minimumCharge?: number | undefined
  readonly currencyCode?: string | undefined
}

export type ProductionCostsCreateOperationCostPayload = {
  readonly name: string
  readonly machineHourlyRate: number
  readonly operatorHourlyRate: number
  readonly setupTime?: number | undefined
  readonly currencyCode?: string | undefined
  readonly organizationId?: string | null | undefined
}

export type ProductionCostsUpdateOperationCostPayload = {
  readonly name?: string | undefined
  readonly machineHourlyRate?: number | undefined
  readonly operatorHourlyRate?: number | undefined
  readonly setupTime?: number | undefined
  readonly currencyCode?: string | undefined
}

export type ProductionCostsCreateToolWearPayload = {
  readonly wearRatePerMeter: number
  readonly replacementCost: number
  readonly replacementThreshold?: number | undefined
  readonly currencyCode?: string | undefined
  readonly toolId: string
  readonly organizationId?: string | null | undefined
}

export type ProductionCostsUpdateToolWearPayload = {
  readonly wearRatePerMeter?: number | undefined
  readonly replacementCost?: number | undefined
  readonly replacementThreshold?: number | undefined
  readonly currencyCode?: string | undefined
}

export type PluginsUpdatePayload = {
  readonly manifest?:
    | {
        readonly id: string
        readonly name: string
        readonly version: string
        readonly description: string
        readonly author: string
        readonly repository?: string | undefined
        readonly license?: string | undefined
        readonly icon?: string | undefined
        readonly main: string
        readonly engines: { readonly cadcam: string }
        readonly permissions: ReadonlyArray<
          | "model:read"
          | "model:write"
          | "model:selection"
          | "ui:sidebar"
          | "ui:toolbar"
          | "ui:contextMenu"
          | "ui:propertyPanel"
          | "ui:modal"
          | "ui:overlay"
          | "storage:local"
          | "storage:sync"
          | "file:read"
          | "file:write"
          | "file:downloads"
          | "network:origin"
          | "network:external"
          | "system:clipboard"
          | "system:notifications"
          | "ui:fullscreen"
          | "device:camera"
          | "device:microphone"
        >
        readonly dependencies?: { readonly [x: string]: string } | undefined
        readonly contributes?:
          | {
              readonly sidebar?: { readonly title: string; readonly icon: string; readonly entry: string } | undefined
              readonly commands?:
                | ReadonlyArray<{
                    readonly id: string
                    readonly title: string
                    readonly icon?: string | undefined
                    readonly keybinding?: string | undefined
                  }>
                | undefined
              readonly menus?:
                | {
                    readonly toolbar?:
                      | ReadonlyArray<{
                          readonly command: string
                          readonly group?: string | undefined
                          readonly when?: string | undefined
                          readonly priority?: number | undefined
                        }>
                      | undefined
                    readonly contextMenu?:
                      | ReadonlyArray<{
                          readonly command: string
                          readonly group?: string | undefined
                          readonly when?: string | undefined
                          readonly priority?: number | undefined
                        }>
                      | undefined
                  }
                | undefined
              readonly propertyPanel?:
                | ReadonlyArray<{
                    readonly id: string
                    readonly title: string
                    readonly entry: string
                    readonly appliesTo?: string | undefined
                  }>
                | undefined
              readonly themes?:
                | ReadonlyArray<{ readonly id: string; readonly label: string; readonly path: string }>
                | undefined
            }
          | undefined
        readonly configuration?:
          | {
              readonly properties: {
                readonly [x: string]: {
                  readonly type: string
                  readonly default?: unknown | undefined
                  readonly description?: string | undefined
                  readonly enum?: ReadonlyArray<unknown> | undefined
                  readonly minimum?: number | undefined
                  readonly maximum?: number | undefined
                  readonly pattern?: string | undefined
                }
              }
            }
          | undefined
      }
    | undefined
  readonly config?: { readonly [x: string]: any } | undefined
}

export type PluginsPatchPayload = {
  readonly manifest?:
    | {
        readonly id: string
        readonly name: string
        readonly version: string
        readonly description: string
        readonly author: string
        readonly repository?: string | undefined
        readonly license?: string | undefined
        readonly icon?: string | undefined
        readonly main: string
        readonly engines: { readonly cadcam: string }
        readonly permissions: ReadonlyArray<
          | "model:read"
          | "model:write"
          | "model:selection"
          | "ui:sidebar"
          | "ui:toolbar"
          | "ui:contextMenu"
          | "ui:propertyPanel"
          | "ui:modal"
          | "ui:overlay"
          | "storage:local"
          | "storage:sync"
          | "file:read"
          | "file:write"
          | "file:downloads"
          | "network:origin"
          | "network:external"
          | "system:clipboard"
          | "system:notifications"
          | "ui:fullscreen"
          | "device:camera"
          | "device:microphone"
        >
        readonly dependencies?: { readonly [x: string]: string } | undefined
        readonly contributes?:
          | {
              readonly sidebar?: { readonly title: string; readonly icon: string; readonly entry: string } | undefined
              readonly commands?:
                | ReadonlyArray<{
                    readonly id: string
                    readonly title: string
                    readonly icon?: string | undefined
                    readonly keybinding?: string | undefined
                  }>
                | undefined
              readonly menus?:
                | {
                    readonly toolbar?:
                      | ReadonlyArray<{
                          readonly command: string
                          readonly group?: string | undefined
                          readonly when?: string | undefined
                          readonly priority?: number | undefined
                        }>
                      | undefined
                    readonly contextMenu?:
                      | ReadonlyArray<{
                          readonly command: string
                          readonly group?: string | undefined
                          readonly when?: string | undefined
                          readonly priority?: number | undefined
                        }>
                      | undefined
                  }
                | undefined
              readonly propertyPanel?:
                | ReadonlyArray<{
                    readonly id: string
                    readonly title: string
                    readonly entry: string
                    readonly appliesTo?: string | undefined
                  }>
                | undefined
              readonly themes?:
                | ReadonlyArray<{ readonly id: string; readonly label: string; readonly path: string }>
                | undefined
            }
          | undefined
        readonly configuration?:
          | {
              readonly properties: {
                readonly [x: string]: {
                  readonly type: string
                  readonly default?: unknown | undefined
                  readonly description?: string | undefined
                  readonly enum?: ReadonlyArray<unknown> | undefined
                  readonly minimum?: number | undefined
                  readonly maximum?: number | undefined
                  readonly pattern?: string | undefined
                }
              }
            }
          | undefined
      }
    | undefined
  readonly config?: { readonly [x: string]: any } | undefined
}

export type FilesUploadPayload = {
  readonly fileName?: string | undefined
  readonly fileType?: string | undefined
  readonly organizationId?: string | undefined
  readonly conversationId?: string | undefined
  readonly fileSize?: number | undefined
}

export type OrganizationsCreatePayload = { readonly name: string; readonly description?: string | null | undefined }

export type OrganizationsUpdatePayload = { readonly name: string; readonly description?: string | null | undefined }

export type NotificationsUpdatePayload = { readonly isRead: boolean }

export type ProjectsCreatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type ProjectsUpdatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type MaterialsCreatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly properties?: unknown | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type MaterialsUpdatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly properties?: unknown | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type ToolsCreatePayload = {
  readonly name?: string | undefined
  readonly type?: string | undefined
  readonly diameter?: number | undefined
  readonly material?: string | undefined
  readonly numberOfFlutes?: number | null | undefined
  readonly maxRPM?: number | null | undefined
  readonly coolantType?: string | null | undefined
  readonly cuttingLength?: number | null | undefined
  readonly totalLength?: number | null | undefined
  readonly shankDiameter?: number | null | undefined
  readonly cornerRadius?: number | null | undefined
  readonly tipAngle?: number | null | undefined
  readonly threadPitch?: number | null | undefined
  readonly holderDiameter?: number | null | undefined
  readonly holderLength?: number | null | undefined
  readonly stickout?: number | null | undefined
  readonly notes?: string | null | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type ToolsUpdatePayload = {
  readonly name?: string | undefined
  readonly type?: string | undefined
  readonly diameter?: number | undefined
  readonly material?: string | undefined
  readonly numberOfFlutes?: number | null | undefined
  readonly maxRPM?: number | null | undefined
  readonly coolantType?: string | null | undefined
  readonly cuttingLength?: number | null | undefined
  readonly totalLength?: number | null | undefined
  readonly shankDiameter?: number | null | undefined
  readonly cornerRadius?: number | null | undefined
  readonly tipAngle?: number | null | undefined
  readonly threadPitch?: number | null | undefined
  readonly holderDiameter?: number | null | undefined
  readonly holderLength?: number | null | undefined
  readonly stickout?: number | null | undefined
  readonly notes?: string | null | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type DrawingsUpdatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly data?: unknown | undefined
  readonly thumbnail?: string | null | undefined
  readonly baseUpdatedAt?: string | undefined
  readonly mergeData?: boolean | undefined
}

export type DrawingsCreateForProjectPayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly data?: unknown | undefined
  readonly thumbnail?: string | null | undefined
  readonly baseUpdatedAt?: string | undefined
  readonly mergeData?: boolean | undefined
}

export type ComponentsUpdatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly data?: unknown | undefined
  readonly type?: string | null | undefined
  readonly isPublic?: boolean | undefined
  readonly thumbnail?: string | null | undefined
}

export type ComponentsCreateForProjectPayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly data?: unknown | undefined
  readonly type?: string | null | undefined
  readonly isPublic?: boolean | undefined
  readonly thumbnail?: string | null | undefined
}

export type ToolpathsCreatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly data?: unknown | undefined
  readonly gcode?: string | null | undefined
  readonly projectId?: string | undefined
  readonly type?: string | null | undefined
  readonly operationType?: string | null | undefined
  readonly isPublic?: boolean | undefined
  readonly thumbnail?: string | null | undefined
  readonly materialId?: string | null | undefined
  readonly machineConfigId?: string | null | undefined
  readonly toolId?: string | null | undefined
  readonly simulation?: unknown | undefined
  readonly baseUpdatedAt?: string | undefined
}

export type ToolpathsUpdatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly data?: unknown | undefined
  readonly gcode?: string | null | undefined
  readonly projectId?: string | undefined
  readonly type?: string | null | undefined
  readonly operationType?: string | null | undefined
  readonly isPublic?: boolean | undefined
  readonly thumbnail?: string | null | undefined
  readonly materialId?: string | null | undefined
  readonly machineConfigId?: string | null | undefined
  readonly toolId?: string | null | undefined
  readonly simulation?: unknown | undefined
  readonly baseUpdatedAt?: string | undefined
}

export type ToolpathsCreateForDrawingPayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly data?: unknown | undefined
  readonly gcode?: string | null | undefined
  readonly projectId?: string | undefined
  readonly type?: string | null | undefined
  readonly operationType?: string | null | undefined
  readonly isPublic?: boolean | undefined
  readonly thumbnail?: string | null | undefined
  readonly materialId?: string | null | undefined
  readonly machineConfigId?: string | null | undefined
  readonly toolId?: string | null | undefined
  readonly simulation?: unknown | undefined
  readonly baseUpdatedAt?: string | undefined
}

export type ToolpathExtrasCreateVersionPayload = {
  readonly data?: unknown | undefined
  readonly gcode?: string | undefined
  readonly changeMessage?: string | undefined
}

export type ToolpathExtrasRestoreVersionPayload = { readonly versionId: string }

export type ToolpathExtrasCreateCommentPayload = { readonly content: string }

export type ToolpathExtrasUpdateCommentPayload = { readonly content: string }

export type ToolpathGeneratorManufacturePayload = {
  readonly setupOrientation?: "+Z" | "-Z" | "+X" | "-X" | "+Y" | "-Y"
  readonly material: string
  readonly machine?: string
  readonly machineConfig?: {
    readonly id: string
    readonly name: string
    readonly type: string
    readonly description?: string | null
    readonly config: { readonly [x: string]: JsonValue }
  }
  readonly origin?: "stock-center" | "stock-corner"
  readonly finishAllowance?: number
  readonly scallop?: number
  readonly schemaVersion: 1
  readonly id: string
  readonly name: string
  readonly elements: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly stock?: {
    readonly width: number
    readonly height: number
    readonly depth: number
    readonly radius?: number
    readonly x?: number
    readonly y?: number
    readonly topZ?: number
    readonly allowance?: number
    readonly material?: string
    readonly elementId?: string
  }
  readonly tolerance?: number
  readonly resolution?: number
  readonly workOffset?: "G54" | "G55" | "G56" | "G57" | "G58" | "G59"
  readonly operations?: ReadonlyArray<
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "face"
        readonly bottom: number
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "adaptive"
        readonly region: {
          readonly boundary: ReadonlyArray<{ readonly x: number; readonly y: number }>
          readonly islands?: ReadonlyArray<ReadonlyArray<{ readonly x: number; readonly y: number }>>
        }
        readonly top: number
        readonly bottom: number
        readonly allowance?: number
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "pocket"
        readonly region: {
          readonly boundary: ReadonlyArray<{ readonly x: number; readonly y: number }>
          readonly islands?: ReadonlyArray<ReadonlyArray<{ readonly x: number; readonly y: number }>>
        }
        readonly top: number
        readonly bottom: number
        readonly allowance?: number
        readonly finish?: boolean
        readonly within?: {
          readonly boundary: ReadonlyArray<{ readonly x: number; readonly y: number }>
          readonly islands?: ReadonlyArray<ReadonlyArray<{ readonly x: number; readonly y: number }>>
        }
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "profile"
        readonly loop: ReadonlyArray<{ readonly x: number; readonly y: number }>
        readonly side: "outside" | "inside"
        readonly top: number
        readonly bottom: number
        readonly allowance?: number
        readonly finish?: boolean
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "bore"
        readonly center: { readonly x: number; readonly y: number }
        readonly diameter: number
        readonly top: number
        readonly bottom: number
        readonly allowance?: number
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "drill"
        readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>
        readonly top: number
        readonly bottom: number
        readonly cut?: "drill" | "spot" | "tap" | "ream"
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "thread"
        readonly center: { readonly x: number; readonly y: number }
        readonly diameter: number
        readonly pitch: number
        readonly internal: boolean
        readonly top: number
        readonly length: number
        readonly rightHand?: boolean
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "engrave"
        readonly paths: ReadonlyArray<{
          readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>
          readonly closed: boolean
        }>
        readonly top: number
        readonly depth: number
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "chamfer"
        readonly loops: ReadonlyArray<{
          readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>
          readonly side: "outside" | "inside"
        }>
        readonly top: number
        readonly width: number
        readonly tipOffset?: number
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover?: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "surface"
        readonly mode:
          | "roughing"
          | "rest"
          | "parallel"
          | "waterline"
          | "steep-shallow"
          | "scallop"
          | "spiral"
          | "radial"
          | "flat"
        readonly slopeAngle?: number
        readonly allowance?: number
        readonly scallop?: number
        readonly clearing?: "contour" | "adaptive"
        readonly angle?: number
        readonly restFrom?: string
        readonly center?: { readonly x: number; readonly y: number }
      }
    | {
        readonly id: string
        readonly name?: string
        readonly tool: string
        readonly rpm?: number
        readonly feed?: number
        readonly plungeFeed?: number
        readonly stepdown?: number
        readonly stepover: number
        readonly coolant?: "off" | "flood" | "mist"
        readonly radialEngagement?: number
        readonly strategy: "multiaxis"
        readonly mode?: "parallel" | "contour"
        readonly top: number
        readonly angle?: number
        readonly toolAxis?: "normal" | "lead"
        readonly lead?: number
        readonly tilt?: number
      }
  >
  readonly tools?: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly kind:
      | "flat"
      | "ball"
      | "bull"
      | "chamfer"
      | "spot"
      | "drill"
      | "facemill"
      | "threadmill"
      | "engraver"
      | "tap"
      | "reamer"
    readonly diameter: number
    readonly flutes: number
    readonly material: "hss" | "hss-co" | "carbide" | "pcd"
    readonly coating: "none" | "tin" | "ticn" | "altin" | "alcrn" | "zrn" | "dlc" | "diamond"
    readonly cornerRadius?: number
    readonly angle?: number
    readonly tipDiameter?: number
    readonly pitch?: number
    readonly fluteLength: number
    readonly shankDiameter: number
    readonly stickout: number
    readonly holder?: { readonly diameter: number; readonly length: number }
    readonly maxRpm?: number
    readonly number?: number
  }>
  readonly deburr?: number
  readonly subprograms?: boolean
  readonly print?: {
    readonly layerHeight?: number
    readonly firstLayerHeight?: number
    readonly walls?: number
    readonly topLayers?: number
    readonly bottomLayers?: number
    readonly infillDensity?: number
    readonly infillPattern?: "lines" | "grid" | "triangles" | "honeycomb" | "gyroid" | "concentric"
    readonly supports?: "none" | "buildplate" | "everywhere"
    readonly supportAngle?: number
    readonly adhesion?: "none" | "skirt" | "brim" | "raft"
    readonly brimWidth?: number
    readonly printSpeed?: number
    readonly nozzleTemperature?: number
    readonly bedTemperature?: number
    readonly fan?: number
    readonly vase?: boolean
    readonly orientation?: "as-designed" | "auto"
    readonly seam?: "nearest" | "aligned" | "random"
    readonly retractionDistance?: number
    readonly zHop?: number
    readonly flow?: number
    readonly relativeExtrusion?: boolean
  }
  readonly progress?: { readonly projectId: string; readonly runId: string }
}

export type ToolpathGeneratorParsePayload = { readonly gcode: string; readonly name?: string }

export type ToolpathGeneratorVerifyPayload = {
  readonly gcode?: string
  readonly program?: {
    readonly name: string
    readonly units: "mm" | "inch"
    readonly workOffset: "G54" | "G55" | "G56" | "G57" | "G58" | "G59"
    readonly toolpaths: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly toolId: string
      readonly spindleRpm: number
      readonly coolant: "off" | "flood" | "mist"
      readonly moves: ReadonlyArray<
        | {
            readonly _tag: "Rapid"
            readonly to: { readonly x: number; readonly y: number; readonly z: number }
            readonly rotary?: { readonly a?: number; readonly b?: number; readonly c?: number }
          }
        | {
            readonly _tag: "Linear"
            readonly to: { readonly x: number; readonly y: number; readonly z: number }
            readonly feed: number
            readonly rotary?: { readonly a?: number; readonly b?: number; readonly c?: number }
          }
        | {
            readonly _tag: "Arc"
            readonly to: { readonly x: number; readonly y: number; readonly z: number }
            readonly center: { readonly x: number; readonly y: number }
            readonly clockwise: boolean
            readonly feed: number
          }
        | { readonly _tag: "Dwell"; readonly seconds: number }
        | { readonly _tag: "Comment"; readonly text: string }
        | {
            readonly _tag: "Cycle"
            readonly cycle: "drill" | "dwell" | "peck" | "chipBreak" | "tap" | "ream" | "bore"
            readonly to: { readonly x: number; readonly y: number; readonly z: number }
            readonly feed: number
            readonly peckDepth: number
            readonly dwellSeconds: number
            readonly retractHeight: number
            readonly pitch?: number
          }
        | { readonly _tag: "Orient"; readonly a?: number; readonly b?: number; readonly c?: number }
      >
    }>
    readonly metadata?: { readonly [x: string]: string }
  }
  readonly stock: {
    readonly minX: number
    readonly maxX: number
    readonly minY: number
    readonly maxY: number
    readonly minZ: number
    readonly maxZ: number
  }
  readonly tool: {
    readonly kind?: "endmill" | "ballnose" | "drill" | "vbit" | "facemill"
    readonly diameter: number
    readonly cuttingLength?: number
    readonly shankDiameter?: number
    readonly stickout?: number
    readonly holderDiameter?: number
    readonly holderLength?: number
    readonly angle?: number
    readonly tipRadius?: number
  }
  readonly fixtures?: ReadonlyArray<{
    readonly id: string
    readonly bounds: {
      readonly minX: number
      readonly maxX: number
      readonly minY: number
      readonly maxY: number
      readonly minZ: number
      readonly maxZ: number
    }
  }>
  readonly target?: {
    readonly solids: ReadonlyArray<
      | {
          readonly _tag: "Box"
          readonly origin: { readonly x: number; readonly y: number; readonly z: number }
          readonly size: { readonly x: number; readonly y: number; readonly z: number }
        }
      | {
          readonly _tag: "Cylinder"
          readonly origin: { readonly x: number; readonly y: number; readonly z: number }
          readonly radius: number
          readonly height: number
          readonly segments: number
          readonly axis?: "z" | "x" | "y"
        }
      | {
          readonly _tag: "Sphere"
          readonly center: { readonly x: number; readonly y: number; readonly z: number }
          readonly radius: number
          readonly rings: number
        }
      | {
          readonly _tag: "Cone"
          readonly origin: { readonly x: number; readonly y: number; readonly z: number }
          readonly baseRadius: number
          readonly topRadius: number
          readonly height: number
          readonly segments: number
          readonly axis?: "z" | "x" | "y"
        }
      | {
          readonly _tag: "Torus"
          readonly center: { readonly x: number; readonly y: number; readonly z: number }
          readonly majorRadius: number
          readonly minorRadius: number
          readonly rotation?: number
          readonly majorSegments: number
          readonly minorSegments: number
          readonly axis?: "z" | "x" | "y"
        }
      | {
          readonly _tag: "Extrude"
          readonly profile: ReadonlyArray<{ readonly x: number; readonly y: number }>
          readonly height: number
          readonly origin?: { readonly x: number; readonly y: number; readonly z: number }
        }
      | {
          readonly _tag: "Revolve"
          readonly profile: ReadonlyArray<{ readonly x: number; readonly y: number }>
          readonly angle: number
          readonly segments?: number
        }
    >
    readonly meshes?: ReadonlyArray<{
      readonly positions: ReadonlyArray<number>
      readonly indices: ReadonlyArray<number>
    }>
    readonly reliefs?: ReadonlyArray<{
      readonly x: number
      readonly y: number
      readonly radius: number
      readonly bottom: number
      readonly reason: string
    }>
  }
  readonly resolution?: number
  readonly tolerance?: number
  readonly start?: { readonly x: number; readonly y: number; readonly z: number }
}

export type CadExactAnalyzePayload = {
  readonly elements?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly drawingId?: string
  readonly ids?: ReadonlyArray<string>
  readonly machining?: boolean
}

export type CadExactStepPayload = {
  readonly elements?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly drawingId?: string
  readonly ids?: ReadonlyArray<string>
  readonly faceted?: boolean
  readonly author?: string
}

export type CadExactAssemblyPayload = {
  readonly elements?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly drawingId?: string
  readonly washers?: boolean
}

export type CadExactSetupsPayload = {
  readonly elements?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly drawingId?: string
  readonly ids?: ReadonlyArray<string>
  readonly fixture?: "bottom" | "none"
  readonly allowed?: ReadonlyArray<"+Z" | "-Z" | "+X" | "-X" | "+Y" | "-Y">
}

export type CadExactHolePayload = {
  readonly elements?: ReadonlyArray<{ readonly [x: string]: JsonValue }>
  readonly drawingId?: string
  readonly id: string
  readonly hole?: number
  readonly boss?: number
  readonly diameter?: number
  readonly fill?: boolean
}

export type LibraryCreatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly category?: string | undefined
  readonly type?: string | undefined
  readonly data?: unknown | undefined
  readonly properties?: unknown | undefined
  readonly tags?: unknown | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type LibraryUpdatePayload = {
  readonly name?: string | undefined
  readonly description?: string | null | undefined
  readonly category?: string | undefined
  readonly type?: string | undefined
  readonly data?: unknown | undefined
  readonly properties?: unknown | undefined
  readonly tags?: unknown | undefined
  readonly organizationId?: string | null | undefined
  readonly isPublic?: boolean | undefined
}

export type VcsCommitPayload = {
  readonly message: string
  readonly authorKind?: "user" | "ai" | undefined
  readonly files?: { readonly [x: string]: string } | undefined
}

export type VcsCreateBranchPayload = { readonly name: string; readonly from?: string | undefined }

export type VcsCheckoutPayload = { readonly branch: string }

export type VcsRestorePayload = { readonly rev: string; readonly paths?: ReadonlyArray<string> | undefined }

export type VcsOpenPullRequestPayload = {
  readonly title: string
  readonly body?: string | undefined
  readonly head: string
  readonly base?: string | undefined
  readonly authorKind?: "user" | "ai" | undefined
}

export type VcsReviewPayload = {
  readonly verdict: "comment" | "approve" | "request-changes"
  readonly body?: string | undefined
  readonly path?: string | undefined
  readonly pointer?: string | undefined
}

export type VcsSetRemotePayload = { readonly remote: string | null }

export type VcsPushPayload = { readonly branch?: string | undefined }

export type VcsPullPayload = { readonly branch?: string | undefined }

export type VcsDispatchPayload = { readonly ref?: string | undefined }

export type CompanionEnablePayload = { readonly port?: number | undefined }

export type CompanionPairPayload = { readonly name: string; readonly host?: string | undefined }

export type HealthCheckOutput = { status: string; timestamp: string }

export type SystemReadyOutput = { status: string; timestamp: string }

export type SystemVersionOutput = { version: string }

export type AuthIdentityStartOutput = { id: string; url: string; issuer: string }

export type AuthIdentityPollInput = { readonly id: AuthIdentityPollPayload["id"] }

export type AuthIdentityPollOutput =
  | { status: "pending" }
  | { status: "complete"; tokens: { access: string; refresh: string; expiresAt: number } }
  | { status: "failed"; message: string }

export type AuthIdentityCancelInput = { readonly id: AuthIdentityCancelPayload["id"] }

export type AuthIdentityCancelOutput = { success: true; message: string }

export type AuthForgotPasswordInput = {
  readonly email?: AuthForgotPasswordPayload["email"]
  readonly callbackURL?: AuthForgotPasswordPayload["callbackURL"]
}

export type AuthForgotPasswordOutput = { success: true; message: string; debugResetLink?: string | undefined }

export type AuthResetPasswordInput = {
  readonly token?: AuthResetPasswordPayload["token"]
  readonly newPassword?: AuthResetPasswordPayload["newPassword"]
  readonly confirmPassword?: AuthResetPasswordPayload["confirmPassword"]
}

export type AuthResetPasswordOutput = {
  success: true
  message: string
  user: { id: string; email: string; name: string | null }
}

export type AuthSendMagicLinkInput = {
  readonly email?: AuthSendMagicLinkPayload["email"]
  readonly callbackURL?: AuthSendMagicLinkPayload["callbackURL"]
}

export type AuthSendMagicLinkOutput = { success: true; message: string; debugMagicLink?: string | undefined }

export type AuthSendVerificationEmailInput = {
  readonly email?: AuthSendVerificationEmailPayload["email"]
  readonly callbackURL?: AuthSendVerificationEmailPayload["callbackURL"]
}

export type AuthSendVerificationEmailOutput = { success: true; message: string; debug: { link: string } }

export type AuthVerifyEmailInput = { readonly token?: AuthVerifyEmailPayload["token"] }

export type AuthVerifyEmailOutput = {
  success: true
  message: string
  user: { id: string; email: string; name: string | null; emailVerified: string }
}

export type AuthSignoutOutput = {
  readonly body: { success: true; message: string }
  readonly headers: { readonly "set-cookie"?: ReadonlyArray<string> | string | undefined }
}

export type AuthGetSessionOutput = {
  session: {
    user: {
      id: string
      email: string | null
      name: string | null
      emailVerified: string | null
      createdAt: string
      updatedAt: string
    }
    expires: string
    sessionToken?: string | undefined
  }
}

export type AuthSigninDirectInput = {
  readonly email?: AuthSigninDirectPayload["email"]
  readonly password?: AuthSigninDirectPayload["password"]
}

export type AuthSigninDirectOutput = {
  readonly body: {
    success: true
    message: string
    user: { id: string; email: string | null; name: string | null; emailVerified: string | null; createdAt: string }
    token: string
  }
  readonly headers: { readonly "set-cookie"?: ReadonlyArray<string> | string | undefined }
}

export type AuthSignupInput = {
  readonly email?: AuthSignupPayload["email"]
  readonly password?: AuthSignupPayload["password"]
  readonly confirmPassword?: AuthSignupPayload["confirmPassword"]
  readonly name?: AuthSignupPayload["name"]
}

export type AuthSignupOutput = {
  success: true
  message: string
  user: { id: string; email: string | null; name: string | null; emailVerified: string | null; createdAt: string }
}

export type AuthTestDirectCreateInput = {
  readonly email?: AuthTestDirectCreatePayload["email"]
  readonly password?: AuthTestDirectCreatePayload["password"]
  readonly name?: AuthTestDirectCreatePayload["name"]
}

export type AuthTestDirectCreateOutput = {
  success: true
  message: string
  user: { id: string; email: string | null; name: string | null; emailVerified: string | null; createdAt: string }
}

export type AuthVerifyMagicLinkInput = { readonly token?: AuthVerifyMagicLinkPayload["token"] }

export type AuthVerifyMagicLinkOutput = {
  readonly body: {
    success: true
    message: string
    user: { id: string; email: string | null; name: string | null }
    token?: string | undefined
  }
  readonly headers: { readonly "set-cookie"?: ReadonlyArray<string> | string | undefined }
}

export type AuthRegisterPasskeyOutput = never

export type WaitlistJoinInput = { readonly email: WaitlistJoinPayload["email"] }

export type WaitlistJoinOutput = { success: true; message: string }

export type AnalyticsSystemMetricsOutput = {
  cpuUsage: number
  memoryUsage: number
  storageUsed: number
  networkLatency: number
  activeConnections: number
  cacheHitRatio: number
  errorRate: number
  responseTime: number
}

export type AnalyticsIndexInput = {
  readonly startDate?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly groupBy?: string | undefined
    readonly userFilter?: string | ReadonlyArray<string> | undefined
  }["startDate"]
  readonly endDate?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly groupBy?: string | undefined
    readonly userFilter?: string | ReadonlyArray<string> | undefined
  }["endDate"]
  readonly itemType?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly groupBy?: string | undefined
    readonly userFilter?: string | ReadonlyArray<string> | undefined
  }["itemType"]
  readonly action?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly groupBy?: string | undefined
    readonly userFilter?: string | ReadonlyArray<string> | undefined
  }["action"]
  readonly groupBy?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly groupBy?: string | undefined
    readonly userFilter?: string | ReadonlyArray<string> | undefined
  }["groupBy"]
  readonly userFilter?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly groupBy?: string | undefined
    readonly userFilter?: string | ReadonlyArray<string> | undefined
  }["userFilter"]
}

export type AnalyticsIndexOutput = {
  success: true
  data: {
    countByType: Array<{ itemType: string; _count: number }>
    countByAction: Array<{ action: string; _count: number }>
  }
  isAdmin: boolean
  filters: unknown
}

export type AnalyticsDashboardDataOutput = {
  components: { total: number; trend: number; recentActivity: number }
  projects: { total: number; trend: number; activeProjects: number }
  tools: { total: number; trend: number; mostUsed: string }
  materials: { total: number; trend: number; lowStock: number }
}

export type AnalyticsLogViewInput = {
  readonly path?: AnalyticsLogViewPayload["path"]
  readonly query?: AnalyticsLogViewPayload["query"]
}

export type AnalyticsLogViewOutput = { success: true }

export type AnalyticsRecentActivityInput = { readonly limit?: { readonly limit?: string | undefined }["limit"] }

export type AnalyticsRecentActivityOutput = Array<{
  id: string
  type: string
  action: string
  itemName: string
  timestamp: string
  userId: string
  userName: string
}>

export type AnalyticsUserHistoryInput = {
  readonly limit?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
  }["limit"]
  readonly offset?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
  }["offset"]
  readonly itemType?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
  }["itemType"]
  readonly action?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
  }["action"]
  readonly startDate?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
  }["startDate"]
  readonly endDate?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly itemType?: string | ReadonlyArray<string> | undefined
    readonly action?: string | ReadonlyArray<string> | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
  }["endDate"]
}

export type AnalyticsUserHistoryOutput = { logs: Array<unknown>; total: number }

export type AnalyticsUserMetricsInput = {
  readonly startDate?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly groupBy?: string | undefined
    readonly metric?: string | undefined
  }["startDate"]
  readonly endDate?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly groupBy?: string | undefined
    readonly metric?: string | undefined
  }["endDate"]
  readonly groupBy?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly groupBy?: string | undefined
    readonly metric?: string | undefined
  }["groupBy"]
  readonly metric?: {
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly groupBy?: string | undefined
    readonly metric?: string | undefined
  }["metric"]
}

export type AnalyticsUserMetricsOutput = {
  summary: {
    totalAiRequests: number
    totalCadDrawings: number
    totalStorageUsage: number
    totalProjects: number
    totalComponents: number
    totalToolpaths: number
    totalActivityCount?: number | undefined
  }
  chartData: Array<{ [x: string]: string | number }>
}

export type AnalyticsUserUsageInput = {
  readonly userId?: {
    readonly userId?: string | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly period?: string | undefined
  }["userId"]
  readonly startDate?: {
    readonly userId?: string | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly period?: string | undefined
  }["startDate"]
  readonly endDate?: {
    readonly userId?: string | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly period?: string | undefined
  }["endDate"]
  readonly period?: {
    readonly userId?: string | undefined
    readonly startDate?: string | undefined
    readonly endDate?: string | undefined
    readonly period?: string | undefined
  }["period"]
}

export type AnalyticsUserUsageOutput = {
  summary?: unknown | undefined
  breakdown?: unknown | undefined
  users?: Array<unknown> | undefined
  systemStats?: unknown | undefined
}

export type AnalyticsClearUserUsageOutput = { message: string }

export type AnalyticsTrackInput = {
  readonly itemId?: AnalyticsTrackPayload["itemId"]
  readonly itemType?: AnalyticsTrackPayload["itemType"]
  readonly action?: AnalyticsTrackPayload["action"]
  readonly details?: AnalyticsTrackPayload["details"]
}

export type AnalyticsTrackOutput = { success: true }

export type UserProfileOutput = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  bio: string | null
  location: string | null
  website: string | null
  company: string | null
  title: string | null
  publicProfile: boolean
  showEmail: boolean
  createdAt: string
  _count: { projects: number }
}

export type UserStatsOutput = {
  projectsCount: number
  drawingsCount: number
  toolpathsCount: number
  componentsCount: number
  totalDesigns: number
  memberSince: string
}

export type UserComponentsOutput = Array<{
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  thumbnail: string | null
  projectId: string | null
}>

export type UserProjectsOutput = Array<{
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}>

export type UserToolpathsOutput = Array<{
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  thumbnail: string | null
  projectId: string | null
}>

export type UserOrganizationsOutput = Array<{
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  role: string
  userCount: number
  projectCount: number
}>

export type UserApiKeysOutput = Array<{
  id: string
  name: string
  createdAt: string
  lastUsed: string | null
  expiresAt: string | null
}>

export type UserCreateApiKeyInput = { readonly name?: UserCreateApiKeyPayload["name"] }

export type UserCreateApiKeyOutput = { message: string; apiKey: string; name: string }

export type UserRevokeApiKeyInput = { readonly keyId?: { readonly keyId?: string | undefined }["keyId"] }

export type UserRevokeApiKeyOutput = { message: string }

export type UserDeleteAccountOutput = { message: string }

export type UserPasswordInput = {
  readonly currentPassword?: UserPasswordPayload["currentPassword"]
  readonly newPassword?: UserPasswordPayload["newPassword"]
}

export type UserPasswordOutput = { message: string }

export type UserTokensOutput = {
  tokens: Array<{
    id: string
    name: string
    prefix: string
    permissions: Array<string>
    createdAt: string
    lastUsed?: string | undefined
    expiresAt?: string | undefined
    isActive: boolean
  }>
}

export type UserCreateTokenInput = {
  readonly name?: UserCreateTokenPayload["name"]
  readonly permissions?: UserCreateTokenPayload["permissions"]
  readonly expiresIn?: UserCreateTokenPayload["expiresIn"]
}

export type UserCreateTokenOutput = {
  token: {
    id: string
    name: string
    prefix: string
    permissions: Array<string>
    createdAt: string
    lastUsed?: string | undefined
    expiresAt?: string | undefined
    isActive: boolean
  }
  fullToken: string
}

export type UserVerifyChangeInput = {
  readonly token?: {
    readonly token?: string | undefined
    readonly type?: string | undefined
    readonly password?: string | undefined
  }["token"]
  readonly type?: {
    readonly token?: string | undefined
    readonly type?: string | undefined
    readonly password?: string | undefined
  }["type"]
  readonly password?: {
    readonly token?: string | undefined
    readonly type?: string | undefined
    readonly password?: string | undefined
  }["password"]
}

export type UserVerifyChangeOutput = { message: string }

export type UserGitProfileOutput = { name: string; email: string }

export type UserUpdateGitProfileInput = {
  readonly name: UserUpdateGitProfilePayload["name"]
  readonly email: UserUpdateGitProfilePayload["email"]
}

export type UserUpdateGitProfileOutput = { name: string; email: string }

export type UserByIdInput = { readonly id: { readonly id: string }["id"] }

export type UserByIdOutput = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  createdAt: string
  organizations: Array<{ id: string; name: string; role: string }>
}

export type AiActionsOutput = {
  tools: Array<{
    id: string
    description: string
    kind: "read" | "write" | "destructive"
    actions: Array<{ id: string; name: string; kind: "read" | "write" | "destructive" }>
    parameters: { [x: string]: any }
  }>
}

export type AiInvokeActionInput = {
  readonly projectId: AiInvokeActionPayload["projectId"]
  readonly drawingId?: AiInvokeActionPayload["drawingId"]
  readonly tool: AiInvokeActionPayload["tool"]
  readonly input: AiInvokeActionPayload["input"]
}

export type AiInvokeActionOutput = { tool: string; action: string; result: unknown }

export type AiIssueBridgeTokenInput = {
  readonly name?: AiIssueBridgeTokenPayload["name"]
  readonly projectId: AiIssueBridgeTokenPayload["projectId"]
  readonly mode: AiIssueBridgeTokenPayload["mode"]
  readonly days?: AiIssueBridgeTokenPayload["days"]
}

export type AiIssueBridgeTokenOutput = {
  info: {
    id: string
    name: string
    projectId: string
    mode: "read" | "write"
    userId: string
    createdAt: string
    expiresAt: string
  }
  token: string
}

export type AiBridgeTokensOutput = Array<{
  id: string
  name: string
  projectId: string
  mode: "read" | "write"
  userId: string
  createdAt: string
  expiresAt: string
}>

export type AiRevokeBridgeTokenInput = { readonly id: { readonly id: string }["id"] }

export type AiRevokeBridgeTokenOutput = { message: string }

export type AiAgentsOutput = Array<{
  id: string
  title: string
  description: string
  tools: Array<string>
  edits: boolean
}>

export type AiSessionControlInput = {
  readonly sessionId: AiSessionControlPayload["sessionId"]
  readonly projectId?: AiSessionControlPayload["projectId"]
  readonly action: AiSessionControlPayload["action"]
  readonly taskId?: AiSessionControlPayload["taskId"]
  readonly requestId?: AiSessionControlPayload["requestId"]
  readonly answers?: AiSessionControlPayload["answers"]
  readonly decision?: AiSessionControlPayload["decision"]
  readonly model?: AiSessionControlPayload["model"]
}

export type AiSessionControlOutput = {
  goal?:
    | {
        objective: string
        status: "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete"
        iteration: number
        tokensUsed: number
        tokenBudget?: number | undefined
      }
    | null
    | undefined
  permissions?: Array<{ requestId: string; sessionId: string; permission: string; patterns: Array<string> }> | undefined
  busy: boolean
  text: string
  tasks: Array<{
    id: string
    agent: string
    description: string
    status: "queued" | "running" | "completed" | "error" | "cancelled"
    background: boolean
    text?: string | undefined
    error?: string | undefined
    createdAt?: number | undefined
    startedAt?: number | undefined
    finishedAt?: number | undefined
  }>
  questions: Array<{
    requestId: string
    questions: Array<{
      header: string
      question: string
      options: Array<{ label: string; description: string }>
      multiple?: boolean | undefined
      custom?: boolean | undefined
    }>
  }>
  context: {
    memory?:
      | {
          enabled: boolean
          memoryEnabled: boolean
          minHours: number
          minSessions: number
          lastBrainAt: number
          hoursSinceLastBrain: number
          sessionsSinceLastBrain: number
          shouldTrigger: boolean
        }
      | undefined
    source: "host-config"
    auto: boolean
    prune: boolean
    reserved?: number | undefined
    provider?: string | undefined
    model?: string | undefined
    contextWindow?: number | undefined
    maxOutput?: number | undefined
    inputWindow?: number | undefined
    requestOutput?: number | undefined
    compactAt?: number | undefined
    tokens?: number | undefined
    compacted: boolean
    breakdown?: { estimatedTotal: number; categories: Array<{ category: string; tokens: number }> } | undefined
  }
}

export type AiSessionStateInput = {
  readonly sessionId: AiSessionStatePayload["sessionId"]
  readonly projectId?: AiSessionStatePayload["projectId"]
}

export type AiSessionStateOutput = {
  busy: boolean
  text: string
  error?: string | undefined
  tasks?:
    | Array<{
        id: string
        agent: string
        description: string
        status: "queued" | "running" | "completed" | "error" | "cancelled"
        background: boolean
        text?: string | undefined
        error?: string | undefined
        createdAt?: number | undefined
        startedAt?: number | undefined
        finishedAt?: number | undefined
      }>
    | undefined
  events?:
    | Array<
        | { type: "tool_call"; sessionId: string; agent?: string; callId: string; tool: string; input: unknown }
        | {
            type: "tool_result"
            sessionId: string
            agent?: string
            callId: string
            tool: string
            ok: boolean
            output: string
            images?: Array<string>
          }
        | {
            type: "todo"
            sessionId: string
            todos: Array<{
              id?: string
              content: string
              status: "pending" | "in_progress" | "completed" | "cancelled"
              priority?: string
            }>
          }
        | {
            type: "tool_diagnostic"
            sessionId: string
            agent?: string
            callId: string
            tool: string
            kind: "argument" | "execution" | "partial" | "verification"
            severity: "error" | "warning" | "info"
            message: string
            recovery?: string
            mutationApplied?: boolean
          }
      >
    | undefined
  usage?: { inputTokens: number; outputTokens: number } | undefined
}

export type AiRemoveSessionInput = {
  readonly sessionId: AiRemoveSessionPayload["sessionId"]
  readonly projectId?: AiRemoveSessionPayload["projectId"]
}

export type AiRemoveSessionOutput = { removed: boolean }

export type AiMcpServersInput = { readonly projectId: { readonly projectId: string }["projectId"] }

export type AiMcpServersOutput = {
  servers: Array<{
    name: string
    config:
      | {
          type: "local"
          command: Array<string>
          environment?: { [x: string]: string } | undefined
          enabled: boolean
          timeout?: number | undefined
        }
      | {
          type: "remote"
          url: string
          headers?: { [x: string]: string } | undefined
          oauth?: false | undefined
          enabled: boolean
          timeout?: number | undefined
        }
    status: string
  }>
}

export type AiSaveMcpServerInput = {
  readonly projectId: AiSaveMcpServerPayload["projectId"]
  readonly name: AiSaveMcpServerPayload["name"]
  readonly config: AiSaveMcpServerPayload["config"]
}

export type AiSaveMcpServerOutput = {
  servers: Array<{
    name: string
    config:
      | {
          type: "local"
          command: Array<string>
          environment?: { [x: string]: string } | undefined
          enabled: boolean
          timeout?: number | undefined
        }
      | {
          type: "remote"
          url: string
          headers?: { [x: string]: string } | undefined
          oauth?: false | undefined
          enabled: boolean
          timeout?: number | undefined
        }
    status: string
  }>
}

export type AiDeleteMcpServerInput = {
  readonly name: { readonly name: string }["name"]
  readonly projectId: { readonly projectId: string }["projectId"]
}

export type AiDeleteMcpServerOutput = {
  servers: Array<{
    name: string
    config:
      | {
          type: "local"
          command: Array<string>
          environment?: { [x: string]: string } | undefined
          enabled: boolean
          timeout?: number | undefined
        }
      | {
          type: "remote"
          url: string
          headers?: { [x: string]: string } | undefined
          oauth?: false | undefined
          enabled: boolean
          timeout?: number | undefined
        }
    status: string
  }>
}

export type AiRemoveExtensionPluginInput = { readonly id: { readonly id: string }["id"] }

export type AiRemoveExtensionPluginOutput = {
  plugins: Array<{
    id: string
    name: string
    version: string
    enabled: boolean
    tools: number
    mods: number
    modes: number
  }>
}

export type AiExtensionPluginsOutput = {
  plugins: Array<{
    id: string
    name: string
    version: string
    enabled: boolean
    tools: number
    mods: number
    modes: number
  }>
}

export type AiInstallExtensionPluginInput = {
  readonly manifest: AiInstallExtensionPluginPayload["manifest"]
  readonly source: AiInstallExtensionPluginPayload["source"]
  readonly files?: AiInstallExtensionPluginPayload["files"]
}

export type AiInstallExtensionPluginOutput = {
  plugins: Array<{
    id: string
    name: string
    version: string
    enabled: boolean
    tools: number
    mods: number
    modes: number
  }>
}

export type AiToggleExtensionPluginInput = {
  readonly id: { readonly id: string }["id"]
  readonly enabled: AiToggleExtensionPluginPayload["enabled"]
}

export type AiToggleExtensionPluginOutput = {
  plugins: Array<{
    id: string
    name: string
    version: string
    enabled: boolean
    tools: number
    mods: number
    modes: number
  }>
}

export type AiExtensionModsOutput = {
  mods: Array<{
    id: string
    name: string
    description: string
    enabled: boolean
    origin: "assistant" | "user" | "plugin"
    pluginId?: string | undefined
  }>
}

export type AiToggleExtensionModInput = {
  readonly id: { readonly id: string }["id"]
  readonly enabled: AiToggleExtensionModPayload["enabled"]
}

export type AiToggleExtensionModOutput = {
  mods: Array<{
    id: string
    name: string
    description: string
    enabled: boolean
    origin: "assistant" | "user" | "plugin"
    pluginId?: string | undefined
  }>
}

export type AiRemoveExtensionModInput = { readonly id: { readonly id: string }["id"] }

export type AiRemoveExtensionModOutput = {
  mods: Array<{
    id: string
    name: string
    description: string
    enabled: boolean
    origin: "assistant" | "user" | "plugin"
    pluginId?: string | undefined
  }>
}

export type AiModesOutput = {
  modes: Array<{ id: string; title: string; description: string; pluginId: string; pluginName: string }>
}

export type AiSkillsOutput = {
  skills: Array<{ name: string; description: string; builtIn: boolean; category: string }>
  max: number
}

export type AiSaveSkillInput = {
  readonly markdown?: AiSaveSkillPayload["markdown"]
  readonly name?: AiSaveSkillPayload["name"]
  readonly description?: AiSaveSkillPayload["description"]
  readonly body?: AiSaveSkillPayload["body"]
}

export type AiSaveSkillOutput = {
  skill: { name: string; description: string; builtIn: boolean; category: string }
  skills: Array<{ name: string; description: string; builtIn: boolean; category: string }>
  live: boolean
}

export type AiDeleteSkillInput = { readonly name: { readonly name: string }["name"] }

export type AiDeleteSkillOutput = {
  skills: Array<{ name: string; description: string; builtIn: boolean; category: string }>
  max: number
}

export type AiSetCredentialsInput = {
  readonly provider?: AiSetCredentialsPayload["provider"]
  readonly key?: AiSetCredentialsPayload["key"]
  readonly baseUrl?: AiSetCredentialsPayload["baseUrl"]
}

export type AiSetCredentialsOutput = {
  providers: { [x: string]: "configured" | "missing" }
  configured: boolean
  tools?: Array<{ id: string; description: string }> | undefined
  host: "nikcli" | "direct"
}

export type AiClearCredentialsInput = { readonly provider: { readonly provider: string }["provider"] }

export type AiClearCredentialsOutput = {
  providers: { [x: string]: "configured" | "missing" }
  configured: boolean
  tools?: Array<{ id: string; description: string }> | undefined
  host: "nikcli" | "direct"
}

export type AiStatusOutput = {
  providers: { [x: string]: "configured" | "missing" }
  configured: boolean
  tools?: Array<{ id: string; description: string }> | undefined
  host: "nikcli" | "direct"
}

export type AiModelsInput = {
  readonly configuredOnly?: { readonly configuredOnly?: "true" | "false" | undefined }["configuredOnly"]
}

export type AiModelsOutput = Array<{
  id: string
  provider: string
  tier?: "fast" | "balanced" | "best" | undefined
  contextWindow: number
  tools: boolean
  vision: boolean
  configured: boolean
}>

export type AiProvidersOutput = Array<{
  id: string
  name: string
  source: string
  auth: Array<string>
  configured: boolean
  baseUrl?: string | undefined
  defaultModel?: string | undefined
  models: Array<{
    id: string
    name: string
    provider: string
    contextWindow: number
    maxOutput: number
    inputWindow?: number | undefined
    reasoning?: boolean | undefined
    variants?: Array<string> | undefined
    tools: boolean
    vision: boolean
    cost: { input: number; output: number }
  }>
}>

export type AiRefreshModelsOutput = Array<{
  id: string
  name: string
  source: string
  auth: Array<string>
  configured: boolean
  baseUrl?: string | undefined
  defaultModel?: string | undefined
  models: Array<{
    id: string
    name: string
    provider: string
    contextWindow: number
    maxOutput: number
    inputWindow?: number | undefined
    reasoning?: boolean | undefined
    variants?: Array<string> | undefined
    tools: boolean
    vision: boolean
    cost: { input: number; output: number }
  }>
}>

export type AiPromptsInput = { readonly mode?: { readonly mode?: string | undefined }["mode"] }

export type AiPromptsOutput = { prompts: Array<string> }

export type AiTitleInput = { readonly excerpt?: AiTitlePayload["excerpt"]; readonly model?: AiTitlePayload["model"] }

export type AiTitleOutput = { title: string }

export type AiDesignAnalysisInput = {
  readonly description?: AiDesignAnalysisPayload["description"]
  readonly layer?: AiDesignAnalysisPayload["layer"]
  readonly machine?: AiDesignAnalysisPayload["machine"]
  readonly model?: AiDesignAnalysisPayload["model"]
}

export type AiDesignAnalysisOutput = {
  suggestions: Array<{
    title: string
    description: string
    confidence: number
    priority: "low" | "medium" | "high"
    kind: "optimization" | "warning" | "critical"
  }>
}

export type AiMachiningParametersInput = {
  readonly material?: AiMachiningParametersPayload["material"]
  readonly tool?: AiMachiningParametersPayload["tool"]
  readonly operation?: AiMachiningParametersPayload["operation"]
  readonly machine?: AiMachiningParametersPayload["machine"]
  readonly model?: AiMachiningParametersPayload["model"]
}

export type AiMachiningParametersOutput = {
  cuttingSpeedMPerMin: number
  feedRateMmPerMin: number
  depthOfCutMm: number
  stepoverPct: number
  coolant: "flood" | "mist" | "none"
  engagement: "conventional" | "climb"
  warnings: Array<string>
}

export type AiGcodeOptimizationInput = {
  readonly gcode?: AiGcodeOptimizationPayload["gcode"]
  readonly material?: AiGcodeOptimizationPayload["material"]
  readonly machineType?: AiGcodeOptimizationPayload["machineType"]
  readonly constraints?: AiGcodeOptimizationPayload["constraints"]
  readonly model?: AiGcodeOptimizationPayload["model"]
}

export type AiGcodeOptimizationOutput = {
  gcode: string
  changes: Array<{ line: number; before: string; after: string; reason: string }>
  estimatedSavings: { timePct: number; toolLifePct: number; qualityNote: string }
  notes: string
}

export type AiDesignSuggestionsInput = {
  readonly elements?: AiDesignSuggestionsPayload["elements"]
  readonly currentOperation?: AiDesignSuggestionsPayload["currentOperation"]
  readonly currentTool?: AiDesignSuggestionsPayload["currentTool"]
  readonly model?: AiDesignSuggestionsPayload["model"]
}

export type AiDesignSuggestionsOutput = Array<{ title: string; rationale: string; nextStep: string }>

export type AiChatInput = {
  readonly messages?: AiChatPayload["messages"]
  readonly mcpServerId?: AiChatPayload["mcpServerId"]
  readonly mcpReference?: AiChatPayload["mcpReference"]
}

export type AiChatOutput = { reply: string; hasMcpData: boolean }

export type AiChatStreamInput = {
  readonly permissionMode?: AiChatStreamPayload["permissionMode"]
  readonly agent?: AiChatStreamPayload["agent"]
  readonly mode?: AiChatStreamPayload["mode"]
  readonly attachments?: AiChatStreamPayload["attachments"]
  readonly message?: AiChatStreamPayload["message"]
  readonly sessionId?: AiChatStreamPayload["sessionId"]
  readonly projectId?: AiChatStreamPayload["projectId"]
  readonly drawingId?: AiChatStreamPayload["drawingId"]
  readonly context?: AiChatStreamPayload["context"]
  readonly includeContext?: AiChatStreamPayload["includeContext"]
  readonly model?: AiChatStreamPayload["model"]
}

export type AiChatStreamOutput =
  | { type: "turn"; sessionId: string; phase: "start" | "recovering" | "continuing" | "finish"; reason?: string }
  | { type: "session_status"; sessionId: string; status: "busy" | "idle" | "retry" }
  | { type: "permission_resolved"; sessionId: string; requestId: string; reply: "once" | "always" | "reject" }
  | { type: "permission_blocked"; sessionId: string; permission: string; patterns: Array<string>; reason: string }
  | { type: "compaction"; sessionId: string; phase: "start" | "finish" }
  | { type: "context_snapshot"; sessionId: string; projectId: string; source: "workspace"; chars: number }
  | {
      type: "tool_diagnostic"
      sessionId: string
      agent?: string
      callId: string
      tool: string
      kind: "argument" | "execution" | "partial" | "verification"
      severity: "error" | "warning" | "info"
      message: string
      recovery?: string
      mutationApplied?: boolean
    }
  | { type: "user_message"; sessionId: string; text: string }
  | {
      type: "goal"
      sessionId: string
      goal: {
        objective: string
        status: "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete"
        iteration: number
        tokensUsed: number
        tokenBudget?: number
      } | null
    }
  | { type: "delta"; sessionId: string; text: string }
  | { type: "reasoning"; sessionId: string; text: string }
  | { type: "tool_progress"; sessionId: string; agent?: string; callId: string; tool: string; chars: number }
  | {
      type: "step"
      sessionId: string
      phase: "start" | "finish"
      index: number
      reason?: string
      usage?: { inputTokens: number; outputTokens: number }
    }
  | {
      type: "todo"
      sessionId: string
      todos: Array<{
        id?: string
        content: string
        status: "pending" | "in_progress" | "completed" | "cancelled"
        priority?: string
      }>
    }
  | { type: "retry"; sessionId: string; attempt: number; message: string }
  | { type: "compacted"; sessionId: string }
  | { type: "tool_call"; sessionId: string; agent?: string; callId: string; tool: string; input: unknown }
  | {
      type: "tool_result"
      sessionId: string
      agent?: string
      callId: string
      tool: string
      ok: boolean
      output: string
      images?: Array<string>
    }
  | { type: "permission_request"; sessionId: string; requestId: string; permission: string; patterns: Array<string> }
  | {
      type: "question_request"
      sessionId: string
      requestId: string
      questions: Array<{
        header: string
        question: string
        options: Array<{ label: string; description: string }>
        multiple?: boolean
        custom?: boolean
      }>
    }
  | { type: "question_resolved"; sessionId: string; requestId: string }
  | {
      type: "done"
      sessionId: string
      text: string
      usage?: { inputTokens: number; outputTokens: number }
      recovered?: boolean
    }
  | { type: "error"; sessionId: string; code: "provider" | "config" | "aborted" | "internal"; message: string }
  | { type: "heartbeat" }

export type AiSessionPromptInput = {
  readonly permissionMode?: AiSessionPromptPayload["permissionMode"]
  readonly agent?: AiSessionPromptPayload["agent"]
  readonly mode?: AiSessionPromptPayload["mode"]
  readonly attachments?: AiSessionPromptPayload["attachments"]
  readonly message?: AiSessionPromptPayload["message"]
  readonly sessionId?: AiSessionPromptPayload["sessionId"]
  readonly projectId?: AiSessionPromptPayload["projectId"]
  readonly drawingId?: AiSessionPromptPayload["drawingId"]
  readonly context?: AiSessionPromptPayload["context"]
  readonly includeContext?: AiSessionPromptPayload["includeContext"]
  readonly model?: AiSessionPromptPayload["model"]
}

export type AiSessionPromptOutput = { sessionId: string; seq: number }

export type AiSessionStreamInput = {
  readonly sessionId: { readonly sessionId: string }["sessionId"]
  readonly after?: { readonly after?: number | undefined }["after"]
}

export type AiSessionStreamOutput =
  | { type: "server.connected"; sessionId: string; busy: boolean; seq: number; reset?: boolean | undefined }
  | { type: "server.heartbeat" }
  | {
      type: "event"
      seq: number
      event:
        | { type: "turn"; sessionId: string; phase: "start" | "recovering" | "continuing" | "finish"; reason?: string }
        | { type: "session_status"; sessionId: string; status: "busy" | "idle" | "retry" }
        | { type: "permission_resolved"; sessionId: string; requestId: string; reply: "once" | "always" | "reject" }
        | { type: "permission_blocked"; sessionId: string; permission: string; patterns: Array<string>; reason: string }
        | { type: "compaction"; sessionId: string; phase: "start" | "finish" }
        | { type: "context_snapshot"; sessionId: string; projectId: string; source: "workspace"; chars: number }
        | {
            type: "tool_diagnostic"
            sessionId: string
            agent?: string
            callId: string
            tool: string
            kind: "argument" | "execution" | "partial" | "verification"
            severity: "error" | "warning" | "info"
            message: string
            recovery?: string
            mutationApplied?: boolean
          }
        | { type: "user_message"; sessionId: string; text: string }
        | {
            type: "goal"
            sessionId: string
            goal: {
              objective: string
              status: "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete"
              iteration: number
              tokensUsed: number
              tokenBudget?: number
            } | null
          }
        | { type: "delta"; sessionId: string; text: string }
        | { type: "reasoning"; sessionId: string; text: string }
        | { type: "tool_progress"; sessionId: string; agent?: string; callId: string; tool: string; chars: number }
        | {
            type: "step"
            sessionId: string
            phase: "start" | "finish"
            index: number
            reason?: string
            usage?: { inputTokens: number; outputTokens: number }
          }
        | {
            type: "todo"
            sessionId: string
            todos: Array<{
              id?: string
              content: string
              status: "pending" | "in_progress" | "completed" | "cancelled"
              priority?: string
            }>
          }
        | { type: "retry"; sessionId: string; attempt: number; message: string }
        | { type: "compacted"; sessionId: string }
        | { type: "tool_call"; sessionId: string; agent?: string; callId: string; tool: string; input: unknown }
        | {
            type: "tool_result"
            sessionId: string
            agent?: string
            callId: string
            tool: string
            ok: boolean
            output: string
            images?: Array<string>
          }
        | {
            type: "permission_request"
            sessionId: string
            requestId: string
            permission: string
            patterns: Array<string>
          }
        | {
            type: "question_request"
            sessionId: string
            requestId: string
            questions: Array<{
              header: string
              question: string
              options: Array<{ label: string; description: string }>
              multiple?: boolean
              custom?: boolean
            }>
          }
        | { type: "question_resolved"; sessionId: string; requestId: string }
        | {
            type: "done"
            sessionId: string
            text: string
            usage?: { inputTokens: number; outputTokens: number }
            recovered?: boolean
          }
        | { type: "error"; sessionId: string; code: "provider" | "config" | "aborted" | "internal"; message: string }
    }

export type AiSessionListInput = {
  readonly projectId: { readonly projectId: string; readonly limit?: string | undefined }["projectId"]
  readonly limit?: { readonly projectId: string; readonly limit?: string | undefined }["limit"]
}

export type AiSessionListOutput = Array<{
  id: string
  projectId: string
  title: string
  createdAt: string | null
  updatedAt: string | null
  busy: boolean
}>

export type AiSessionMessagesInput = {
  readonly sessionId: { readonly sessionId: string }["sessionId"]
  readonly before?: { readonly before?: string | undefined; readonly limit?: string | undefined }["before"]
  readonly limit?: { readonly before?: string | undefined; readonly limit?: string | undefined }["limit"]
}

export type AiSessionMessagesOutput = {
  sessionId: string
  messages: Array<{
    id: string
    role: "user" | "assistant"
    text: string
    createdAt: string | null
    agent: string | null
    model: string | null
    error: string | null
    truncated: boolean
    tools: Array<{
      callId: string
      tool: string
      status: "pending" | "running" | "completed" | "error"
      input?: unknown | undefined
      output: string
      truncated: boolean
    }>
  }>
  before: string | null
}

export type AiChatQueueInput = {
  readonly sessionId: AiChatQueuePayload["sessionId"]
  readonly message: AiChatQueuePayload["message"]
  readonly projectId?: AiChatQueuePayload["projectId"]
  readonly delivery?: AiChatQueuePayload["delivery"]
}

export type AiChatQueueOutput = { message: string }

export type AiChatAbortInput = {
  readonly sessionId?: AiChatAbortPayload["sessionId"]
  readonly projectId?: AiChatAbortPayload["projectId"]
}

export type AiChatAbortOutput = { message: string }

export type AiPermissionReplyInput = {
  readonly sessionId: AiPermissionReplyPayload["sessionId"]
  readonly projectId?: AiPermissionReplyPayload["projectId"]
  readonly requestId: AiPermissionReplyPayload["requestId"]
  readonly decision: AiPermissionReplyPayload["decision"]
}

export type AiPermissionReplyOutput = { message: string }

export type AiCompletionInput = {
  readonly prompt?: AiCompletionPayload["prompt"]
  readonly systemPrompt?: AiCompletionPayload["systemPrompt"]
  readonly model?: AiCompletionPayload["model"]
  readonly temperature?: AiCompletionPayload["temperature"]
}

export type AiCompletionOutput = { text: string; model: string }

export type AiAnalyzeGcodeInput = {
  readonly gcode?: AiAnalyzeGcodePayload["gcode"]
  readonly model?: AiAnalyzeGcodePayload["model"]
}

export type AiAnalyzeGcodeOutput = {
  issues: Array<{ severity: "error" | "warning" | "info"; code: string; line: number; message: string }>
  stats: {
    lines: number
    rapidMoves: number
    cutMoves: number
    toolChanges: number
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null
  }
}

export type AiGcodeInput = {
  readonly action?: AiGcodePayload["action"]
  readonly gcode?: AiGcodePayload["gcode"]
  readonly partialCode?: AiGcodePayload["partialCode"]
  readonly machineType?: AiGcodePayload["machineType"]
  readonly material?: AiGcodePayload["material"]
  readonly model?: AiGcodePayload["model"]
  readonly options?: AiGcodePayload["options"]
  readonly description?: AiGcodePayload["description"]
  readonly toolpathType?: AiGcodePayload["toolpathType"]
}

export type AiGcodeOutput = { success: true; action: string; data: unknown; processedAt: string }

export type AiToolpathAnalysisInput = {
  readonly gcode?: AiToolpathAnalysisPayload["gcode"]
  readonly model?: AiToolpathAnalysisPayload["model"]
  readonly max_tokens?: AiToolpathAnalysisPayload["max_tokens"]
}

export type AiToolpathAnalysisOutput = { insights: string }

export type AiFeedbackInput = {
  readonly messageId?: AiFeedbackPayload["messageId"]
  readonly rating?: AiFeedbackPayload["rating"]
  readonly comment?: AiFeedbackPayload["comment"]
}

export type AiFeedbackOutput = { success: true; message: string }

export type AiProxyInput = {
  readonly model?: AiProxyPayload["model"]
  readonly messages?: AiProxyPayload["messages"]
  readonly max_tokens?: AiProxyPayload["max_tokens"]
  readonly temperature?: AiProxyPayload["temperature"]
  readonly system?: AiProxyPayload["system"]
  readonly reasoning?: AiProxyPayload["reasoning"]
}

export type AiProxyOutput = {
  id: string
  type: "message"
  role: "assistant"
  model: string
  content: Array<{ type: "text"; text: string }>
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}

export type AiOauthAuthorizeInput = { readonly provider: AiOauthAuthorizePayload["provider"] }

export type AiOauthAuthorizeOutput = {
  attemptId: string
  url: string
  instructions: string
  method: "auto" | "code" | "auto-code"
}

export type AiOauthCompleteInput = {
  readonly provider: AiOauthCompletePayload["provider"]
  readonly attemptId: AiOauthCompletePayload["attemptId"]
  readonly code?: AiOauthCompletePayload["code"]
}

export type AiOauthCompleteOutput = {
  providers: { [x: string]: "configured" | "missing" }
  configured: boolean
  tools?: Array<{ id: string; description: string }> | undefined
  host: "nikcli" | "direct"
}

export type McpListConfigInput = { readonly source?: { readonly source?: string | undefined }["source"] }

export type McpListConfigOutput =
  | {
      success: true
      source: "claude" | "database"
      servers: Array<{
        id: string
        name: string
        type: string
        url: string | null
        command: string | null
        args: unknown
        workingDirectory: string | null
        enabled: boolean
        userId: string | null
        createdAt: string
        updatedAt: string
      }>
      count: number
    }
  | {
      success: true
      source: "file"
      config: {
        mcpServers: Array<{
          id: string
          name: string
          type: string
          url: string | null
          command: string | null
          args: unknown
          workingDirectory: string | null
          enabled: boolean
        }>
      }
      exportedAt: string
    }

export type McpUpdateConfigInput = {
  readonly source?: { readonly source?: string | undefined }["source"]
  readonly id?: McpUpdateConfigPayload["id"]
  readonly name?: McpUpdateConfigPayload["name"]
  readonly type?: McpUpdateConfigPayload["type"]
  readonly url?: McpUpdateConfigPayload["url"]
  readonly command?: McpUpdateConfigPayload["command"]
  readonly args?: McpUpdateConfigPayload["args"]
  readonly workingDirectory?: McpUpdateConfigPayload["workingDirectory"]
  readonly defaultWorkingDirectory?: McpUpdateConfigPayload["defaultWorkingDirectory"]
  readonly enabled?: McpUpdateConfigPayload["enabled"]
  readonly serverName?: McpUpdateConfigPayload["serverName"]
  readonly testConnection?: McpUpdateConfigPayload["testConnection"]
  readonly mcpServers?: McpUpdateConfigPayload["mcpServers"]
  readonly tool_configuration?: McpUpdateConfigPayload["tool_configuration"]
  readonly authorization_token?: McpUpdateConfigPayload["authorization_token"]
}

export type McpUpdateConfigOutput = {
  success: true
  source: "claude"
  server: {
    id: string
    name: string
    type: string
    url: string | null
    command: string | null
    args: unknown
    workingDirectory: string | null
    enabled: boolean
    userId: string | null
    createdAt: string
    updatedAt: string
  }
  message: string
}

export type McpRemoveConfigInput = {
  readonly source?: { readonly source?: string | undefined; readonly name?: string | undefined }["source"]
  readonly name?: { readonly source?: string | undefined; readonly name?: string | undefined }["name"]
}

export type McpRemoveConfigOutput = { success: true; source: "claude"; message: string; note: string }

export type McpGetConfigInput = { readonly id: { readonly id: string }["id"] }

export type McpGetConfigOutput = {
  id: string
  name: string
  type: string
  url: string | null
  command: string | null
  args: unknown
  workingDirectory: string | null
  enabled: boolean
  userId: string | null
  createdAt: string
  updatedAt: string
}

export type McpRemoveConfigByIdInput = { readonly id: { readonly id: string }["id"] }

export type McpRemoveConfigByIdOutput = void

export type McpServerInfoInput = { readonly serverId?: McpServerInfoPayload["serverId"] }

export type McpServerInfoOutput = {
  name: string
  version?: string | undefined
  instructions?: string | undefined
  resources?:
    | Array<{
        name: string
        uriTemplate?: string | undefined
        description?: string | undefined
        arguments?:
          | Array<{ name: string; description?: string | undefined; required?: boolean | undefined }>
          | undefined
      }>
    | undefined
  tools?: Array<{ name: string; description?: string | undefined; parameters?: unknown | undefined }> | undefined
}

export type BillingInfoInput = { readonly userId?: { readonly userId?: string | undefined }["userId"] }

export type BillingInfoOutput = {
  id: string
  plan: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

export type BillingCurrentOutput = {
  plan: string
  status: string
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  isOnTrial?: boolean | undefined
  trialEnd?: string | undefined
}

export type BillingSubscribeInput = {
  readonly priceId?: BillingSubscribePayload["priceId"]
  readonly startTrial?: BillingSubscribePayload["startTrial"]
}

export type BillingSubscribeOutput = {
  url?: string | undefined
  success?: boolean | undefined
  message?: string | undefined
  redirectUrl?: string | undefined
}

export type BillingPortalInput = { readonly returnUrl?: BillingPortalPayload["returnUrl"] }

export type BillingPortalOutput = { url: string }

export type BillingBaGetOutput = {
  id?: string | undefined
  plan: string
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId?: string | null | undefined
  stripeSubscriptionId?: string | null | undefined
  source: "better-auth"
}

export type BillingBaCheckoutInput = {
  readonly plan?: BillingBaCheckoutPayload["plan"]
  readonly successUrl?: BillingBaCheckoutPayload["successUrl"]
  readonly cancelUrl?: BillingBaCheckoutPayload["cancelUrl"]
  readonly trialDays?: BillingBaCheckoutPayload["trialDays"]
}

export type BillingBaCheckoutOutput = { url: string; source: "better-auth" }

export type BillingBaUpdateInput = { readonly newPlan?: BillingBaUpdatePayload["newPlan"] }

export type BillingBaUpdateOutput = { success: true; message: string; source: "better-auth" }

export type BillingBaCancelOutput = { success: true; message: string; source: "better-auth" }

export type BillingBaPortalInput = { readonly returnUrl?: BillingBaPortalPayload["returnUrl"] }

export type BillingBaPortalOutput = { url: string; source: "better-auth" }

export type BillingBaFeatureInput = {
  readonly feature?: BillingBaFeaturePayload["feature"]
  readonly features?: BillingBaFeaturePayload["features"]
}

export type BillingBaFeatureOutput = {
  feature?: string | undefined
  hasAccess?: boolean | undefined
  source: "better-auth"
  features?: Array<{ feature: string; hasAccess: boolean; error?: string | undefined }> | undefined
}

export type BillingBaSyncOutput = {
  success: true
  message: string
  subscription: {
    id?: string | undefined
    plan: string
    status: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    stripeCustomerId?: string | null | undefined
    stripeSubscriptionId?: string | null | undefined
    source: "better-auth"
  } | null
  source: "better-auth"
}

export type BillingCronGetInput = { readonly secret?: { readonly secret?: string | undefined }["secret"] }

export type BillingCronGetOutput = { success: true; updatedCount: number; message: string; timestamp: string }

export type BillingCronPostInput = { readonly secret?: { readonly secret?: string | undefined }["secret"] }

export type BillingCronPostOutput = { success: true; updatedCount: number; message: string; timestamp: string }

export type BillingStripeHealthOutput = { status: "healthy"; message: string; timestamp: string; service: "stripe" }

export type MiscPushSubscribeInput = {
  readonly endpoint?: MiscPushSubscribePayload["endpoint"]
  readonly keys?: MiscPushSubscribePayload["keys"]
}

export type MiscPushSubscribeOutput = { success: true; id: string }

export type MiscPushUnsubscribeInput = { readonly endpoint?: MiscPushUnsubscribePayload["endpoint"] }

export type MiscPushUnsubscribeOutput = { success: true }

export type MiscNotifyInput = {
  readonly userId?: MiscNotifyPayload["userId"]
  readonly message?: MiscNotifyPayload["message"]
}

export type MiscNotifyOutput = { success: true; message: string }

export type MiscDesktopSigninInput = {
  readonly email?: MiscDesktopSigninPayload["email"]
  readonly password?: MiscDesktopSigninPayload["password"]
  readonly deviceId?: MiscDesktopSigninPayload["deviceId"]
  readonly platform?: MiscDesktopSigninPayload["platform"]
}

export type MiscDesktopSigninOutput = {
  success: true
  token: string
  user: { id: string; name: string | null; email: string | null; image: string | null }
  syncData: { lastSync: string; version: string }
}

export type MiscDesktopProjectsOutput = {
  success: true
  data: Array<{
    id: string
    name: string
    description: string | null
    owner_id: string
    organization_id: string | null
    is_public: boolean
    created_at: string
    updated_at: string
  }>
  message: string
}

export type MiscDesktopCreateProjectInput = {
  readonly name?: MiscDesktopCreateProjectPayload["name"]
  readonly description?: MiscDesktopCreateProjectPayload["description"]
  readonly organization_id?: MiscDesktopCreateProjectPayload["organization_id"]
  readonly is_public?: MiscDesktopCreateProjectPayload["is_public"]
}

export type MiscDesktopCreateProjectOutput = {
  success: true
  data: {
    id: string
    name: string
    description: string | null
    owner_id: string
    organization_id: string | null
    is_public: boolean
    created_at: string
    updated_at: string
  }
  message: string
}

export type MiscDesktopUserByEmailInput = { readonly email?: { readonly email?: string | undefined }["email"] }

export type MiscDesktopUserByEmailOutput = {
  success: true
  data: {
    id: string
    name: string | null
    email: string | null
    image: string | null
    created_at: string
    updated_at: string
  }
  message: string
}

export type MiscTrackedGetInput = { readonly id: { readonly id: string }["id"] }

export type MiscTrackedGetOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  ownerId: string
  organizationId: string | null
  isPublic: boolean
  owner: { id: string; name: string | null; email: string | null }
  organization: { id: string; name: string } | null
  _count: { drawings: number; components: number }
}

export type MiscTrackedUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: MiscTrackedUpdatePayload["name"]
  readonly description?: MiscTrackedUpdatePayload["description"]
  readonly organizationId?: MiscTrackedUpdatePayload["organizationId"]
}

export type MiscTrackedUpdateOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  ownerId: string
  organizationId: string | null
  isPublic: boolean
  owner: { id: string; name: string | null; email: string | null }
  organization: { id: string; name: string } | null
  _count: { drawings: number; components: number }
}

export type MiscTrackedRemoveInput = { readonly id: { readonly id: string }["id"] }

export type MiscTrackedRemoveOutput = { message: string }

export type KvListInput = { readonly prefix?: { readonly prefix?: string | undefined }["prefix"] }

export type KvListOutput = { entries: Array<{ key: string; value: unknown; updatedAt: string }> }

export type KvGetInput = { readonly key: { readonly key: string }["key"] }

export type KvGetOutput = { key: string; value: unknown; updatedAt: string }

export type KvSetInput = { readonly key: { readonly key: string }["key"]; readonly value: KvSetPayload["value"] }

export type KvSetOutput = { key: string; value: unknown; updatedAt: string }

export type KvRemoveInput = { readonly key: { readonly key: string }["key"] }

export type KvRemoveOutput = { message: string }

export type ProductionCostsListEstimatesInput = {
  readonly toolpathId?: {
    readonly toolpathId?: string | undefined
    readonly projectId?: string | undefined
    readonly organizationId?: null | string | undefined
  }["toolpathId"]
  readonly projectId?: {
    readonly toolpathId?: string | undefined
    readonly projectId?: string | undefined
    readonly organizationId?: null | string | undefined
  }["projectId"]
  readonly organizationId?: {
    readonly toolpathId?: string | undefined
    readonly projectId?: string | undefined
    readonly organizationId?: null | string | undefined
  }["organizationId"]
}

export type ProductionCostsListEstimatesOutput = Array<{
  id: string
  createdAt: string
  updatedAt: string
  materialCost: number
  toolWearCost: number
  machineTime: number
  machineTimeCost: number
  operatorTime: number
  operatorTimeCost: number
  setupCost: number
  totalCost: number
  currencyCode: string
  ownerId: string | null
  organizationId: string | null
  toolpathId: string
  details: unknown
  operationCostId: string | null
  costSettingsId?: string | null | undefined
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
  toolpath: { id: string; name: string; projectId?: string | null | undefined }
  operationCost: {
    id: string
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
    currencyCode: string
    name: string
    machineHourlyRate: number
    operatorHourlyRate: number
    setupTime: number
  } | null
}>

export type ProductionCostsCreateEstimateInput = {
  readonly toolpathId: ProductionCostsCreateEstimatePayload["toolpathId"]
  readonly totalCost: ProductionCostsCreateEstimatePayload["totalCost"]
  readonly materialCost?: ProductionCostsCreateEstimatePayload["materialCost"]
  readonly toolWearCost?: ProductionCostsCreateEstimatePayload["toolWearCost"]
  readonly machineTime?: ProductionCostsCreateEstimatePayload["machineTime"]
  readonly machineTimeCost?: ProductionCostsCreateEstimatePayload["machineTimeCost"]
  readonly operatorTime?: ProductionCostsCreateEstimatePayload["operatorTime"]
  readonly operatorTimeCost?: ProductionCostsCreateEstimatePayload["operatorTimeCost"]
  readonly setupCost?: ProductionCostsCreateEstimatePayload["setupCost"]
  readonly currencyCode?: ProductionCostsCreateEstimatePayload["currencyCode"]
  readonly details?: ProductionCostsCreateEstimatePayload["details"]
  readonly operationCostId?: ProductionCostsCreateEstimatePayload["operationCostId"]
  readonly costSettingsId?: ProductionCostsCreateEstimatePayload["costSettingsId"]
  readonly organizationId?: ProductionCostsCreateEstimatePayload["organizationId"]
}

export type ProductionCostsCreateEstimateOutput = {
  id: string
  createdAt: string
  updatedAt: string
  materialCost: number
  toolWearCost: number
  machineTime: number
  machineTimeCost: number
  operatorTime: number
  operatorTimeCost: number
  setupCost: number
  totalCost: number
  currencyCode: string
  ownerId: string | null
  organizationId: string | null
  toolpathId: string
  details: unknown
  operationCostId: string | null
  costSettingsId?: string | null | undefined
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
  toolpath: { id: string; name: string; projectId?: string | null | undefined }
  operationCost: {
    id: string
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
    currencyCode: string
    name: string
    machineHourlyRate: number
    operatorHourlyRate: number
    setupTime: number
  } | null
}

export type ProductionCostsGetEstimateInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsGetEstimateOutput = {
  id: string
  createdAt: string
  updatedAt: string
  materialCost: number
  toolWearCost: number
  machineTime: number
  machineTimeCost: number
  operatorTime: number
  operatorTimeCost: number
  setupCost: number
  totalCost: number
  currencyCode: string
  ownerId: string | null
  organizationId: string | null
  toolpathId: string
  details: unknown
  operationCostId: string | null
  costSettingsId?: string | null | undefined
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
  toolpath: { id: string; name: string; projectId?: string | null | undefined }
  operationCost: {
    id: string
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
    currencyCode: string
    name: string
    machineHourlyRate: number
    operatorHourlyRate: number
    setupTime: number
  } | null
}

export type ProductionCostsUpdateEstimateInput = {
  readonly id: { readonly id: string }["id"]
  readonly currencyCode?: ProductionCostsUpdateEstimatePayload["currencyCode"]
  readonly details?: ProductionCostsUpdateEstimatePayload["details"]
  readonly notes?: ProductionCostsUpdateEstimatePayload["notes"]
}

export type ProductionCostsUpdateEstimateOutput = {
  id: string
  createdAt: string
  updatedAt: string
  materialCost: number
  toolWearCost: number
  machineTime: number
  machineTimeCost: number
  operatorTime: number
  operatorTimeCost: number
  setupCost: number
  totalCost: number
  currencyCode: string
  ownerId: string | null
  organizationId: string | null
  toolpathId: string
  details: unknown
  operationCostId: string | null
  costSettingsId?: string | null | undefined
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
  toolpath: { id: string; name: string; projectId?: string | null | undefined }
}

export type ProductionCostsDeleteEstimateInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsDeleteEstimateOutput = { message: string }

export type ProductionCostsCalculateEstimateInput = {
  readonly toolpathId: ProductionCostsCalculateEstimatePayload["toolpathId"]
  readonly costSettingsId?: ProductionCostsCalculateEstimatePayload["costSettingsId"]
  readonly organizationId?: ProductionCostsCalculateEstimatePayload["organizationId"]
}

export type ProductionCostsCalculateEstimateOutput = {
  materialCost: number
  toolWearCost: number
  machineTime: number
  machineTimeCost: number
  operatorTime: number
  operatorTimeCost: number
  setupCost: number
  totalCost: number
  currencyCode: string
  ownerId: string | null
  organizationId: string | null
  toolpathId: string
  details: {
    sourceSettingsId?: string | undefined
    inputs: { toolpathId: string; toolId: string | null; materialId: string | null }
    calculatedValues: {
      totalPathLengthMm: number
      materialVolumeM3: number
      feedRateMmMin: number
      machineTimeMinutes: number
      operatorTimeMinutes: number
      totalSetupTimeMinutes: number
    }
    costBreakdown: { material: number; toolWear: number; machineRun: number; operator: number; setup: number }
  }
}

export type ProductionCostsListMaterialCostsInput = {
  readonly materialId?: {
    readonly materialId?: string | undefined
    readonly organizationId?: null | string | undefined
  }["materialId"]
  readonly organizationId?: {
    readonly materialId?: string | undefined
    readonly organizationId?: null | string | undefined
  }["organizationId"]
}

export type ProductionCostsListMaterialCostsOutput = Array<{
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  materialId: string
  costPerUnit: number
  wasteFactor: number
  minimumCharge: number
  material: {
    id: string
    name: string
    description: string | null
    properties: unknown
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
}>

export type ProductionCostsCreateMaterialCostInput = {
  readonly costPerUnit: ProductionCostsCreateMaterialCostPayload["costPerUnit"]
  readonly wasteFactor?: ProductionCostsCreateMaterialCostPayload["wasteFactor"]
  readonly minimumCharge?: ProductionCostsCreateMaterialCostPayload["minimumCharge"]
  readonly currencyCode?: ProductionCostsCreateMaterialCostPayload["currencyCode"]
  readonly materialId: ProductionCostsCreateMaterialCostPayload["materialId"]
  readonly organizationId?: ProductionCostsCreateMaterialCostPayload["organizationId"]
}

export type ProductionCostsCreateMaterialCostOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  materialId: string
  costPerUnit: number
  wasteFactor: number
  minimumCharge: number
  material: {
    id: string
    name: string
    description: string | null
    properties: unknown
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
}

export type ProductionCostsGetMaterialCostInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsGetMaterialCostOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  materialId: string
  costPerUnit: number
  wasteFactor: number
  minimumCharge: number
  material: {
    id: string
    name: string
    description: string | null
    properties: unknown
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
} | null

export type ProductionCostsUpdateMaterialCostInput = {
  readonly id: { readonly id: string }["id"]
  readonly costPerUnit?: ProductionCostsUpdateMaterialCostPayload["costPerUnit"]
  readonly wasteFactor?: ProductionCostsUpdateMaterialCostPayload["wasteFactor"]
  readonly minimumCharge?: ProductionCostsUpdateMaterialCostPayload["minimumCharge"]
  readonly currencyCode?: ProductionCostsUpdateMaterialCostPayload["currencyCode"]
}

export type ProductionCostsUpdateMaterialCostOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  materialId: string
  costPerUnit: number
  wasteFactor: number
  minimumCharge: number
  material: {
    id: string
    name: string
    description: string | null
    properties: unknown
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
}

export type ProductionCostsDeleteMaterialCostInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsDeleteMaterialCostOutput = { message: string }

export type ProductionCostsListOperationCostsInput = {
  readonly organizationId?: { readonly organizationId?: null | string | undefined }["organizationId"]
}

export type ProductionCostsListOperationCostsOutput = Array<{
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  name: string
  machineHourlyRate: number
  operatorHourlyRate: number
  setupTime: number
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
}>

export type ProductionCostsCreateOperationCostInput = {
  readonly name: ProductionCostsCreateOperationCostPayload["name"]
  readonly machineHourlyRate: ProductionCostsCreateOperationCostPayload["machineHourlyRate"]
  readonly operatorHourlyRate: ProductionCostsCreateOperationCostPayload["operatorHourlyRate"]
  readonly setupTime?: ProductionCostsCreateOperationCostPayload["setupTime"]
  readonly currencyCode?: ProductionCostsCreateOperationCostPayload["currencyCode"]
  readonly organizationId?: ProductionCostsCreateOperationCostPayload["organizationId"]
}

export type ProductionCostsCreateOperationCostOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  name: string
  machineHourlyRate: number
  operatorHourlyRate: number
  setupTime: number
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
}

export type ProductionCostsGetOperationCostInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsGetOperationCostOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  name: string
  machineHourlyRate: number
  operatorHourlyRate: number
  setupTime: number
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
} | null

export type ProductionCostsUpdateOperationCostInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: ProductionCostsUpdateOperationCostPayload["name"]
  readonly machineHourlyRate?: ProductionCostsUpdateOperationCostPayload["machineHourlyRate"]
  readonly operatorHourlyRate?: ProductionCostsUpdateOperationCostPayload["operatorHourlyRate"]
  readonly setupTime?: ProductionCostsUpdateOperationCostPayload["setupTime"]
  readonly currencyCode?: ProductionCostsUpdateOperationCostPayload["currencyCode"]
}

export type ProductionCostsUpdateOperationCostOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  name: string
  machineHourlyRate: number
  operatorHourlyRate: number
  setupTime: number
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
}

export type ProductionCostsDeleteOperationCostInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsDeleteOperationCostOutput = { message: string }

export type ProductionCostsListToolWearInput = {
  readonly toolId?: {
    readonly toolId?: string | undefined
    readonly organizationId?: null | string | undefined
  }["toolId"]
  readonly organizationId?: {
    readonly toolId?: string | undefined
    readonly organizationId?: null | string | undefined
  }["organizationId"]
}

export type ProductionCostsListToolWearOutput = Array<{
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  toolId: string
  wearRatePerMeter: number
  replacementCost: number
  replacementThreshold: number
  tool: {
    id: string
    name: string
    type: string
    diameter: number
    material: string
    numberOfFlutes: number | null
    maxRPM: number | null
    coolantType: string | null
    cuttingLength: number | null
    totalLength: number | null
    shankDiameter: number | null
    cornerRadius?: number | null
    tipAngle?: number | null
    threadPitch?: number | null
    holderDiameter?: number | null
    holderLength?: number | null
    stickout?: number | null
    notes: string | null
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
}>

export type ProductionCostsCreateToolWearInput = {
  readonly wearRatePerMeter: ProductionCostsCreateToolWearPayload["wearRatePerMeter"]
  readonly replacementCost: ProductionCostsCreateToolWearPayload["replacementCost"]
  readonly replacementThreshold?: ProductionCostsCreateToolWearPayload["replacementThreshold"]
  readonly currencyCode?: ProductionCostsCreateToolWearPayload["currencyCode"]
  readonly toolId: ProductionCostsCreateToolWearPayload["toolId"]
  readonly organizationId?: ProductionCostsCreateToolWearPayload["organizationId"]
}

export type ProductionCostsCreateToolWearOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  toolId: string
  wearRatePerMeter: number
  replacementCost: number
  replacementThreshold: number
  tool: {
    id: string
    name: string
    type: string
    diameter: number
    material: string
    numberOfFlutes: number | null
    maxRPM: number | null
    coolantType: string | null
    cuttingLength: number | null
    totalLength: number | null
    shankDiameter: number | null
    cornerRadius?: number | null
    tipAngle?: number | null
    threadPitch?: number | null
    holderDiameter?: number | null
    holderLength?: number | null
    stickout?: number | null
    notes: string | null
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
}

export type ProductionCostsGetToolWearInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsGetToolWearOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  toolId: string
  wearRatePerMeter: number
  replacementCost: number
  replacementThreshold: number
  tool: {
    id: string
    name: string
    type: string
    diameter: number
    material: string
    numberOfFlutes: number | null
    maxRPM: number | null
    coolantType: string | null
    cuttingLength: number | null
    totalLength: number | null
    shankDiameter: number | null
    cornerRadius?: number | null
    tipAngle?: number | null
    threadPitch?: number | null
    holderDiameter?: number | null
    holderLength?: number | null
    stickout?: number | null
    notes: string | null
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
  owner: { id: string; name: string | null; email?: string | null | undefined } | null
  organization: { id: string; name: string | null } | null
} | null

export type ProductionCostsUpdateToolWearInput = {
  readonly id: { readonly id: string }["id"]
  readonly wearRatePerMeter?: ProductionCostsUpdateToolWearPayload["wearRatePerMeter"]
  readonly replacementCost?: ProductionCostsUpdateToolWearPayload["replacementCost"]
  readonly replacementThreshold?: ProductionCostsUpdateToolWearPayload["replacementThreshold"]
  readonly currencyCode?: ProductionCostsUpdateToolWearPayload["currencyCode"]
}

export type ProductionCostsUpdateToolWearOutput = {
  id: string
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  currencyCode: string
  toolId: string
  wearRatePerMeter: number
  replacementCost: number
  replacementThreshold: number
  tool: {
    id: string
    name: string
    type: string
    diameter: number
    material: string
    numberOfFlutes: number | null
    maxRPM: number | null
    coolantType: string | null
    cuttingLength: number | null
    totalLength: number | null
    shankDiameter: number | null
    cornerRadius?: number | null
    tipAngle?: number | null
    threadPitch?: number | null
    holderDiameter?: number | null
    holderLength?: number | null
    stickout?: number | null
    notes: string | null
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
  }
}

export type ProductionCostsDeleteToolWearInput = { readonly id: { readonly id: string }["id"] }

export type ProductionCostsDeleteToolWearOutput = { message: string }

export type PluginsListOutput = Array<{
  id: string
  manifest: {
    id: string
    name: string
    version: string
    description: string
    author: string
    repository?: string | undefined
    license?: string | undefined
    icon?: string | undefined
    main: string
    engines: { cadcam: string }
    permissions: Array<
      | "model:read"
      | "model:write"
      | "model:selection"
      | "ui:sidebar"
      | "ui:toolbar"
      | "ui:contextMenu"
      | "ui:propertyPanel"
      | "ui:modal"
      | "ui:overlay"
      | "storage:local"
      | "storage:sync"
      | "file:read"
      | "file:write"
      | "file:downloads"
      | "network:origin"
      | "network:external"
      | "system:clipboard"
      | "system:notifications"
      | "ui:fullscreen"
      | "device:camera"
      | "device:microphone"
    >
    dependencies?: { [x: string]: string } | undefined
    contributes?:
      | {
          sidebar?: { title: string; icon: string; entry: string } | undefined
          commands?:
            | Array<{ id: string; title: string; icon?: string | undefined; keybinding?: string | undefined }>
            | undefined
          menus?:
            | {
                toolbar?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
                contextMenu?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
              }
            | undefined
          propertyPanel?:
            | Array<{ id: string; title: string; entry: string; appliesTo?: string | undefined }>
            | undefined
          themes?: Array<{ id: string; label: string; path: string }> | undefined
        }
      | undefined
    configuration?:
      | {
          properties: {
            [x: string]: {
              type: string
              default?: unknown | undefined
              description?: string | undefined
              enum?: Array<unknown> | undefined
              minimum?: number | undefined
              maximum?: number | undefined
              pattern?: string | undefined
            }
          }
        }
      | undefined
  }
  state: "none" | "installed" | "enabled" | "disabled" | "loaded" | "activated" | "deactivated" | "error"
  enabled: boolean
  version: string
  installedAt: string
  updatedAt: string
  config?: { [x: string]: any } | undefined
  configurationId?: string | undefined
  errorCount: number
  lastError?: string | undefined
}>

export type PluginsGetInput = { readonly id: { readonly id: string }["id"] }

export type PluginsGetOutput = {
  id: string
  manifest: {
    id: string
    name: string
    version: string
    description: string
    author: string
    repository?: string | undefined
    license?: string | undefined
    icon?: string | undefined
    main: string
    engines: { cadcam: string }
    permissions: Array<
      | "model:read"
      | "model:write"
      | "model:selection"
      | "ui:sidebar"
      | "ui:toolbar"
      | "ui:contextMenu"
      | "ui:propertyPanel"
      | "ui:modal"
      | "ui:overlay"
      | "storage:local"
      | "storage:sync"
      | "file:read"
      | "file:write"
      | "file:downloads"
      | "network:origin"
      | "network:external"
      | "system:clipboard"
      | "system:notifications"
      | "ui:fullscreen"
      | "device:camera"
      | "device:microphone"
    >
    dependencies?: { [x: string]: string } | undefined
    contributes?:
      | {
          sidebar?: { title: string; icon: string; entry: string } | undefined
          commands?:
            | Array<{ id: string; title: string; icon?: string | undefined; keybinding?: string | undefined }>
            | undefined
          menus?:
            | {
                toolbar?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
                contextMenu?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
              }
            | undefined
          propertyPanel?:
            | Array<{ id: string; title: string; entry: string; appliesTo?: string | undefined }>
            | undefined
          themes?: Array<{ id: string; label: string; path: string }> | undefined
        }
      | undefined
    configuration?:
      | {
          properties: {
            [x: string]: {
              type: string
              default?: unknown | undefined
              description?: string | undefined
              enum?: Array<unknown> | undefined
              minimum?: number | undefined
              maximum?: number | undefined
              pattern?: string | undefined
            }
          }
        }
      | undefined
  }
  state: "none" | "installed" | "enabled" | "disabled" | "loaded" | "activated" | "deactivated" | "error"
  enabled: boolean
  version: string
  installedAt: string
  updatedAt: string
  config?: { [x: string]: any } | undefined
  configurationId?: string | undefined
  errorCount: number
  lastError?: string | undefined
}

export type PluginsUninstallInput = { readonly id: { readonly id: string }["id"] }

export type PluginsUninstallOutput = { message: string }

export type PluginsGetConfigInput = { readonly id: { readonly id: string }["id"] }

export type PluginsGetConfigOutput = { [x: string]: any }

export type PluginsSetConfigInput = {
  readonly id: { readonly id: string }["id"]
  readonly payload: { readonly [x: string]: any }
}

export type PluginsSetConfigOutput = { message: string }

export type PluginsUpdateConfigInput = {
  readonly id: { readonly id: string }["id"]
  readonly payload: { readonly [x: string]: any }
}

export type PluginsUpdateConfigOutput = { message: string }

export type PluginsEnableInput = { readonly id: { readonly id: string }["id"] }

export type PluginsEnableOutput = { message: string }

export type PluginsDisableInput = { readonly id: { readonly id: string }["id"] }

export type PluginsDisableOutput = { message: string }

export type PluginsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly manifest?: PluginsUpdatePayload["manifest"]
  readonly config?: PluginsUpdatePayload["config"]
}

export type PluginsUpdateOutput = {
  id: string
  manifest: {
    id: string
    name: string
    version: string
    description: string
    author: string
    repository?: string | undefined
    license?: string | undefined
    icon?: string | undefined
    main: string
    engines: { cadcam: string }
    permissions: Array<
      | "model:read"
      | "model:write"
      | "model:selection"
      | "ui:sidebar"
      | "ui:toolbar"
      | "ui:contextMenu"
      | "ui:propertyPanel"
      | "ui:modal"
      | "ui:overlay"
      | "storage:local"
      | "storage:sync"
      | "file:read"
      | "file:write"
      | "file:downloads"
      | "network:origin"
      | "network:external"
      | "system:clipboard"
      | "system:notifications"
      | "ui:fullscreen"
      | "device:camera"
      | "device:microphone"
    >
    dependencies?: { [x: string]: string } | undefined
    contributes?:
      | {
          sidebar?: { title: string; icon: string; entry: string } | undefined
          commands?:
            | Array<{ id: string; title: string; icon?: string | undefined; keybinding?: string | undefined }>
            | undefined
          menus?:
            | {
                toolbar?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
                contextMenu?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
              }
            | undefined
          propertyPanel?:
            | Array<{ id: string; title: string; entry: string; appliesTo?: string | undefined }>
            | undefined
          themes?: Array<{ id: string; label: string; path: string }> | undefined
        }
      | undefined
    configuration?:
      | {
          properties: {
            [x: string]: {
              type: string
              default?: unknown | undefined
              description?: string | undefined
              enum?: Array<unknown> | undefined
              minimum?: number | undefined
              maximum?: number | undefined
              pattern?: string | undefined
            }
          }
        }
      | undefined
  }
  state: "none" | "installed" | "enabled" | "disabled" | "loaded" | "activated" | "deactivated" | "error"
  enabled: boolean
  version: string
  installedAt: string
  updatedAt: string
  config?: { [x: string]: any } | undefined
  configurationId?: string | undefined
  errorCount: number
  lastError?: string | undefined
}

export type PluginsPatchInput = {
  readonly id: { readonly id: string }["id"]
  readonly manifest?: PluginsPatchPayload["manifest"]
  readonly config?: PluginsPatchPayload["config"]
}

export type PluginsPatchOutput = {
  id: string
  manifest: {
    id: string
    name: string
    version: string
    description: string
    author: string
    repository?: string | undefined
    license?: string | undefined
    icon?: string | undefined
    main: string
    engines: { cadcam: string }
    permissions: Array<
      | "model:read"
      | "model:write"
      | "model:selection"
      | "ui:sidebar"
      | "ui:toolbar"
      | "ui:contextMenu"
      | "ui:propertyPanel"
      | "ui:modal"
      | "ui:overlay"
      | "storage:local"
      | "storage:sync"
      | "file:read"
      | "file:write"
      | "file:downloads"
      | "network:origin"
      | "network:external"
      | "system:clipboard"
      | "system:notifications"
      | "ui:fullscreen"
      | "device:camera"
      | "device:microphone"
    >
    dependencies?: { [x: string]: string } | undefined
    contributes?:
      | {
          sidebar?: { title: string; icon: string; entry: string } | undefined
          commands?:
            | Array<{ id: string; title: string; icon?: string | undefined; keybinding?: string | undefined }>
            | undefined
          menus?:
            | {
                toolbar?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
                contextMenu?:
                  | Array<{
                      command: string
                      group?: string | undefined
                      when?: string | undefined
                      priority?: number | undefined
                    }>
                  | undefined
              }
            | undefined
          propertyPanel?:
            | Array<{ id: string; title: string; entry: string; appliesTo?: string | undefined }>
            | undefined
          themes?: Array<{ id: string; label: string; path: string }> | undefined
        }
      | undefined
    configuration?:
      | {
          properties: {
            [x: string]: {
              type: string
              default?: unknown | undefined
              description?: string | undefined
              enum?: Array<unknown> | undefined
              minimum?: number | undefined
              maximum?: number | undefined
              pattern?: string | undefined
            }
          }
        }
      | undefined
  }
  state: "none" | "installed" | "enabled" | "disabled" | "loaded" | "activated" | "deactivated" | "error"
  enabled: boolean
  version: string
  installedAt: string
  updatedAt: string
  config?: { [x: string]: any } | undefined
  configurationId?: string | undefined
  errorCount: number
  lastError?: string | undefined
}

export type PluginsRegistryOutput = Array<{
  id: string
  name: string
  version: string
  description: string
  author: string
  entryPoint: string
  homepage?: string | undefined
  repository?: string | undefined
  dependencies: { [x: string]: string }
  permissions: Array<string>
  extensionPoints: Array<string>
  minAppVersion: string
  maxAppVersion?: string | undefined
}>

export type PluginsRegistryGetInput = { readonly id: { readonly id: string }["id"] }

export type PluginsRegistryGetOutput = {
  id: string
  name: string
  version: string
  description: string
  author: string
  entryPoint: string
  homepage?: string | undefined
  repository?: string | undefined
  dependencies: { [x: string]: string }
  permissions: Array<string>
  extensionPoints: Array<string>
  minAppVersion: string
  maxAppVersion?: string | undefined
}

export type PluginsRegistrySearchInput = { readonly q: { readonly q: string }["q"] }

export type PluginsRegistrySearchOutput = Array<{
  id: string
  name: string
  version: string
  description: string
  author: string
  entryPoint: string
  homepage?: string | undefined
  repository?: string | undefined
  dependencies: { [x: string]: string }
  permissions: Array<string>
  extensionPoints: Array<string>
  minAppVersion: string
  maxAppVersion?: string | undefined
}>

export type FilesUploadInput = {
  readonly fileName?: FilesUploadPayload["fileName"]
  readonly fileType?: FilesUploadPayload["fileType"]
  readonly organizationId?: FilesUploadPayload["organizationId"]
  readonly conversationId?: FilesUploadPayload["conversationId"]
  readonly fileSize?: FilesUploadPayload["fileSize"]
}

export type FilesUploadOutput = {
  upload: {
    id: string
    fileName: string
    s3Key: string
    s3Bucket: string
    s3ContentType: string
    s3Size: number
    objectId: string | null
    objectType: string | null
    ownerId: string
    organizationId: string | null
    createdAt: string
    updatedAt: string
    publicUrl: string
  }
  uploadUrl: string
}

export type OrganizationsListOutput = Array<{
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  role: "ADMIN" | "MANAGER" | "MEMBER"
  userCount: number
  projectCount: number
}>

export type OrganizationsCreateInput = {
  readonly name: OrganizationsCreatePayload["name"]
  readonly description?: OrganizationsCreatePayload["description"]
}

export type OrganizationsCreateOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export type OrganizationsGetInput = { readonly id: { readonly id: string }["id"] }

export type OrganizationsGetOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  members: Array<{
    id: string
    name: string | null
    email: string | null
    image: string | null
    role: "ADMIN" | "MANAGER" | "MEMBER"
    joinedAt: string
  }>
  projectCount: number
  userRole: "ADMIN" | "MANAGER" | "MEMBER"
}

export type OrganizationsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name: OrganizationsUpdatePayload["name"]
  readonly description?: OrganizationsUpdatePayload["description"]
}

export type OrganizationsUpdateOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export type OrganizationsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type OrganizationsRemoveOutput = { message: string }

export type NotificationsListInput = {
  readonly limit?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly cursor?: string | undefined
    readonly onlyUnread?: string | undefined
  }["limit"]
  readonly offset?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly cursor?: string | undefined
    readonly onlyUnread?: string | undefined
  }["offset"]
  readonly cursor?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly cursor?: string | undefined
    readonly onlyUnread?: string | undefined
  }["cursor"]
  readonly onlyUnread?: {
    readonly limit?: string | undefined
    readonly offset?: string | undefined
    readonly cursor?: string | undefined
    readonly onlyUnread?: string | undefined
  }["onlyUnread"]
}

export type NotificationsListOutput = {
  notifications: Array<{
    id: string
    type:
      | "NEW_MESSAGE"
      | "PROJECT_CREATED"
      | "COMPONENT_CREATED"
      | "MEMBER_JOINED"
      | "ORGANIZATION_INVITATION"
      | "PR_OPENED"
      | "PR_MERGED"
      | "PR_REVIEWED"
      | "AI_COMMITTED"
      | "WORKFLOW_FAILED"
      | "WORKFLOW_PASSED"
    title: string
    content: string
    isRead: boolean
    createdAt: string
    userId: string
    organizationId: string | null
    projectId: string | null
    componentId: string | null
    messageId: string | null
    linkUrl: string | null
  }>
  unreadCount: number
  nextCursor: string | null
}

export type NotificationsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly isRead: NotificationsUpdatePayload["isRead"]
}

export type NotificationsUpdateOutput = {
  id: string
  type:
    | "NEW_MESSAGE"
    | "PROJECT_CREATED"
    | "COMPONENT_CREATED"
    | "MEMBER_JOINED"
    | "ORGANIZATION_INVITATION"
    | "PR_OPENED"
    | "PR_MERGED"
    | "PR_REVIEWED"
    | "AI_COMMITTED"
    | "WORKFLOW_FAILED"
    | "WORKFLOW_PASSED"
  title: string
  content: string
  isRead: boolean
  createdAt: string
  userId: string
  organizationId: string | null
  projectId: string | null
  componentId: string | null
  messageId: string | null
  linkUrl: string | null
}

export type NotificationsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type NotificationsRemoveOutput = { message: string }

export type NotificationsMarkAllReadOutput = { message: string; count: number }

export type ProjectsListOutput = Array<{
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  ownerId: string
  organizationId: string | null
  isPublic: boolean
  owner: { id: string; name: string | null; email: string | null }
  organization: { id: string; name: string } | null
  _count: { drawings: number; components: number }
}>

export type ProjectsCreateInput = {
  readonly name?: ProjectsCreatePayload["name"]
  readonly description?: ProjectsCreatePayload["description"]
  readonly organizationId?: ProjectsCreatePayload["organizationId"]
  readonly isPublic?: ProjectsCreatePayload["isPublic"]
}

export type ProjectsCreateOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  ownerId: string
  organizationId: string | null
  isPublic: boolean
}

export type ProjectsGetInput = { readonly id: { readonly id: string }["id"] }

export type ProjectsGetOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  ownerId: string
  organizationId: string | null
  isPublic: boolean
  owner: { id: string; name: string | null; email: string | null }
  organization: { id: string; name: string } | null
  _count: { drawings: number; components: number }
}

export type ProjectsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: ProjectsUpdatePayload["name"]
  readonly description?: ProjectsUpdatePayload["description"]
  readonly organizationId?: ProjectsUpdatePayload["organizationId"]
  readonly isPublic?: ProjectsUpdatePayload["isPublic"]
}

export type ProjectsUpdateOutput = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  ownerId: string
  organizationId: string | null
  isPublic: boolean
  owner: { id: string; name: string | null; email: string | null }
  organization: { id: string; name: string } | null
  _count: { drawings: number; components: number }
}

export type ProjectsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type ProjectsRemoveOutput = { message: string }

export type MaterialsListInput = {
  readonly search?: { readonly search?: string | undefined; readonly public?: string | undefined }["search"]
  readonly public?: { readonly search?: string | undefined; readonly public?: string | undefined }["public"]
}

export type MaterialsListOutput = Array<{
  id: string
  name: string
  description: string | null
  properties: unknown
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}>

export type MaterialsCreateInput = {
  readonly name?: MaterialsCreatePayload["name"]
  readonly description?: MaterialsCreatePayload["description"]
  readonly properties?: MaterialsCreatePayload["properties"]
  readonly organizationId?: MaterialsCreatePayload["organizationId"]
  readonly isPublic?: MaterialsCreatePayload["isPublic"]
}

export type MaterialsCreateOutput = {
  id: string
  name: string
  description: string | null
  properties: unknown
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}

export type MaterialsGetInput = { readonly id: { readonly id: string }["id"] }

export type MaterialsGetOutput = {
  id: string
  name: string
  description: string | null
  properties: unknown
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  owner: { id: string; name: string | null; email: string | null } | null
  organization: { id: string; name: string } | null
}

export type MaterialsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: MaterialsUpdatePayload["name"]
  readonly description?: MaterialsUpdatePayload["description"]
  readonly properties?: MaterialsUpdatePayload["properties"]
  readonly organizationId?: MaterialsUpdatePayload["organizationId"]
  readonly isPublic?: MaterialsUpdatePayload["isPublic"]
}

export type MaterialsUpdateOutput = {
  id: string
  name: string
  description: string | null
  properties: unknown
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}

export type MaterialsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type MaterialsRemoveOutput = { message: string }

export type MaterialsStorageSaveInput = { readonly id: { readonly id: string }["id"]; readonly payload: unknown }

export type MaterialsStorageSaveOutput = { success: true; message: string; data: unknown | null }

export type MaterialsStorageReadInput = {
  readonly id: { readonly id: string }["id"]
  readonly signedUrl?: { readonly signedUrl?: string | undefined }["signedUrl"]
}

export type MaterialsStorageReadOutput = { success: true; message: string; data: unknown | null }

export type MaterialsStorageRemoveInput = { readonly id: { readonly id: string }["id"] }

export type MaterialsStorageRemoveOutput = { success: true; message: string; data: unknown | null }

export type MaterialsStorageExportInput = {
  readonly ids?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["ids"]
  readonly format?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["format"]
}

export type MaterialsStorageExportOutput = unknown

export type MaterialsStorageImportInput = { readonly payload: unknown }

export type MaterialsStorageImportOutput = { success: true; message: string; data: unknown | null }

export type ToolsListInput = {
  readonly type?: {
    readonly type?: string | undefined
    readonly material?: string | undefined
    readonly diameter?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["type"]
  readonly material?: {
    readonly type?: string | undefined
    readonly material?: string | undefined
    readonly diameter?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["material"]
  readonly diameter?: {
    readonly type?: string | undefined
    readonly material?: string | undefined
    readonly diameter?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["diameter"]
  readonly search?: {
    readonly type?: string | undefined
    readonly material?: string | undefined
    readonly diameter?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["search"]
  readonly public?: {
    readonly type?: string | undefined
    readonly material?: string | undefined
    readonly diameter?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["public"]
}

export type ToolsListOutput = Array<{
  id: string
  name: string
  type: string
  diameter: number
  material: string
  numberOfFlutes: number | null
  maxRPM: number | null
  coolantType: string | null
  cuttingLength: number | null
  totalLength: number | null
  shankDiameter: number | null
  cornerRadius?: number | null
  tipAngle?: number | null
  threadPitch?: number | null
  holderDiameter?: number | null
  holderLength?: number | null
  stickout?: number | null
  notes: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}>

export type ToolsCreateInput = {
  readonly name?: ToolsCreatePayload["name"]
  readonly type?: ToolsCreatePayload["type"]
  readonly diameter?: ToolsCreatePayload["diameter"]
  readonly material?: ToolsCreatePayload["material"]
  readonly numberOfFlutes?: ToolsCreatePayload["numberOfFlutes"]
  readonly maxRPM?: ToolsCreatePayload["maxRPM"]
  readonly coolantType?: ToolsCreatePayload["coolantType"]
  readonly cuttingLength?: ToolsCreatePayload["cuttingLength"]
  readonly totalLength?: ToolsCreatePayload["totalLength"]
  readonly shankDiameter?: ToolsCreatePayload["shankDiameter"]
  readonly cornerRadius?: ToolsCreatePayload["cornerRadius"]
  readonly tipAngle?: ToolsCreatePayload["tipAngle"]
  readonly threadPitch?: ToolsCreatePayload["threadPitch"]
  readonly holderDiameter?: ToolsCreatePayload["holderDiameter"]
  readonly holderLength?: ToolsCreatePayload["holderLength"]
  readonly stickout?: ToolsCreatePayload["stickout"]
  readonly notes?: ToolsCreatePayload["notes"]
  readonly organizationId?: ToolsCreatePayload["organizationId"]
  readonly isPublic?: ToolsCreatePayload["isPublic"]
}

export type ToolsCreateOutput = {
  id: string
  name: string
  type: string
  diameter: number
  material: string
  numberOfFlutes: number | null
  maxRPM: number | null
  coolantType: string | null
  cuttingLength: number | null
  totalLength: number | null
  shankDiameter: number | null
  cornerRadius?: number | null
  tipAngle?: number | null
  threadPitch?: number | null
  holderDiameter?: number | null
  holderLength?: number | null
  stickout?: number | null
  notes: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}

export type ToolsGetInput = { readonly id: { readonly id: string }["id"] }

export type ToolsGetOutput = {
  id: string
  name: string
  type: string
  diameter: number
  material: string
  numberOfFlutes: number | null
  maxRPM: number | null
  coolantType: string | null
  cuttingLength: number | null
  totalLength: number | null
  shankDiameter: number | null
  cornerRadius?: number | null
  tipAngle?: number | null
  threadPitch?: number | null
  holderDiameter?: number | null
  holderLength?: number | null
  stickout?: number | null
  notes: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
  owner: { id: string; name: string | null; email: string | null } | null
  organization: { id: string; name: string } | null
}

export type ToolsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: ToolsUpdatePayload["name"]
  readonly type?: ToolsUpdatePayload["type"]
  readonly diameter?: ToolsUpdatePayload["diameter"]
  readonly material?: ToolsUpdatePayload["material"]
  readonly numberOfFlutes?: ToolsUpdatePayload["numberOfFlutes"]
  readonly maxRPM?: ToolsUpdatePayload["maxRPM"]
  readonly coolantType?: ToolsUpdatePayload["coolantType"]
  readonly cuttingLength?: ToolsUpdatePayload["cuttingLength"]
  readonly totalLength?: ToolsUpdatePayload["totalLength"]
  readonly shankDiameter?: ToolsUpdatePayload["shankDiameter"]
  readonly cornerRadius?: ToolsUpdatePayload["cornerRadius"]
  readonly tipAngle?: ToolsUpdatePayload["tipAngle"]
  readonly threadPitch?: ToolsUpdatePayload["threadPitch"]
  readonly holderDiameter?: ToolsUpdatePayload["holderDiameter"]
  readonly holderLength?: ToolsUpdatePayload["holderLength"]
  readonly stickout?: ToolsUpdatePayload["stickout"]
  readonly notes?: ToolsUpdatePayload["notes"]
  readonly organizationId?: ToolsUpdatePayload["organizationId"]
  readonly isPublic?: ToolsUpdatePayload["isPublic"]
}

export type ToolsUpdateOutput = {
  id: string
  name: string
  type: string
  diameter: number
  material: string
  numberOfFlutes: number | null
  maxRPM: number | null
  coolantType: string | null
  cuttingLength: number | null
  totalLength: number | null
  shankDiameter: number | null
  cornerRadius?: number | null
  tipAngle?: number | null
  threadPitch?: number | null
  holderDiameter?: number | null
  holderLength?: number | null
  stickout?: number | null
  notes: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}

export type ToolsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type ToolsRemoveOutput = { message: string }

export type ToolsStorageSaveInput = { readonly id: { readonly id: string }["id"]; readonly payload: unknown }

export type ToolsStorageSaveOutput = { success: true; message: string; data: unknown | null }

export type ToolsStorageReadInput = {
  readonly id: { readonly id: string }["id"]
  readonly path?: { readonly path?: string | undefined; readonly signedUrl?: string | undefined }["path"]
  readonly signedUrl?: { readonly path?: string | undefined; readonly signedUrl?: string | undefined }["signedUrl"]
}

export type ToolsStorageReadOutput = { success: true; message: string; data: unknown | null }

export type ToolsStorageRemoveInput = {
  readonly id: { readonly id: string }["id"]
  readonly path?: { readonly path?: string | undefined }["path"]
}

export type ToolsStorageRemoveOutput = { success: true; message: string; data: unknown | null }

export type ToolsStorageExportInput = {
  readonly ids?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["ids"]
  readonly format?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["format"]
}

export type ToolsStorageExportOutput = unknown

export type ToolsStorageImportInput = { readonly payload: unknown }

export type ToolsStorageImportOutput = { success: true; message: string; data: unknown | null }

export type ToolsStorageExportByIdInput = {
  readonly id: { readonly id: string }["id"]
  readonly ids?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["ids"]
  readonly format?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["format"]
}

export type ToolsStorageExportByIdOutput = unknown

export type ToolsStorageImportByIdInput = { readonly id: { readonly id: string }["id"]; readonly payload: unknown }

export type ToolsStorageImportByIdOutput = { success: true; message: string; data: unknown | null }

export type MachineConfigsListInput = {
  readonly page?: {
    readonly page?: string | undefined
    readonly limit?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["page"]
  readonly limit?: {
    readonly page?: string | undefined
    readonly limit?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["limit"]
  readonly type?: {
    readonly page?: string | undefined
    readonly limit?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["type"]
  readonly search?: {
    readonly page?: string | undefined
    readonly limit?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["search"]
  readonly public?: {
    readonly page?: string | undefined
    readonly limit?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["public"]
}

export type MachineConfigsListOutput = { success: true; data: unknown | null; message?: string | undefined }

export type MachineConfigsCreateInput = { readonly payload: unknown }

export type MachineConfigsCreateOutput = { success: true; data: unknown | null; message?: string | undefined }

export type MachineConfigsGetInput = { readonly id: { readonly id: string }["id"] }

export type MachineConfigsGetOutput = { success: true; data: unknown | null; message?: string | undefined }

export type MachineConfigsUpdateInput = { readonly id: { readonly id: string }["id"]; readonly payload: unknown }

export type MachineConfigsUpdateOutput = { success: true; data: unknown | null; message?: string | undefined }

export type MachineConfigsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type MachineConfigsRemoveOutput = { success: true; data: unknown | null; message?: string | undefined }

export type MachineConfigsCloneInput = { readonly id: { readonly id: string }["id"]; readonly payload: unknown }

export type MachineConfigsCloneOutput = { success: true; data: unknown | null; message?: string | undefined }

export type MachineConfigsDefaultsOutput = { success: true; data: unknown | null; message?: string | undefined }

export type MachineConfigsStorageSaveInput = { readonly id: { readonly id: string }["id"]; readonly payload: unknown }

export type MachineConfigsStorageSaveOutput = { success: true; message: string; data: unknown | null }

export type MachineConfigsStorageReadInput = {
  readonly id: { readonly id: string }["id"]
  readonly signedUrl?: { readonly signedUrl?: string | undefined }["signedUrl"]
}

export type MachineConfigsStorageReadOutput = { success: true; message: string; data: unknown | null }

export type MachineConfigsStorageRemoveInput = { readonly id: { readonly id: string }["id"] }

export type MachineConfigsStorageRemoveOutput = { success: true; message: string; data: unknown | null }

export type MachineConfigsStorageExportInput = {
  readonly ids?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["ids"]
  readonly format?: {
    readonly ids?: string | ReadonlyArray<string> | undefined
    readonly format?: string | undefined
  }["format"]
}

export type MachineConfigsStorageExportOutput = unknown

export type MachineConfigsStorageImportInput = { readonly payload: unknown }

export type MachineConfigsStorageImportOutput = { success: true; message: string; data: unknown | null }

export type DrawingsGetInput = { readonly id: { readonly id: string }["id"] }

export type DrawingsGetOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  createdAt: string
  updatedAt: string
  projectId: string
  project: {
    id: string
    name: string
    ownerId: string
    organization: { id: string; users: Array<{ role: string }> } | null
  }
}

export type DrawingsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: DrawingsUpdatePayload["name"]
  readonly description?: DrawingsUpdatePayload["description"]
  readonly data?: DrawingsUpdatePayload["data"]
  readonly thumbnail?: DrawingsUpdatePayload["thumbnail"]
  readonly baseUpdatedAt?: DrawingsUpdatePayload["baseUpdatedAt"]
  readonly mergeData?: DrawingsUpdatePayload["mergeData"]
}

export type DrawingsUpdateOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  createdAt: string
  updatedAt: string
  projectId: string
}

export type DrawingsVersionsInput = { readonly id: { readonly id: string }["id"] }

export type DrawingsVersionsOutput = Array<{ id: string; version: number; createdAt: string; elements: number }>

export type DrawingsRestoreVersionInput = {
  readonly id: { readonly id: string; readonly versionId: string }["id"]
  readonly versionId: { readonly id: string; readonly versionId: string }["versionId"]
}

export type DrawingsRestoreVersionOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  createdAt: string
  updatedAt: string
  projectId: string
}

export type DrawingsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type DrawingsRemoveOutput = { message: string }

export type DrawingsListForProjectInput = { readonly id: { readonly id: string }["id"] }

export type DrawingsListForProjectOutput = Array<{
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  createdAt: string
  updatedAt: string
  projectId: string
}>

export type DrawingsCreateForProjectInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: DrawingsCreateForProjectPayload["name"]
  readonly description?: DrawingsCreateForProjectPayload["description"]
  readonly data?: DrawingsCreateForProjectPayload["data"]
  readonly thumbnail?: DrawingsCreateForProjectPayload["thumbnail"]
  readonly baseUpdatedAt?: DrawingsCreateForProjectPayload["baseUpdatedAt"]
  readonly mergeData?: DrawingsCreateForProjectPayload["mergeData"]
}

export type DrawingsCreateForProjectOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  createdAt: string
  updatedAt: string
  projectId: string
}

export type ComponentsGetInput = { readonly id: { readonly id: string }["id"] }

export type ComponentsGetOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  type: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  projectId: string
  project: { id: string; name: string; ownerId: string }
}

export type ComponentsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: ComponentsUpdatePayload["name"]
  readonly description?: ComponentsUpdatePayload["description"]
  readonly data?: ComponentsUpdatePayload["data"]
  readonly type?: ComponentsUpdatePayload["type"]
  readonly isPublic?: ComponentsUpdatePayload["isPublic"]
  readonly thumbnail?: ComponentsUpdatePayload["thumbnail"]
}

export type ComponentsUpdateOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  type: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  projectId: string
  message: string
}

export type ComponentsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type ComponentsRemoveOutput = { message: string }

export type ComponentsListForProjectInput = { readonly id: { readonly id: string }["id"] }

export type ComponentsListForProjectOutput = Array<{
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  type: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  projectId: string
}>

export type ComponentsCreateForProjectInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: ComponentsCreateForProjectPayload["name"]
  readonly description?: ComponentsCreateForProjectPayload["description"]
  readonly data?: ComponentsCreateForProjectPayload["data"]
  readonly type?: ComponentsCreateForProjectPayload["type"]
  readonly isPublic?: ComponentsCreateForProjectPayload["isPublic"]
  readonly thumbnail?: ComponentsCreateForProjectPayload["thumbnail"]
}

export type ComponentsCreateForProjectOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  thumbnail: string | null
  type: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  projectId: string
}

export type ToolpathsListInput = {
  readonly projectId?: {
    readonly projectId?: string | undefined
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["projectId"]
  readonly type?: {
    readonly projectId?: string | undefined
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["type"]
  readonly operationType?: {
    readonly projectId?: string | undefined
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["operationType"]
  readonly search?: {
    readonly projectId?: string | undefined
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["search"]
  readonly public?: {
    readonly projectId?: string | undefined
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly search?: string | undefined
    readonly public?: string | undefined
  }["public"]
}

export type ToolpathsListOutput = Array<{
  id: string
  name: string
  description: string | null
  data: unknown
  type: string | null
  operationType: string | null
  gcode: string | null
  thumbnail: string | null
  isPublic: boolean
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: string
  drawingId: string | null
  materialId: string | null
  toolId: string | null
  machineConfigId: string | null
}>

export type ToolpathsCreateInput = {
  readonly name?: ToolpathsCreatePayload["name"]
  readonly description?: ToolpathsCreatePayload["description"]
  readonly data?: ToolpathsCreatePayload["data"]
  readonly gcode?: ToolpathsCreatePayload["gcode"]
  readonly projectId?: ToolpathsCreatePayload["projectId"]
  readonly type?: ToolpathsCreatePayload["type"]
  readonly operationType?: ToolpathsCreatePayload["operationType"]
  readonly isPublic?: ToolpathsCreatePayload["isPublic"]
  readonly thumbnail?: ToolpathsCreatePayload["thumbnail"]
  readonly materialId?: ToolpathsCreatePayload["materialId"]
  readonly machineConfigId?: ToolpathsCreatePayload["machineConfigId"]
  readonly toolId?: ToolpathsCreatePayload["toolId"]
  readonly simulation?: ToolpathsCreatePayload["simulation"]
  readonly baseUpdatedAt?: ToolpathsCreatePayload["baseUpdatedAt"]
}

export type ToolpathsCreateOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  type: string | null
  operationType: string | null
  gcode: string | null
  thumbnail: string | null
  isPublic: boolean
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: string
  drawingId: string | null
  materialId: string | null
  toolId: string | null
  machineConfigId: string | null
}

export type ToolpathsGetInput = { readonly id: { readonly id: string }["id"] }

export type ToolpathsGetOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  type: string | null
  operationType: string | null
  gcode: string | null
  thumbnail: string | null
  isPublic: boolean
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: string
  drawingId: string | null
  materialId: string | null
  toolId: string | null
  machineConfigId: string | null
  project: { id: string; name: string; ownerId: string }
}

export type ToolpathsUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: ToolpathsUpdatePayload["name"]
  readonly description?: ToolpathsUpdatePayload["description"]
  readonly data?: ToolpathsUpdatePayload["data"]
  readonly gcode?: ToolpathsUpdatePayload["gcode"]
  readonly projectId?: ToolpathsUpdatePayload["projectId"]
  readonly type?: ToolpathsUpdatePayload["type"]
  readonly operationType?: ToolpathsUpdatePayload["operationType"]
  readonly isPublic?: ToolpathsUpdatePayload["isPublic"]
  readonly thumbnail?: ToolpathsUpdatePayload["thumbnail"]
  readonly materialId?: ToolpathsUpdatePayload["materialId"]
  readonly machineConfigId?: ToolpathsUpdatePayload["machineConfigId"]
  readonly toolId?: ToolpathsUpdatePayload["toolId"]
  readonly simulation?: ToolpathsUpdatePayload["simulation"]
  readonly baseUpdatedAt?: ToolpathsUpdatePayload["baseUpdatedAt"]
}

export type ToolpathsUpdateOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  type: string | null
  operationType: string | null
  gcode: string | null
  thumbnail: string | null
  isPublic: boolean
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: string
  drawingId: string | null
  materialId: string | null
  toolId: string | null
  machineConfigId: string | null
  message: string
}

export type ToolpathsRemoveInput = { readonly id: { readonly id: string }["id"] }

export type ToolpathsRemoveOutput = { message: string }

export type ToolpathsSetupSheetInput = { readonly id: { readonly id: string }["id"] }

export type ToolpathsSetupSheetOutput = {
  data: {
    title: string
    jobId: string
    release: "blocked" | "preview" | "verified-program"
    material: { name: string; iso: string }
    machine: { name: string; post: string }
    setup: {
      orientation: string
      workOffset: string
      origin: { x: number; y: number; z: number }
      stock: { x: number; y: number; z: number }
    }
    tools: Array<{
      number: number
      id: string
      name: string
      kind: string
      diameter: number
      flutes: number
      fluteLength: number
      shankDiameter: number
      stickout: number
      holder?: string
      operations: Array<string>
      seconds: number
    }>
    operations: Array<{
      index: number
      id: string
      name: string
      strategy: string
      status: "ok" | "failed"
      tool?: number
      seconds: number
      cutLength: number
      removedVolume: number
      rpm?: number
      feed?: number
      ap?: number
      ae?: number
      warnings: Array<string>
    }>
    totals: { tools: number; operations: number; cycleSeconds: number; cuttingSeconds: number; removedVolume: number }
    claims: Array<{ id: string; status: string; detail: string }>
    notes: Array<string>
    issues: Array<{ severity: string; message: string }>
    identity: { job: string; part: string; nc: string; algorithm: string }
  }
  html: string
}

export type ToolpathsListForDrawingInput = { readonly id: { readonly id: string }["id"] }

export type ToolpathsListForDrawingOutput = Array<{
  id: string
  name: string
  description: string | null
  data: unknown
  type: string | null
  operationType: string | null
  gcode: string | null
  thumbnail: string | null
  isPublic: boolean
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: string
  drawingId: string | null
  materialId: string | null
  toolId: string | null
  machineConfigId: string | null
  Material: { id: string; name: string } | null
  MachineConfig: { id: string; name: string; type: string } | null
  Tool: { id: string; name: string; type: string; diameter: number } | null
}>

export type ToolpathsCreateForDrawingInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: ToolpathsCreateForDrawingPayload["name"]
  readonly description?: ToolpathsCreateForDrawingPayload["description"]
  readonly data?: ToolpathsCreateForDrawingPayload["data"]
  readonly gcode?: ToolpathsCreateForDrawingPayload["gcode"]
  readonly projectId?: ToolpathsCreateForDrawingPayload["projectId"]
  readonly type?: ToolpathsCreateForDrawingPayload["type"]
  readonly operationType?: ToolpathsCreateForDrawingPayload["operationType"]
  readonly isPublic?: ToolpathsCreateForDrawingPayload["isPublic"]
  readonly thumbnail?: ToolpathsCreateForDrawingPayload["thumbnail"]
  readonly materialId?: ToolpathsCreateForDrawingPayload["materialId"]
  readonly machineConfigId?: ToolpathsCreateForDrawingPayload["machineConfigId"]
  readonly toolId?: ToolpathsCreateForDrawingPayload["toolId"]
  readonly simulation?: ToolpathsCreateForDrawingPayload["simulation"]
  readonly baseUpdatedAt?: ToolpathsCreateForDrawingPayload["baseUpdatedAt"]
}

export type ToolpathsCreateForDrawingOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  type: string | null
  operationType: string | null
  gcode: string | null
  thumbnail: string | null
  isPublic: boolean
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: string
  drawingId: string | null
  materialId: string | null
  toolId: string | null
  machineConfigId: string | null
}

export type ToolpathExtrasLibraryInput = {
  readonly projectId: {
    readonly projectId: string
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly category?: string | undefined
    readonly search?: string | undefined
  }["projectId"]
  readonly type?: {
    readonly projectId: string
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly category?: string | undefined
    readonly search?: string | undefined
  }["type"]
  readonly operationType?: {
    readonly projectId: string
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly category?: string | undefined
    readonly search?: string | undefined
  }["operationType"]
  readonly category?: {
    readonly projectId: string
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly category?: string | undefined
    readonly search?: string | undefined
  }["category"]
  readonly search?: {
    readonly projectId: string
    readonly type?: string | undefined
    readonly operationType?: string | undefined
    readonly category?: string | undefined
    readonly search?: string | undefined
  }["search"]
}

export type ToolpathExtrasLibraryOutput = Array<{
  id: string
  name: string
  description: string
  type: string
  operationType: string
  category: string
  tags: Array<string>
  data: unknown
  gcode: string
  projectId: string
}>

export type ToolpathExtrasListVersionsInput = { readonly id: { readonly id: string }["id"] }

export type ToolpathExtrasListVersionsOutput = Array<{
  id: string
  toolpathId: string
  data: unknown
  gcode: string | null
  changeMessage: string | null
  userId: string
  createdAt: string
  user: { name: string | null; email: string | null } | null
}>

export type ToolpathExtrasCreateVersionInput = {
  readonly id: { readonly id: string }["id"]
  readonly data?: ToolpathExtrasCreateVersionPayload["data"]
  readonly gcode?: ToolpathExtrasCreateVersionPayload["gcode"]
  readonly changeMessage?: ToolpathExtrasCreateVersionPayload["changeMessage"]
}

export type ToolpathExtrasCreateVersionOutput = {
  id: string
  toolpathId: string
  data: unknown
  gcode: string | null
  changeMessage: string | null
  userId: string
  createdAt: string
  message: string
}

export type ToolpathExtrasRestoreVersionInput = {
  readonly id: { readonly id: string }["id"]
  readonly versionId: ToolpathExtrasRestoreVersionPayload["versionId"]
}

export type ToolpathExtrasRestoreVersionOutput = {
  id: string
  name: string
  description: string | null
  data: unknown
  type: string | null
  operationType: string | null
  gcode: string | null
  thumbnail: string | null
  isPublic: boolean
  projectId: string
  createdAt: string
  updatedAt: string
  createdBy: string
  drawingId: string | null
  materialId: string | null
  toolId: string | null
  machineConfigId: string | null
  message: string
}

export type ToolpathExtrasListCommentsInput = { readonly id: { readonly id: string }["id"] }

export type ToolpathExtrasListCommentsOutput = Array<{
  id: string
  toolpathId: string
  content: string
  userId: string
  createdAt: string
  updatedAt: string
  user: { id: string; name: string | null; email: string | null; image: string | null } | null
}>

export type ToolpathExtrasCreateCommentInput = {
  readonly id: { readonly id: string }["id"]
  readonly content: ToolpathExtrasCreateCommentPayload["content"]
}

export type ToolpathExtrasCreateCommentOutput = {
  id: string
  toolpathId: string
  content: string
  userId: string
  createdAt: string
  updatedAt: string
  user: { id: string; name: string | null; email: string | null; image: string | null } | null
}

export type ToolpathExtrasUpdateCommentInput = {
  readonly id: { readonly id: string; readonly commentId: string }["id"]
  readonly commentId: { readonly id: string; readonly commentId: string }["commentId"]
  readonly content: ToolpathExtrasUpdateCommentPayload["content"]
}

export type ToolpathExtrasUpdateCommentOutput = {
  id: string
  toolpathId: string
  content: string
  userId: string
  createdAt: string
  updatedAt: string
  user: { id: string; name: string | null; email: string | null; image: string | null } | null
}

export type ToolpathExtrasRemoveCommentInput = {
  readonly id: { readonly id: string; readonly commentId: string }["id"]
  readonly commentId: { readonly id: string; readonly commentId: string }["commentId"]
}

export type ToolpathExtrasRemoveCommentOutput = { message: string }

export type ToolpathGeneratorManufactureInput = {
  readonly setupOrientation?: ToolpathGeneratorManufacturePayload["setupOrientation"]
  readonly material: ToolpathGeneratorManufacturePayload["material"]
  readonly machine?: ToolpathGeneratorManufacturePayload["machine"]
  readonly machineConfig?: ToolpathGeneratorManufacturePayload["machineConfig"]
  readonly origin?: ToolpathGeneratorManufacturePayload["origin"]
  readonly finishAllowance?: ToolpathGeneratorManufacturePayload["finishAllowance"]
  readonly scallop?: ToolpathGeneratorManufacturePayload["scallop"]
  readonly schemaVersion: ToolpathGeneratorManufacturePayload["schemaVersion"]
  readonly id: ToolpathGeneratorManufacturePayload["id"]
  readonly name: ToolpathGeneratorManufacturePayload["name"]
  readonly elements: ToolpathGeneratorManufacturePayload["elements"]
  readonly stock?: ToolpathGeneratorManufacturePayload["stock"]
  readonly tolerance?: ToolpathGeneratorManufacturePayload["tolerance"]
  readonly resolution?: ToolpathGeneratorManufacturePayload["resolution"]
  readonly workOffset?: ToolpathGeneratorManufacturePayload["workOffset"]
  readonly operations?: ToolpathGeneratorManufacturePayload["operations"]
  readonly tools?: ToolpathGeneratorManufacturePayload["tools"]
  readonly deburr?: ToolpathGeneratorManufacturePayload["deburr"]
  readonly subprograms?: ToolpathGeneratorManufacturePayload["subprograms"]
  readonly print?: ToolpathGeneratorManufacturePayload["print"]
  readonly progress?: ToolpathGeneratorManufacturePayload["progress"]
}

export type ToolpathGeneratorManufactureOutput =
  | {
      status: "ok"
      value: {
        schemaVersion: 1
        jobId: string
        material: { id: string; name: string; iso: string }
        machine: {
          id: string
          name: string
          post: "generic" | "fanuc" | "grbl" | "linuxcnc" | "haas" | "siemens" | "heidenhain"
        }
        setupOrientation?: "+Z" | "-Z" | "+X" | "-X" | "+Y" | "-Y"
        origin: { x: number; y: number; z: number }
        stockBounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
        operations: Array<{
          id: string
          name: string
          strategy:
            | "face"
            | "adaptive"
            | "pocket"
            | "profile"
            | "bore"
            | "drill"
            | "thread"
            | "engrave"
            | "chamfer"
            | "surface"
            | "multiaxis"
            | "print"
          toolId: string
          cut:
            | "face"
            | "slot"
            | "rough-side"
            | "adaptive"
            | "finish-wall"
            | "finish-floor"
            | "finish-3d"
            | "drill"
            | "spot"
            | "chamfer"
            | "engrave"
            | "thread-mill"
            | "tap"
            | "ream"
            | "print"
          status: "ok" | "failed"
          cutting?: {
            cut:
              | "face"
              | "slot"
              | "rough-side"
              | "adaptive"
              | "finish-wall"
              | "finish-floor"
              | "finish-3d"
              | "drill"
              | "spot"
              | "chamfer"
              | "engrave"
              | "thread-mill"
              | "tap"
              | "ream"
            rpm: number
            vc: number
            vcRecommended: number
            effectiveDiameter: number
            fz: number
            chipThickness: number
            feed: number
            plungeFeed: number
            ap: number
            ae: number
            stepoverPercent: number
            rampAngle: number
            helixPitch: number
            coolant: "off" | "flood" | "mist"
            peck?: number
            chipBreak?: boolean
            feedPerRev?: number
            passes?: number
            mrr: number
            powerKw: number
            torqueNm: number
            forceN: number
            deflectionMm: number
            limitedBy: Array<string>
            warnings: Array<string>
            exceeded: Array<string>
            source: string
            reference: {
              table: "MATERIALS"
              row: string
              rowName: string
              columns: { [x: string]: number }
              factors: { [x: string]: number }
              basis: string
            }
          }
          parameters: { [x: string]: any }
          overridden: Array<string>
          warnings: Array<string>
          startZ?: number
          cutLength: number
          timeSeconds: number
          removedVolume: number
        }>
        program: {
          name: string
          units: "mm" | "inch"
          workOffset: "G54" | "G55" | "G56" | "G57" | "G58" | "G59"
          toolpaths: Array<{
            id: string
            name: string
            toolId: string
            spindleRpm: number
            coolant: "off" | "flood" | "mist"
            moves: Array<
              | {
                  _tag: "Rapid"
                  to: { x: number; y: number; z: number }
                  rotary?: { a?: number; b?: number; c?: number }
                }
              | {
                  _tag: "Linear"
                  to: { x: number; y: number; z: number }
                  feed: number
                  rotary?: { a?: number; b?: number; c?: number }
                }
              | {
                  _tag: "Arc"
                  to: { x: number; y: number; z: number }
                  center: { x: number; y: number }
                  clockwise: boolean
                  feed: number
                }
              | { _tag: "Dwell"; seconds: number }
              | { _tag: "Comment"; text: string }
              | {
                  _tag: "Cycle"
                  cycle: "drill" | "dwell" | "peck" | "chipBreak" | "tap" | "ream" | "bore"
                  to: { x: number; y: number; z: number }
                  feed: number
                  peckDepth: number
                  dwellSeconds: number
                  retractHeight: number
                  pitch?: number
                }
              | { _tag: "Orient"; a?: number; b?: number; c?: number }
            >
          }>
          metadata?: { [x: string]: string }
        }
        tools: Array<{
          id: string
          name: string
          kind:
            | "flat"
            | "ball"
            | "bull"
            | "chamfer"
            | "spot"
            | "drill"
            | "facemill"
            | "threadmill"
            | "engraver"
            | "tap"
            | "reamer"
          diameter: number
          flutes: number
          material: "hss" | "hss-co" | "carbide" | "pcd"
          coating: "none" | "tin" | "ticn" | "altin" | "alcrn" | "zrn" | "dlc" | "diamond"
          cornerRadius?: number
          angle?: number
          tipDiameter?: number
          pitch?: number
          fluteLength: number
          shankDiameter: number
          stickout: number
          holder?: { diameter: number; length: number }
          maxRpm?: number
          number: number
        }>
        nc: string
        claims: Array<{
          id:
            | "bed-fit"
            | "heated-start"
            | "layers-rise"
            | "wall-coverage"
            | "skin-coverage"
            | "no-spill"
            | "filament"
            | "cutting-data"
            | "machine-limits"
            | "operations-complete"
            | "no-rapid-in-stock"
            | "holder-clearance"
            | "no-gouge"
            | "material-removed"
            | "nc-replay"
            | "machine-travel"
            | "machine-clearance"
            | "setup-workholding"
            | "part-coverage"
          status: "passed" | "failed" | "unsupported" | "unresolved"
          detail: string
        }>
        issues: Array<{
          tag:
            | "InvalidInput"
            | "UnknownMaterial"
            | "UnknownTool"
            | "NoSuitableTool"
            | "UnsupportedCapability"
            | "GenerationFailed"
            | "EmptyToolpath"
            | "MachineLimit"
            | "RapidInStock"
            | "HolderCollision"
            | "Gouge"
            | "RemainingStock"
            | "ReplayMismatch"
            | "Cancelled"
          severity: "error" | "warning"
          stage: "prepare" | "plan" | "cutting-data" | "generate" | "post" | "replay" | "evidence"
          message: string
          operationId?: string
          line?: number
          point?: { x: number; y: number; z: number }
        }>
        release: "blocked" | "preview" | "verified-program"
        stock: {
          initialVolume: number
          finalVolume: number
          partVolume: number
          remainingVolume: number
          maxRemaining: number
          cellSize: number
          fiveAxis?: {
            voxelMm: number
            removedLower: number
            removedUpper: number
            remainingLower: number
            remainingUpper: number
          }
        }
        cycleTimeSeconds: number
        identity: { job: string; part: string; nc: string; algorithm: string }
        notes: Array<string>
        print?: {
          dialect: "marlin" | "klipper" | "reprap"
          filament: { material: string; densityGcm3: number; diameter: number }
          nozzle: { diameter: number; temperature: number; bedTemperature: number }
          layers: number
          layerHeight: number
          filamentMm: number
          filamentGrams: number
          timeSeconds: number
          travelMm: number
          retractions: number
          lengthByKind: { [x: string]: number }
          size: { x: number; y: number; z: number }
          orientation: string
          settings: {
            layerHeight?: number
            firstLayerHeight?: number
            walls?: number
            topLayers?: number
            bottomLayers?: number
            infillDensity?: number
            infillPattern?: "lines" | "grid" | "triangles" | "honeycomb" | "gyroid" | "concentric"
            supports?: "none" | "buildplate" | "everywhere"
            supportAngle?: number
            adhesion?: "none" | "skirt" | "brim" | "raft"
            brimWidth?: number
            printSpeed?: number
            nozzleTemperature?: number
            bedTemperature?: number
            fan?: number
            vase?: boolean
            orientation?: "as-designed" | "auto"
            seam?: "nearest" | "aligned" | "random"
            retractionDistance?: number
            zHop?: number
            flow?: number
            relativeExtrusion?: boolean
          }
        }
        tolerance?: {
          requested: number
          terms: Array<{
            id: "source-tessellation" | "part-model" | "path" | "nc-rounding" | "stock-replay"
            mm: number
            basis: string
          }>
          achieved: number
          unbounded: Array<string>
          met: boolean
        }
      }
    }
  | {
      status: "failed"
      issues: Array<{
        tag:
          | "InvalidInput"
          | "UnknownMaterial"
          | "UnknownTool"
          | "NoSuitableTool"
          | "UnsupportedCapability"
          | "GenerationFailed"
          | "EmptyToolpath"
          | "MachineLimit"
          | "RapidInStock"
          | "HolderCollision"
          | "Gouge"
          | "RemainingStock"
          | "ReplayMismatch"
          | "Cancelled"
        severity: "error" | "warning"
        stage: "prepare" | "plan" | "cutting-data" | "generate" | "post" | "replay" | "evidence"
        message: string
        operationId?: string
        line?: number
        point?: { x: number; y: number; z: number }
      }>
    }

export type ToolpathGeneratorParseInput = {
  readonly gcode: ToolpathGeneratorParsePayload["gcode"]
  readonly name: ToolpathGeneratorParsePayload["name"]
}

export type ToolpathGeneratorParseOutput = {
  warnings: Array<string>
  stats: {
    lines: number
    cutLength: number
    rapidLength: number
    minZ: number
    maxZ: number
    estimatedSeconds: number
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
  }
  program: {
    name: string
    units: "mm" | "inch"
    workOffset: "G54" | "G55" | "G56" | "G57" | "G58" | "G59"
    toolpaths: Array<{
      id: string
      name: string
      toolId: string
      spindleRpm: number
      coolant: "off" | "flood" | "mist"
      moves: Array<
        | { _tag: "Rapid"; to: { x: number; y: number; z: number }; rotary?: { a?: number; b?: number; c?: number } }
        | {
            _tag: "Linear"
            to: { x: number; y: number; z: number }
            feed: number
            rotary?: { a?: number; b?: number; c?: number }
          }
        | {
            _tag: "Arc"
            to: { x: number; y: number; z: number }
            center: { x: number; y: number }
            clockwise: boolean
            feed: number
          }
        | { _tag: "Dwell"; seconds: number }
        | { _tag: "Comment"; text: string }
        | {
            _tag: "Cycle"
            cycle: "drill" | "dwell" | "peck" | "chipBreak" | "tap" | "ream" | "bore"
            to: { x: number; y: number; z: number }
            feed: number
            peckDepth: number
            dwellSeconds: number
            retractHeight: number
            pitch?: number
          }
        | { _tag: "Orient"; a?: number; b?: number; c?: number }
      >
    }>
    metadata?: { [x: string]: string }
  }
  motion?: {
    paths: Array<{
      count: number
      runs: Array<{
        start: number
        spindle: "cw" | "ccw" | "off"
        rpm: number
        css: boolean
        plane: 17 | 18 | 19
        xMode: "diameter" | "radius"
        tool?: number
        coolant: "off" | "flood" | "mist"
        feedMode: "min" | "rev"
        probe?: boolean
      }>
      extrude?: Array<number>
      lines?: Array<number>
      rpm?: Array<number>
      retracts?: Array<number>
      homes?: Array<number>
    }>
    unsupported: Array<{ line: number; word: string }>
  }
}

export type ToolpathGeneratorVerifyInput = {
  readonly gcode?: ToolpathGeneratorVerifyPayload["gcode"]
  readonly program?: ToolpathGeneratorVerifyPayload["program"]
  readonly stock: ToolpathGeneratorVerifyPayload["stock"]
  readonly tool: ToolpathGeneratorVerifyPayload["tool"]
  readonly fixtures: ToolpathGeneratorVerifyPayload["fixtures"]
  readonly target?: ToolpathGeneratorVerifyPayload["target"]
  readonly resolution?: ToolpathGeneratorVerifyPayload["resolution"]
  readonly tolerance: ToolpathGeneratorVerifyPayload["tolerance"]
  readonly start?: ToolpathGeneratorVerifyPayload["start"]
}

export type ToolpathGeneratorVerifyOutput = {
  ok: boolean
  issues: Array<{
    code:
      | "InvalidInput"
      | "InterpreterWarning"
      | "RapidInMaterial"
      | "ShankCollision"
      | "HolderCollision"
      | "FixtureCollision"
      | "BelowStock"
      | "Gouge"
      | "UncutStock"
      | "ResolutionCoarsened"
    severity: "error" | "warning" | "info"
    message: string
    line?: number
    point?: { x: number; y: number; z: number }
    count: number
    fixtureId?: string
  }>
  stats: {
    cellSize: number
    cellsX: number
    cellsY: number
    samples: number
    stockVolume: number
    removedVolume: number
    remainingVolume: number
    engagedLength: number
    airCutLength: number
    gougeVolume?: number
    maxGouge?: number
    uncutVolume?: number
    maxUncut?: number
  }
  preview: {
    nx: number
    ny: number
    minX: number
    minY: number
    cellX: number
    cellY: number
    minZ: number
    maxZ: number
    heights: Array<number>
    gouge: Array<number>
  }
}

export type CadExactAnalyzeInput = {
  readonly elements?: CadExactAnalyzePayload["elements"]
  readonly drawingId?: CadExactAnalyzePayload["drawingId"]
  readonly ids?: CadExactAnalyzePayload["ids"]
  readonly machining?: CadExactAnalyzePayload["machining"]
}

export type CadExactAnalyzeOutput = {
  parts: Array<{
    id: string
    name: string
    valid: boolean
    issues: Array<string>
    volume: number
    area: number
    centroid: { x: number; y: number; z: number }
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
    faces: number
    edges: number
    vertices: number
    surfaces: { [x: string]: number }
    throughHoles?: number
    holes: Array<{
      entry: { x: number; y: number; z: number }
      direction: { x: number; y: number; z: number }
      diameter: number
      depth: number
      form: "simple" | "counterbore" | "countersink"
      bottom: "through" | "flat" | "drill-point"
      headDiameter?: number
      headDepth?: number
    }>
    machining:
      | {
          prismatic: true
          holes: number
          pockets: number
          outlines: number
          top: number
          bottom: number
          islands?: number
        }
      | { prismatic: false; reason: string }
    bosses: Array<{
      diameter: number
      length: number
      free: "near" | "far" | "both" | "none"
      origin: { x: number; y: number; z: number }
      axis: { x: number; y: number; z: number }
    }>
    faceNames?: Array<string>
    repair?: {
      verticesWelded: number
      edgesWelded: number
      collapsedUses: number
      validAfter: boolean
      issuesAfter: Array<string>
    }
  }>
  skipped: Array<{ id: string; name: string; reason: string }>
  totals: { parts: number; volume: number; area: number }
}

export type CadExactStepInput = {
  readonly elements?: CadExactStepPayload["elements"]
  readonly drawingId?: CadExactStepPayload["drawingId"]
  readonly ids?: CadExactStepPayload["ids"]
  readonly faceted?: CadExactStepPayload["faceted"]
  readonly author?: CadExactStepPayload["author"]
}

export type CadExactStepOutput = {
  step?: string
  parts: Array<{ id: string; name: string; exact: boolean; faces: number; valid: boolean; note?: string }>
  skipped: Array<{ id: string; name: string; reason: string }>
}

export type CadExactAssemblyInput = {
  readonly elements?: CadExactAssemblyPayload["elements"]
  readonly drawingId?: CadExactAssemblyPayload["drawingId"]
  readonly washers?: CadExactAssemblyPayload["washers"]
}

export type CadExactAssemblyOutput = {
  parts: number
  interference: {
    clashes: Array<{
      a: string
      b: string
      aName: string
      bName: string
      volume: number
      centroid: { x: number; y: number; z: number }
    }>
    expected: Array<{ a: string; b: string; aName: string; bName: string; volume: number; note: string }>
    touching: Array<{ a: string; b: string }>
    undetermined: Array<{ a: string; b: string; reason: string }>
    checked: number
  }
  clearance?: Array<{ a: string; b: string; aName: string; bName: string; distance: number; overlap: boolean }>
  bom: Array<{
    item: number
    name: string
    designation?: string
    material?: string
    quantity: number
    volume: number
    mass?: number
    parts: Array<string>
  }>
  joints: Array<{
    parent: string
    child: string
    parentName: string
    childName: string
    kind: "revolute" | "fixed"
    origin: { x: number; y: number; z: number }
    axis: { x: number; y: number; z: number }
    axes: number
  }>
  fasteners: {
    plans: Array<{
      id: string
      size: string
      threadName: string
      designation: string
      length: number
      seat: { x: number; y: number; z: number }
      direction: { x: number; y: number; z: number }
      bodies: Array<string>
      tapped?: string
      grip: number
      engagement?: number
      headWasher?: { designation: string; inner: number; outer: number; thickness: number }
      nutWasher?: { designation: string; inner: number; outer: number; thickness: number }
      nutWasherAt?: { x: number; y: number; z: number }
      nut?: { designation: string; across: number; height: number; at: { x: number; y: number; z: number } }
      warnings: Array<string>
    }>
    unfastened: Array<{ bodies: Array<string>; at: { x: number; y: number; z: number }; reason: string }>
    existing: number
  }
  skipped: Array<{ id: string; name: string; reason: string }>
}

export type CadExactSetupsInput = {
  readonly elements?: CadExactSetupsPayload["elements"]
  readonly drawingId?: CadExactSetupsPayload["drawingId"]
  readonly ids?: CadExactSetupsPayload["ids"]
  readonly fixture?: CadExactSetupsPayload["fixture"]
  readonly allowed?: CadExactSetupsPayload["allowed"]
}

export type CadExactSetupsOutput = {
  parts: Array<{
    id: string
    name: string
    plan: {
      setups: Array<{
        orientation: "+Z" | "-Z" | "+X" | "-X" | "+Y" | "-Y"
        faces: Array<number>
        area: number
        share: number
        holes: Array<{
          entry: { x: number; y: number; z: number }
          direction: { x: number; y: number; z: number }
          diameter: number
          depth: number
          form: "simple" | "counterbore" | "countersink"
        }>
        prismatic: { ok: true; holes: number; pockets: number; outlines: number } | { ok: false; reason: string }
      }>
      uncovered: Array<{ face: number; kind: string; area: number; reason: string }>
      held: Array<{ face: number; kind: string; area: number }>
      indexed: Array<{
        entry: { x: number; y: number; z: number }
        direction: { x: number; y: number; z: number }
        diameter: number
        depth: number
        form: "simple" | "counterbore" | "countersink"
      }>
      reach: Array<{ orientation: "+Z" | "-Z" | "+X" | "-X" | "+Y" | "-Y"; faces: number; area: number; share: number }>
      faces: number
      area: number
      notes: Array<string>
    }
  }>
  skipped: Array<{ id: string; name: string; reason: string }>
}

export type CadExactHoleInput = {
  readonly elements?: CadExactHolePayload["elements"]
  readonly drawingId?: CadExactHolePayload["drawingId"]
  readonly id: CadExactHolePayload["id"]
  readonly hole?: CadExactHolePayload["hole"]
  readonly boss?: CadExactHolePayload["boss"]
  readonly diameter?: CadExactHolePayload["diameter"]
  readonly fill?: CadExactHolePayload["fill"]
}

export type CadExactHoleOutput =
  | {
      ok: true
      id: string
      name: string
      hole: number
      holes: number
      before: { diameter: number; depth: number; form: "simple" | "counterbore" | "countersink" }
      edit: { kind: "resize"; diameter: number } | { kind: "fill" }
      volume: number
      originalVolume: number
      volumeChange: number
      faces: number
      valid: boolean
    }
  | {
      ok: true
      id: string
      name: string
      boss: number
      bosses: number
      before: { diameter: number; length: number }
      diameter: number
      volume: number
      originalVolume: number
      volumeChange: number
      faces: number
      valid: boolean
    }
  | { ok: false; error: string }

export type LibraryListInput = {
  readonly category?: {
    readonly category?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
  }["category"]
  readonly type?: {
    readonly category?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
  }["type"]
  readonly search?: {
    readonly category?: string | undefined
    readonly type?: string | undefined
    readonly search?: string | undefined
  }["search"]
}

export type LibraryListOutput = Array<{
  id: string
  name: string
  description: string | null
  category: string
  type: string
  data: unknown
  properties: unknown
  tags: unknown
  thumbnail: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}>

export type LibraryCreateInput = {
  readonly name?: LibraryCreatePayload["name"]
  readonly description?: LibraryCreatePayload["description"]
  readonly category?: LibraryCreatePayload["category"]
  readonly type?: LibraryCreatePayload["type"]
  readonly data?: LibraryCreatePayload["data"]
  readonly properties?: LibraryCreatePayload["properties"]
  readonly tags?: LibraryCreatePayload["tags"]
  readonly organizationId?: LibraryCreatePayload["organizationId"]
  readonly isPublic?: LibraryCreatePayload["isPublic"]
}

export type LibraryCreateOutput = {
  id: string
  name: string
  description: string | null
  category: string
  type: string
  data: unknown
  properties: unknown
  tags: unknown
  thumbnail: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}

export type LibraryGetInput = { readonly id: { readonly id: string }["id"] }

export type LibraryGetOutput = {
  id: string
  name: string
  description: string | null
  category: string
  type: string
  data: unknown
  properties: unknown
  tags: unknown
  thumbnail: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}

export type LibraryUpdateInput = {
  readonly id: { readonly id: string }["id"]
  readonly name?: LibraryUpdatePayload["name"]
  readonly description?: LibraryUpdatePayload["description"]
  readonly category?: LibraryUpdatePayload["category"]
  readonly type?: LibraryUpdatePayload["type"]
  readonly data?: LibraryUpdatePayload["data"]
  readonly properties?: LibraryUpdatePayload["properties"]
  readonly tags?: LibraryUpdatePayload["tags"]
  readonly organizationId?: LibraryUpdatePayload["organizationId"]
  readonly isPublic?: LibraryUpdatePayload["isPublic"]
}

export type LibraryUpdateOutput = {
  id: string
  name: string
  description: string | null
  category: string
  type: string
  data: unknown
  properties: unknown
  tags: unknown
  thumbnail: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string | null
  organizationId: string | null
}

export type LibraryRemoveInput = { readonly id: { readonly id: string }["id"] }

export type LibraryRemoveOutput = { message: string }

export type LibraryComponentsOutput = {
  data: Array<{
    id: string
    name: string
    description: string | null
    category: string
    type: string
    data: unknown
    properties: unknown
    tags: unknown
    thumbnail: string | null
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
    owner: { id: string; name: string | null; email: string | null; image: string | null } | null
  }>
}["data"]

export type LibraryMaterialsOutput = {
  data: Array<{
    id: string
    name: string
    description: string | null
    properties: unknown
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
    owner: { id: string; name: string | null; email: string | null; image: string | null } | null
  }>
}["data"]

export type LibraryToolsOutput = {
  data: Array<{
    id: string
    name: string
    type: string
    diameter: number
    material: string
    numberOfFlutes: number | null
    maxRPM: number | null
    coolantType: string | null
    cuttingLength: number | null
    totalLength: number | null
    shankDiameter: number | null
    cornerRadius?: number | null
    tipAngle?: number | null
    threadPitch?: number | null
    holderDiameter?: number | null
    holderLength?: number | null
    stickout?: number | null
    notes: string | null
    isPublic: boolean
    createdAt: string
    updatedAt: string
    ownerId: string | null
    organizationId: string | null
    owner: { id: string; name: string | null; email: string | null; image: string | null } | null
  }>
}["data"]

export type ProjectToolpathsListInput = {
  readonly id: { readonly id: string }["id"]
  readonly projectId?: { readonly projectId?: string | undefined }["projectId"]
}

export type ProjectToolpathsListOutput = { success: true; data: unknown | null; message?: string | undefined }

export type VcsStatusInput = { readonly id: { readonly id: string }["id"] }

export type VcsStatusOutput = { branch: string; head: string | null; dirty: Array<string> }

export type VcsLogInput = {
  readonly id: { readonly id: string }["id"]
  readonly rev?: {
    readonly rev?: string | undefined
    readonly limit?: number | undefined
    readonly path?: string | undefined
  }["rev"]
  readonly limit?: {
    readonly rev?: string | undefined
    readonly limit?: number | undefined
    readonly path?: string | undefined
  }["limit"]
  readonly path?: {
    readonly rev?: string | undefined
    readonly limit?: number | undefined
    readonly path?: string | undefined
  }["path"]
}

export type VcsLogOutput = Array<{
  oid: string
  parents: Array<string>
  message: string
  author: { name: string; email: string; time: number }
}>

export type VcsCommitInput = {
  readonly id: { readonly id: string }["id"]
  readonly message: VcsCommitPayload["message"]
  readonly authorKind?: VcsCommitPayload["authorKind"]
  readonly files?: VcsCommitPayload["files"]
}

export type VcsCommitOutput = {
  oid: string
  parents: Array<string>
  message: string
  author: { name: string; email: string; time: number }
}

export type VcsBranchesInput = { readonly id: { readonly id: string }["id"] }

export type VcsBranchesOutput = { current: string; branches: { [x: string]: string } }

export type VcsCreateBranchInput = {
  readonly id: { readonly id: string }["id"]
  readonly name: VcsCreateBranchPayload["name"]
  readonly from?: VcsCreateBranchPayload["from"]
}

export type VcsCreateBranchOutput = { current: string; branches: { [x: string]: string } }

export type VcsCheckoutInput = {
  readonly id: { readonly id: string }["id"]
  readonly branch: VcsCheckoutPayload["branch"]
}

export type VcsCheckoutOutput = { branch: string; head: string | null; dirty: Array<string> }

export type VcsRestoreInput = {
  readonly id: { readonly id: string }["id"]
  readonly rev: VcsRestorePayload["rev"]
  readonly paths?: VcsRestorePayload["paths"]
}

export type VcsRestoreOutput = {
  oid: string
  parents: Array<string>
  message: string
  author: { name: string; email: string; time: number }
}

export type VcsDiffInput = {
  readonly id: { readonly id: string }["id"]
  readonly from?: { readonly from?: string | undefined; readonly to: string }["from"]
  readonly to: { readonly from?: string | undefined; readonly to: string }["to"]
}

export type VcsDiffOutput = Array<{
  path: string
  kind:
    | "drawings"
    | "components"
    | "toolpaths"
    | "materials"
    | "tools"
    | "machine-configs"
    | "costs"
    | "project"
    | "other"
  id?: string | undefined
  name?: string | undefined
  status: "added" | "modified" | "deleted"
  changes: Array<{ pointer: string; before?: unknown | undefined; after?: unknown | undefined }>
}>

export type VcsListPullRequestsInput = {
  readonly id: { readonly id: string }["id"]
  readonly state?: { readonly state?: "open" | "merged" | "closed" | undefined }["state"]
}

export type VcsListPullRequestsOutput = Array<{
  id: string
  projectId: string
  number: number
  title: string
  body: string
  head: string
  base: string
  state: "open" | "merged" | "closed"
  authorId: string
  authorKind: "user" | "ai"
  mergeCommit: string | null
  remoteNumber: number | null
  createdAt: string
  updatedAt: string
}>

export type VcsOpenPullRequestInput = {
  readonly id: { readonly id: string }["id"]
  readonly title: VcsOpenPullRequestPayload["title"]
  readonly body?: VcsOpenPullRequestPayload["body"]
  readonly head: VcsOpenPullRequestPayload["head"]
  readonly base?: VcsOpenPullRequestPayload["base"]
  readonly authorKind?: VcsOpenPullRequestPayload["authorKind"]
}

export type VcsOpenPullRequestOutput = {
  id: string
  projectId: string
  number: number
  title: string
  body: string
  head: string
  base: string
  state: "open" | "merged" | "closed"
  authorId: string
  authorKind: "user" | "ai"
  mergeCommit: string | null
  remoteNumber: number | null
  createdAt: string
  updatedAt: string
}

export type VcsPullRequestInput = {
  readonly id: { readonly id: string; readonly number: string }["id"]
  readonly number: { readonly id: string; readonly number: string }["number"]
}

export type VcsPullRequestOutput = {
  pullRequest: {
    id: string
    projectId: string
    number: number
    title: string
    body: string
    head: string
    base: string
    state: "open" | "merged" | "closed"
    authorId: string
    authorKind: "user" | "ai"
    mergeCommit: string | null
    remoteNumber: number | null
    createdAt: string
    updatedAt: string
  }
  reviews: Array<{
    id: string
    pullRequestId: string
    reviewerId: string
    verdict: "comment" | "approve" | "request-changes"
    body: string
    path: string | null
    pointer: string | null
    createdAt: string
  }>
  changes: Array<{
    path: string
    kind:
      | "drawings"
      | "components"
      | "toolpaths"
      | "materials"
      | "tools"
      | "machine-configs"
      | "costs"
      | "project"
      | "other"
    id?: string | undefined
    name?: string | undefined
    status: "added" | "modified" | "deleted"
    changes: Array<{ pointer: string; before?: unknown | undefined; after?: unknown | undefined }>
  }>
}

export type VcsReviewInput = {
  readonly id: { readonly id: string; readonly number: string }["id"]
  readonly number: { readonly id: string; readonly number: string }["number"]
  readonly verdict: VcsReviewPayload["verdict"]
  readonly body?: VcsReviewPayload["body"]
  readonly path?: VcsReviewPayload["path"]
  readonly pointer?: VcsReviewPayload["pointer"]
}

export type VcsReviewOutput = {
  id: string
  pullRequestId: string
  reviewerId: string
  verdict: "comment" | "approve" | "request-changes"
  body: string
  path: string | null
  pointer: string | null
  createdAt: string
}

export type VcsMergePullRequestInput = {
  readonly id: { readonly id: string; readonly number: string }["id"]
  readonly number: { readonly id: string; readonly number: string }["number"]
}

export type VcsMergePullRequestOutput = {
  id: string
  projectId: string
  number: number
  title: string
  body: string
  head: string
  base: string
  state: "open" | "merged" | "closed"
  authorId: string
  authorKind: "user" | "ai"
  mergeCommit: string | null
  remoteNumber: number | null
  createdAt: string
  updatedAt: string
}

export type VcsClosePullRequestInput = {
  readonly id: { readonly id: string; readonly number: string }["id"]
  readonly number: { readonly id: string; readonly number: string }["number"]
}

export type VcsClosePullRequestOutput = {
  id: string
  projectId: string
  number: number
  title: string
  body: string
  head: string
  base: string
  state: "open" | "merged" | "closed"
  authorId: string
  authorKind: "user" | "ai"
  mergeCommit: string | null
  remoteNumber: number | null
  createdAt: string
  updatedAt: string
}

export type VcsRemoteInput = { readonly id: { readonly id: string }["id"] }

export type VcsRemoteOutput = { remote: string | null }

export type VcsSetRemoteInput = {
  readonly id: { readonly id: string }["id"]
  readonly remote: VcsSetRemotePayload["remote"]
}

export type VcsSetRemoteOutput = { remote: string | null }

export type VcsPushInput = {
  readonly id: { readonly id: string }["id"]
  readonly "x-github-token": { readonly "x-github-token": string }["x-github-token"]
  readonly branch?: VcsPushPayload["branch"]
}

export type VcsPushOutput = { oid: string; objects: number }

export type VcsPullInput = {
  readonly id: { readonly id: string }["id"]
  readonly "x-github-token": { readonly "x-github-token": string }["x-github-token"]
  readonly branch?: VcsPullPayload["branch"]
}

export type VcsPullOutput = { kind: string; oid: string }

export type VcsRunsInput = { readonly id: { readonly id: string }["id"] }

export type VcsRunsOutput = Array<{
  id: string
  projectId: string
  workflow: string
  event: "push" | "pull-request" | "manual"
  ref: string
  sha: string
  status: "queued" | "running" | "success" | "failure"
  events: Array<unknown>
  startedAt: string
  finishedAt: string | null
}>

export type VcsDispatchInput = { readonly id: { readonly id: string }["id"]; readonly ref?: VcsDispatchPayload["ref"] }

export type VcsDispatchOutput = Array<{
  id: string
  projectId: string
  workflow: string
  event: "push" | "pull-request" | "manual"
  ref: string
  sha: string
  status: "queued" | "running" | "success" | "failure"
  events: Array<unknown>
  startedAt: string
  finishedAt: string | null
}>

export type VcsListWorkflowsInput = {
  readonly id: { readonly id: string }["id"]
  readonly ref?: { readonly ref?: string | undefined }["ref"]
}

export type VcsListWorkflowsOutput = Array<{
  name: string
  path: string
  content: string
  problem?: string | undefined
}>

export type VcsWorkflowInput = {
  readonly id: { readonly id: string; readonly name: string }["id"]
  readonly name: { readonly id: string; readonly name: string }["name"]
  readonly ref?: { readonly ref?: string | undefined }["ref"]
}

export type VcsWorkflowOutput = { name: string; path: string; content: string; problem?: string | undefined }

export type EventsSubscribeInput = { readonly id: { readonly id: string }["id"] }

export type EventsSubscribeOutput =
  | {
      type: "pr.opened"
      at: string
      projectId: string
      number: number
      title: string
      authorKind: "user" | "ai"
      head: string
      base: string
    }
  | { type: "pr.merged"; at: string; projectId: string; number: number; title: string }
  | { type: "pr.closed"; at: string; projectId: string; number: number }
  | {
      type: "pr.reviewed"
      at: string
      projectId: string
      number: number
      verdict: "comment" | "approve" | "request-changes"
    }
  | {
      type: "commit"
      at: string
      projectId: string
      oid: string
      branch: string
      authorKind: "user" | "ai"
      message: string
    }
  | {
      type: "workflow.started"
      at: string
      projectId: string
      runId: string
      workflow: string
      event: "push" | "pull-request" | "manual"
    }
  | {
      type: "workflow.finished"
      at: string
      projectId: string
      runId: string
      workflow: string
      status: "success" | "failure" | "cancelled"
    }
  | { type: "ai.session"; at: string; projectId: string; sessionId: string; phase: "started" | "finished" | "aborted" }
  | {
      type: "cam.progress"
      at: string
      projectId: string
      runId: string
      phase: "running" | "done" | "cancelled"
      stage?: "operations" | "post" | "replay" | "evidence" | undefined
      operationId?: string | undefined
      index?: number | undefined
      count?: number | undefined
    }
  | { type: "workspace.changed"; at: string; projectId: string }
  | { type: "server.connected"; at: string }
  | { type: "server.heartbeat"; at: string }
  | { type: "resources.changed"; userId: string; organizationId?: string | undefined; at: string }
  | { type: "catalogue.updated"; at: string }
  | {
      type: "notification.created"
      at: string
      notification: {
        id: string
        type:
          | "NEW_MESSAGE"
          | "PROJECT_CREATED"
          | "COMPONENT_CREATED"
          | "MEMBER_JOINED"
          | "ORGANIZATION_INVITATION"
          | "PR_OPENED"
          | "PR_MERGED"
          | "PR_REVIEWED"
          | "AI_COMMITTED"
          | "WORKFLOW_FAILED"
          | "WORKFLOW_PASSED"
        title: string
        content: string
        isRead: boolean
        createdAt: string
        userId: string
        organizationId: string | null
        projectId: string | null
        componentId: string | null
        messageId: string | null
        linkUrl: string | null
      }
    }
  | {
      type: "notification.updated"
      at: string
      notification: {
        id: string
        type:
          | "NEW_MESSAGE"
          | "PROJECT_CREATED"
          | "COMPONENT_CREATED"
          | "MEMBER_JOINED"
          | "ORGANIZATION_INVITATION"
          | "PR_OPENED"
          | "PR_MERGED"
          | "PR_REVIEWED"
          | "AI_COMMITTED"
          | "WORKFLOW_FAILED"
          | "WORKFLOW_PASSED"
        title: string
        content: string
        isRead: boolean
        createdAt: string
        userId: string
        organizationId: string | null
        projectId: string | null
        componentId: string | null
        messageId: string | null
        linkUrl: string | null
      }
    }
  | { type: "notification.deleted"; at: string; notificationId: string; userId: string }
  | { type: "notification.readAll"; at: string; userId: string; count: number }
  | { type: "organizations.changed"; at: string; userId: string; organizationId: string }

export type EventsSubscribeAllOutput =
  | {
      type: "pr.opened"
      at: string
      projectId: string
      number: number
      title: string
      authorKind: "user" | "ai"
      head: string
      base: string
    }
  | { type: "pr.merged"; at: string; projectId: string; number: number; title: string }
  | { type: "pr.closed"; at: string; projectId: string; number: number }
  | {
      type: "pr.reviewed"
      at: string
      projectId: string
      number: number
      verdict: "comment" | "approve" | "request-changes"
    }
  | {
      type: "commit"
      at: string
      projectId: string
      oid: string
      branch: string
      authorKind: "user" | "ai"
      message: string
    }
  | {
      type: "workflow.started"
      at: string
      projectId: string
      runId: string
      workflow: string
      event: "push" | "pull-request" | "manual"
    }
  | {
      type: "workflow.finished"
      at: string
      projectId: string
      runId: string
      workflow: string
      status: "success" | "failure" | "cancelled"
    }
  | { type: "ai.session"; at: string; projectId: string; sessionId: string; phase: "started" | "finished" | "aborted" }
  | {
      type: "cam.progress"
      at: string
      projectId: string
      runId: string
      phase: "running" | "done" | "cancelled"
      stage?: "operations" | "post" | "replay" | "evidence" | undefined
      operationId?: string | undefined
      index?: number | undefined
      count?: number | undefined
    }
  | { type: "workspace.changed"; at: string; projectId: string }
  | { type: "server.connected"; at: string }
  | { type: "server.heartbeat"; at: string }
  | { type: "resources.changed"; userId: string; organizationId?: string | undefined; at: string }
  | { type: "catalogue.updated"; at: string }
  | {
      type: "notification.created"
      at: string
      notification: {
        id: string
        type:
          | "NEW_MESSAGE"
          | "PROJECT_CREATED"
          | "COMPONENT_CREATED"
          | "MEMBER_JOINED"
          | "ORGANIZATION_INVITATION"
          | "PR_OPENED"
          | "PR_MERGED"
          | "PR_REVIEWED"
          | "AI_COMMITTED"
          | "WORKFLOW_FAILED"
          | "WORKFLOW_PASSED"
        title: string
        content: string
        isRead: boolean
        createdAt: string
        userId: string
        organizationId: string | null
        projectId: string | null
        componentId: string | null
        messageId: string | null
        linkUrl: string | null
      }
    }
  | {
      type: "notification.updated"
      at: string
      notification: {
        id: string
        type:
          | "NEW_MESSAGE"
          | "PROJECT_CREATED"
          | "COMPONENT_CREATED"
          | "MEMBER_JOINED"
          | "ORGANIZATION_INVITATION"
          | "PR_OPENED"
          | "PR_MERGED"
          | "PR_REVIEWED"
          | "AI_COMMITTED"
          | "WORKFLOW_FAILED"
          | "WORKFLOW_PASSED"
        title: string
        content: string
        isRead: boolean
        createdAt: string
        userId: string
        organizationId: string | null
        projectId: string | null
        componentId: string | null
        messageId: string | null
        linkUrl: string | null
      }
    }
  | { type: "notification.deleted"; at: string; notificationId: string; userId: string }
  | { type: "notification.readAll"; at: string; userId: string; count: number }
  | { type: "organizations.changed"; at: string; userId: string; organizationId: string }

export type CompanionStatusOutput = {
  enabled: boolean
  port: number | null
  fingerprint: string | null
  host: string
  devices: Array<{ id: string; name: string; createdAt: string; lastSeen: string | null }>
}

export type CompanionEnableInput = { readonly port?: CompanionEnablePayload["port"] }

export type CompanionEnableOutput = {
  enabled: boolean
  port: number | null
  fingerprint: string | null
  host: string
  devices: Array<{ id: string; name: string; createdAt: string; lastSeen: string | null }>
}

export type CompanionDisableOutput = {
  enabled: boolean
  port: number | null
  fingerprint: string | null
  host: string
  devices: Array<{ id: string; name: string; createdAt: string; lastSeen: string | null }>
}

export type CompanionPairInput = {
  readonly name: CompanionPairPayload["name"]
  readonly host?: CompanionPairPayload["host"]
}

export type CompanionPairOutput = { id: string; link: string }

export type CompanionRevokeInput = { readonly id: { readonly id: string }["id"] }

export type CompanionRevokeOutput = {
  enabled: boolean
  port: number | null
  fingerprint: string | null
  host: string
  devices: Array<{ id: string; name: string; createdAt: string; lastSeen: string | null }>
}

export type WorkspaceDrawingsInput = { readonly id: { readonly id: string }["id"] }

export type WorkspaceDrawingsOutput = Array<{ id: string; name: string; subtitle: string | null; updatedAt: string }>

export type WorkspaceDrawingPreviewInput = {
  readonly id: { readonly id: string; readonly drawingId: string }["id"]
  readonly drawingId: { readonly id: string; readonly drawingId: string }["drawingId"]
}

export type WorkspaceDrawingPreviewOutput = {
  positions: Array<number>
  indices: Array<number>
  normals: Array<number>
  bounds: { min: [number, number, number]; max: [number, number, number] }
  parts: Array<{ id: string; name: string; triangleStart: number; triangleCount: number }>
  truncated: boolean
  revision: string
  features?: Array<{
    elementId: string
    name: string
    features: Array<{ id: string; type: string; parameters: Array<{ key: string; value: string }> }>
  }>
}

export type WorkspaceComponentsInput = { readonly id: { readonly id: string }["id"] }

export type WorkspaceComponentsOutput = Array<{ id: string; name: string; subtitle: string | null; updatedAt: string }>

export type WorkspaceComponentPreviewInput = {
  readonly id: { readonly id: string; readonly componentId: string }["id"]
  readonly componentId: { readonly id: string; readonly componentId: string }["componentId"]
}

export type WorkspaceComponentPreviewOutput = {
  positions: Array<number>
  indices: Array<number>
  normals: Array<number>
  bounds: { min: [number, number, number]; max: [number, number, number] }
  parts: Array<{ id: string; name: string; triangleStart: number; triangleCount: number }>
  truncated: boolean
  revision: string
  features?: Array<{
    elementId: string
    name: string
    features: Array<{ id: string; type: string; parameters: Array<{ key: string; value: string }> }>
  }>
  parameters: Array<{ key: string; value: string }>
}

export type WorkspaceToolpathsInput = { readonly id: { readonly id: string }["id"] }

export type WorkspaceToolpathsOutput = Array<{ id: string; name: string; subtitle: string | null; updatedAt: string }>

export type WorkspaceToolpathInput = {
  readonly id: { readonly id: string; readonly toolpathId: string }["id"]
  readonly toolpathId: { readonly id: string; readonly toolpathId: string }["toolpathId"]
}

export type WorkspaceToolpathOutput = {
  id: string
  name: string
  operationType: string | null
  gcode: string
  stats: { rapidMoves: number; linearMoves: number; circularMoves: number; machineFunctions: number }
  revision: string
  updatedAt: string
}

export type WorkspaceToolpathPreviewInput = {
  readonly id: { readonly id: string; readonly toolpathId: string }["id"]
  readonly toolpathId: { readonly id: string; readonly toolpathId: string }["toolpathId"]
}

export type WorkspaceToolpathPreviewOutput = {
  segments: Array<{
    kind: "rapid" | "linear" | "circular"
    line: number
    from: [number, number, number]
    to: [number, number, number]
  }>
  bounds: { min: [number, number, number]; max: [number, number, number] }
  stock: { min: [number, number, number]; max: [number, number, number] }
  truncated: boolean
  stats: { rapidMoves: number; linearMoves: number; circularMoves: number; machineFunctions: number }
  machine?: {
    kind: "mill" | "lathe" | "3dprinter"
    source: "override" | "kernel" | "generator" | "inferred" | "settings"
    mismatch?: { inferred: "mill" | "lathe" | "3dprinter"; reasons: Array<string> }
    axes: number
    turns: string
    workholding: string
    assumed: Array<"workholding" | "table" | "stock">
    xMode?: "diameter" | "radius"
    turret?: "rear" | "front"
    bodies: Array<{
      id: string
      role:
        | "stock"
        | "jaw"
        | "parallel"
        | "vise-base"
        | "clamp"
        | "table"
        | "chuck"
        | "collet"
        | "tailstock"
        | "bed"
        | "build-volume"
      shape:
        | { type: "box"; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
        | { type: "cylinder-x"; x0: number; x1: number; radius: number; inner: number }
        | { type: "cone-x"; x0: number; x1: number; r0: number; r1: number }
      rotateX?: number
      spins: boolean
      assumed: boolean
      obstacle: boolean
      wire?: boolean
    }>
    spin: Array<{ segment: number; rate: number }>
    collisions: Array<number>
    operations?: Array<{
      index: number
      name: string
      toolId: string
      startSegment: number
      endSegment: number
      cutter?: {
        diameter: number
        fluteLength: number
        shankDiameter: number
        stickout: number
        noseRadius: number
        holder: { diameter: number; length: number; kind: string; assumed: boolean }
      }
    }>
    events?: Array<{
      code: string
      severity: "error" | "warning"
      seconds: number
      segment: number
      line?: number
      message: string
    }>
    tool: {
      family: "mill" | "lathe" | "nozzle"
      diameter: number
      width: number
      noseRadius: number
      insert: string
      internal: boolean
      turret?: "rear" | "front"
    }
  }
  part?: {
    positions: Array<number>
    indices: Array<number>
    normals: Array<number>
    bounds: { min: [number, number, number]; max: [number, number, number] }
    parts: Array<{ id: string; name: string; triangleStart: number; triangleCount: number }>
    truncated: boolean
  }
  revision: string
}

export type WorkspaceLibraryInput = { readonly id: { readonly id: string }["id"] }

export type WorkspaceLibraryOutput = {
  materials: Array<{ id: string; name: string; subtitle: string | null; updatedAt: string }>
  tools: Array<{ id: string; name: string; subtitle: string | null; updatedAt: string }>
  machines: Array<{ id: string; name: string; subtitle: string | null; updatedAt: string }>
  components: Array<{ id: string; name: string; subtitle: string | null; updatedAt: string }>
}
