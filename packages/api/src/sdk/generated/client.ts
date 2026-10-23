import type {
  HealthCheckOutput,
  SystemReadyOutput,
  SystemVersionOutput,
  AuthIdentityStartOutput,
  AuthIdentityPollInput,
  AuthIdentityPollOutput,
  AuthIdentityCancelInput,
  AuthIdentityCancelOutput,
  AuthForgotPasswordInput,
  AuthForgotPasswordOutput,
  AuthResetPasswordInput,
  AuthResetPasswordOutput,
  AuthSendMagicLinkInput,
  AuthSendMagicLinkOutput,
  AuthSendVerificationEmailInput,
  AuthSendVerificationEmailOutput,
  AuthVerifyEmailInput,
  AuthVerifyEmailOutput,
  AuthSignoutOutput,
  AuthGetSessionOutput,
  AuthSigninDirectInput,
  AuthSigninDirectOutput,
  AuthSignupInput,
  AuthSignupOutput,
  AuthTestDirectCreateInput,
  AuthTestDirectCreateOutput,
  AuthVerifyMagicLinkInput,
  AuthVerifyMagicLinkOutput,
  AuthRegisterPasskeyOutput,
  WaitlistJoinInput,
  WaitlistJoinOutput,
  AnalyticsSystemMetricsOutput,
  AnalyticsIndexInput,
  AnalyticsIndexOutput,
  AnalyticsDashboardDataOutput,
  AnalyticsLogViewInput,
  AnalyticsLogViewOutput,
  AnalyticsRecentActivityInput,
  AnalyticsRecentActivityOutput,
  AnalyticsUserHistoryInput,
  AnalyticsUserHistoryOutput,
  AnalyticsUserMetricsInput,
  AnalyticsUserMetricsOutput,
  AnalyticsUserUsageInput,
  AnalyticsUserUsageOutput,
  AnalyticsClearUserUsageOutput,
  AnalyticsTrackInput,
  AnalyticsTrackOutput,
  UserProfileOutput,
  UserStatsOutput,
  UserComponentsOutput,
  UserProjectsOutput,
  UserToolpathsOutput,
  UserOrganizationsOutput,
  UserApiKeysOutput,
  UserCreateApiKeyInput,
  UserCreateApiKeyOutput,
  UserRevokeApiKeyInput,
  UserRevokeApiKeyOutput,
  UserDeleteAccountOutput,
  UserPasswordInput,
  UserPasswordOutput,
  UserTokensOutput,
  UserCreateTokenInput,
  UserCreateTokenOutput,
  UserVerifyChangeInput,
  UserVerifyChangeOutput,
  UserGitProfileOutput,
  UserUpdateGitProfileInput,
  UserUpdateGitProfileOutput,
  UserByIdInput,
  UserByIdOutput,
  AiActionsOutput,
  AiInvokeActionInput,
  AiInvokeActionOutput,
  AiIssueBridgeTokenInput,
  AiIssueBridgeTokenOutput,
  AiBridgeTokensOutput,
  AiRevokeBridgeTokenInput,
  AiRevokeBridgeTokenOutput,
  AiAgentsOutput,
  AiSessionControlInput,
  AiSessionControlOutput,
  AiSessionStateInput,
  AiSessionStateOutput,
  AiRemoveSessionInput,
  AiRemoveSessionOutput,
  AiMcpServersInput,
  AiMcpServersOutput,
  AiSaveMcpServerInput,
  AiSaveMcpServerOutput,
  AiDeleteMcpServerInput,
  AiDeleteMcpServerOutput,
  AiRemoveExtensionPluginInput,
  AiRemoveExtensionPluginOutput,
  AiExtensionPluginsOutput,
  AiInstallExtensionPluginInput,
  AiInstallExtensionPluginOutput,
  AiToggleExtensionPluginInput,
  AiToggleExtensionPluginOutput,
  AiExtensionModsOutput,
  AiToggleExtensionModInput,
  AiToggleExtensionModOutput,
  AiRemoveExtensionModInput,
  AiRemoveExtensionModOutput,
  AiModesOutput,
  AiSkillsOutput,
  AiSaveSkillInput,
  AiSaveSkillOutput,
  AiDeleteSkillInput,
  AiDeleteSkillOutput,
  AiSetCredentialsInput,
  AiSetCredentialsOutput,
  AiClearCredentialsInput,
  AiClearCredentialsOutput,
  AiStatusOutput,
  AiModelsInput,
  AiModelsOutput,
  AiProvidersOutput,
  AiRefreshModelsOutput,
  AiPromptsInput,
  AiPromptsOutput,
  AiTitleInput,
  AiTitleOutput,
  AiDesignAnalysisInput,
  AiDesignAnalysisOutput,
  AiMachiningParametersInput,
  AiMachiningParametersOutput,
  AiGcodeOptimizationInput,
  AiGcodeOptimizationOutput,
  AiDesignSuggestionsInput,
  AiDesignSuggestionsOutput,
  AiChatInput,
  AiChatOutput,
  AiChatStreamInput,
  AiChatStreamOutput,
  AiSessionPromptInput,
  AiSessionPromptOutput,
  AiSessionStreamInput,
  AiSessionStreamOutput,
  AiSessionListInput,
  AiSessionListOutput,
  AiSessionMessagesInput,
  AiSessionMessagesOutput,
  AiChatQueueInput,
  AiChatQueueOutput,
  AiChatAbortInput,
  AiChatAbortOutput,
  AiPermissionReplyInput,
  AiPermissionReplyOutput,
  AiCompletionInput,
  AiCompletionOutput,
  AiAnalyzeGcodeInput,
  AiAnalyzeGcodeOutput,
  AiGcodeInput,
  AiGcodeOutput,
  AiToolpathAnalysisInput,
  AiToolpathAnalysisOutput,
  AiFeedbackInput,
  AiFeedbackOutput,
  AiProxyInput,
  AiProxyOutput,
  AiOauthAuthorizeInput,
  AiOauthAuthorizeOutput,
  AiOauthCompleteInput,
  AiOauthCompleteOutput,
  McpListConfigInput,
  McpListConfigOutput,
  McpUpdateConfigInput,
  McpUpdateConfigOutput,
  McpRemoveConfigInput,
  McpRemoveConfigOutput,
  McpGetConfigInput,
  McpGetConfigOutput,
  McpRemoveConfigByIdInput,
  McpRemoveConfigByIdOutput,
  McpServerInfoInput,
  McpServerInfoOutput,
  BillingInfoInput,
  BillingInfoOutput,
  BillingCurrentOutput,
  BillingSubscribeInput,
  BillingSubscribeOutput,
  BillingPortalInput,
  BillingPortalOutput,
  BillingBaGetOutput,
  BillingBaCheckoutInput,
  BillingBaCheckoutOutput,
  BillingBaUpdateInput,
  BillingBaUpdateOutput,
  BillingBaCancelOutput,
  BillingBaPortalInput,
  BillingBaPortalOutput,
  BillingBaFeatureInput,
  BillingBaFeatureOutput,
  BillingBaSyncOutput,
  BillingCronGetInput,
  BillingCronGetOutput,
  BillingCronPostInput,
  BillingCronPostOutput,
  BillingStripeHealthOutput,
  MiscPushSubscribeInput,
  MiscPushSubscribeOutput,
  MiscPushUnsubscribeInput,
  MiscPushUnsubscribeOutput,
  MiscNotifyInput,
  MiscNotifyOutput,
  MiscDesktopSigninInput,
  MiscDesktopSigninOutput,
  MiscDesktopProjectsOutput,
  MiscDesktopCreateProjectInput,
  MiscDesktopCreateProjectOutput,
  MiscDesktopUserByEmailInput,
  MiscDesktopUserByEmailOutput,
  MiscTrackedGetInput,
  MiscTrackedGetOutput,
  MiscTrackedUpdateInput,
  MiscTrackedUpdateOutput,
  MiscTrackedRemoveInput,
  MiscTrackedRemoveOutput,
  KvListInput,
  KvListOutput,
  KvGetInput,
  KvGetOutput,
  KvSetInput,
  KvSetOutput,
  KvRemoveInput,
  KvRemoveOutput,
  ProductionCostsListEstimatesInput,
  ProductionCostsListEstimatesOutput,
  ProductionCostsCreateEstimateInput,
  ProductionCostsCreateEstimateOutput,
  ProductionCostsGetEstimateInput,
  ProductionCostsGetEstimateOutput,
  ProductionCostsUpdateEstimateInput,
  ProductionCostsUpdateEstimateOutput,
  ProductionCostsDeleteEstimateInput,
  ProductionCostsDeleteEstimateOutput,
  ProductionCostsCalculateEstimateInput,
  ProductionCostsCalculateEstimateOutput,
  ProductionCostsListMaterialCostsInput,
  ProductionCostsListMaterialCostsOutput,
  ProductionCostsCreateMaterialCostInput,
  ProductionCostsCreateMaterialCostOutput,
  ProductionCostsGetMaterialCostInput,
  ProductionCostsGetMaterialCostOutput,
  ProductionCostsUpdateMaterialCostInput,
  ProductionCostsUpdateMaterialCostOutput,
  ProductionCostsDeleteMaterialCostInput,
  ProductionCostsDeleteMaterialCostOutput,
  ProductionCostsListOperationCostsInput,
  ProductionCostsListOperationCostsOutput,
  ProductionCostsCreateOperationCostInput,
  ProductionCostsCreateOperationCostOutput,
  ProductionCostsGetOperationCostInput,
  ProductionCostsGetOperationCostOutput,
  ProductionCostsUpdateOperationCostInput,
  ProductionCostsUpdateOperationCostOutput,
  ProductionCostsDeleteOperationCostInput,
  ProductionCostsDeleteOperationCostOutput,
  ProductionCostsListToolWearInput,
  ProductionCostsListToolWearOutput,
  ProductionCostsCreateToolWearInput,
  ProductionCostsCreateToolWearOutput,
  ProductionCostsGetToolWearInput,
  ProductionCostsGetToolWearOutput,
  ProductionCostsUpdateToolWearInput,
  ProductionCostsUpdateToolWearOutput,
  ProductionCostsDeleteToolWearInput,
  ProductionCostsDeleteToolWearOutput,
  PluginsListOutput,
  PluginsGetInput,
  PluginsGetOutput,
  PluginsUninstallInput,
  PluginsUninstallOutput,
  PluginsGetConfigInput,
  PluginsGetConfigOutput,
  PluginsSetConfigInput,
  PluginsSetConfigOutput,
  PluginsUpdateConfigInput,
  PluginsUpdateConfigOutput,
  PluginsEnableInput,
  PluginsEnableOutput,
  PluginsDisableInput,
  PluginsDisableOutput,
  PluginsUpdateInput,
  PluginsUpdateOutput,
  PluginsPatchInput,
  PluginsPatchOutput,
  PluginsRegistryOutput,
  PluginsRegistryGetInput,
  PluginsRegistryGetOutput,
  PluginsRegistrySearchInput,
  PluginsRegistrySearchOutput,
  FilesUploadInput,
  FilesUploadOutput,
  OrganizationsListOutput,
  OrganizationsCreateInput,
  OrganizationsCreateOutput,
  OrganizationsGetInput,
  OrganizationsGetOutput,
  OrganizationsUpdateInput,
  OrganizationsUpdateOutput,
  OrganizationsRemoveInput,
  OrganizationsRemoveOutput,
  NotificationsListInput,
  NotificationsListOutput,
  NotificationsUpdateInput,
  NotificationsUpdateOutput,
  NotificationsRemoveInput,
  NotificationsRemoveOutput,
  NotificationsMarkAllReadOutput,
  ProjectsListOutput,
  ProjectsCreateInput,
  ProjectsCreateOutput,
  ProjectsGetInput,
  ProjectsGetOutput,
  ProjectsUpdateInput,
  ProjectsUpdateOutput,
  ProjectsRemoveInput,
  ProjectsRemoveOutput,
  MaterialsListInput,
  MaterialsListOutput,
  MaterialsCreateInput,
  MaterialsCreateOutput,
  MaterialsGetInput,
  MaterialsGetOutput,
  MaterialsUpdateInput,
  MaterialsUpdateOutput,
  MaterialsRemoveInput,
  MaterialsRemoveOutput,
  MaterialsStorageSaveInput,
  MaterialsStorageSaveOutput,
  MaterialsStorageReadInput,
  MaterialsStorageReadOutput,
  MaterialsStorageRemoveInput,
  MaterialsStorageRemoveOutput,
  MaterialsStorageExportInput,
  MaterialsStorageExportOutput,
  MaterialsStorageImportInput,
  MaterialsStorageImportOutput,
  ToolsListInput,
  ToolsListOutput,
  ToolsCreateInput,
  ToolsCreateOutput,
  ToolsGetInput,
  ToolsGetOutput,
  ToolsUpdateInput,
  ToolsUpdateOutput,
  ToolsRemoveInput,
  ToolsRemoveOutput,
  ToolsStorageSaveInput,
  ToolsStorageSaveOutput,
  ToolsStorageReadInput,
  ToolsStorageReadOutput,
  ToolsStorageRemoveInput,
  ToolsStorageRemoveOutput,
  ToolsStorageExportInput,
  ToolsStorageExportOutput,
  ToolsStorageImportInput,
  ToolsStorageImportOutput,
  ToolsStorageExportByIdInput,
  ToolsStorageExportByIdOutput,
  ToolsStorageImportByIdInput,
  ToolsStorageImportByIdOutput,
  MachineConfigsListInput,
  MachineConfigsListOutput,
  MachineConfigsCreateInput,
  MachineConfigsCreateOutput,
  MachineConfigsGetInput,
  MachineConfigsGetOutput,
  MachineConfigsUpdateInput,
  MachineConfigsUpdateOutput,
  MachineConfigsRemoveInput,
  MachineConfigsRemoveOutput,
  MachineConfigsCloneInput,
  MachineConfigsCloneOutput,
  MachineConfigsDefaultsOutput,
  MachineConfigsStorageSaveInput,
  MachineConfigsStorageSaveOutput,
  MachineConfigsStorageReadInput,
  MachineConfigsStorageReadOutput,
  MachineConfigsStorageRemoveInput,
  MachineConfigsStorageRemoveOutput,
  MachineConfigsStorageExportInput,
  MachineConfigsStorageExportOutput,
  MachineConfigsStorageImportInput,
  MachineConfigsStorageImportOutput,
  DrawingsGetInput,
  DrawingsGetOutput,
  DrawingsUpdateInput,
  DrawingsUpdateOutput,
  DrawingsRemoveInput,
  DrawingsRemoveOutput,
  DrawingsListForProjectInput,
  DrawingsListForProjectOutput,
  DrawingsCreateForProjectInput,
  DrawingsCreateForProjectOutput,
  ComponentsGetInput,
  ComponentsGetOutput,
  ComponentsUpdateInput,
  ComponentsUpdateOutput,
  ComponentsRemoveInput,
  ComponentsRemoveOutput,
  ComponentsListForProjectInput,
  ComponentsListForProjectOutput,
  ComponentsCreateForProjectInput,
  ComponentsCreateForProjectOutput,
  ToolpathsListInput,
  ToolpathsListOutput,
  ToolpathsCreateInput,
  ToolpathsCreateOutput,
  ToolpathsGetInput,
  ToolpathsGetOutput,
  ToolpathsUpdateInput,
  ToolpathsUpdateOutput,
  ToolpathsRemoveInput,
  ToolpathsRemoveOutput,
  ToolpathsListForDrawingInput,
  ToolpathsListForDrawingOutput,
  ToolpathsCreateForDrawingInput,
  ToolpathsCreateForDrawingOutput,
  ToolpathExtrasLibraryInput,
  ToolpathExtrasLibraryOutput,
  ToolpathExtrasListVersionsInput,
  ToolpathExtrasListVersionsOutput,
  ToolpathExtrasCreateVersionInput,
  ToolpathExtrasCreateVersionOutput,
  ToolpathExtrasRestoreVersionInput,
  ToolpathExtrasRestoreVersionOutput,
  ToolpathExtrasListCommentsInput,
  ToolpathExtrasListCommentsOutput,
  ToolpathExtrasCreateCommentInput,
  ToolpathExtrasCreateCommentOutput,
  ToolpathExtrasUpdateCommentInput,
  ToolpathExtrasUpdateCommentOutput,
  ToolpathExtrasRemoveCommentInput,
  ToolpathExtrasRemoveCommentOutput,
  ToolpathGeneratorManufactureInput,
  ToolpathGeneratorManufactureOutput,
  ToolpathGeneratorParseInput,
  ToolpathGeneratorParseOutput,
  ToolpathGeneratorVerifyInput,
  ToolpathGeneratorVerifyOutput,
  CadExactAnalyzeInput,
  CadExactAnalyzeOutput,
  CadExactStepInput,
  CadExactStepOutput,
  CadExactAssemblyInput,
  CadExactAssemblyOutput,
  LibraryListInput,
  LibraryListOutput,
  LibraryCreateInput,
  LibraryCreateOutput,
  LibraryGetInput,
  LibraryGetOutput,
  LibraryUpdateInput,
  LibraryUpdateOutput,
  LibraryRemoveInput,
  LibraryRemoveOutput,
  LibraryComponentsOutput,
  LibraryMaterialsOutput,
  LibraryToolsOutput,
  ProjectToolpathsListInput,
  ProjectToolpathsListOutput,
  VcsStatusInput,
  VcsStatusOutput,
  VcsLogInput,
  VcsLogOutput,
  VcsCommitInput,
  VcsCommitOutput,
  VcsBranchesInput,
  VcsBranchesOutput,
  VcsCreateBranchInput,
  VcsCreateBranchOutput,
  VcsCheckoutInput,
  VcsCheckoutOutput,
  VcsRestoreInput,
  VcsRestoreOutput,
  VcsDiffInput,
  VcsDiffOutput,
  VcsListPullRequestsInput,
  VcsListPullRequestsOutput,
  VcsOpenPullRequestInput,
  VcsOpenPullRequestOutput,
  VcsPullRequestInput,
  VcsPullRequestOutput,
  VcsReviewInput,
  VcsReviewOutput,
  VcsMergePullRequestInput,
  VcsMergePullRequestOutput,
  VcsClosePullRequestInput,
  VcsClosePullRequestOutput,
  VcsRemoteInput,
  VcsRemoteOutput,
  VcsSetRemoteInput,
  VcsSetRemoteOutput,
  VcsPushInput,
  VcsPushOutput,
  VcsPullInput,
  VcsPullOutput,
  VcsRunsInput,
  VcsRunsOutput,
  VcsDispatchInput,
  VcsDispatchOutput,
  VcsListWorkflowsInput,
  VcsListWorkflowsOutput,
  VcsWorkflowInput,
  VcsWorkflowOutput,
  EventsSubscribeInput,
  EventsSubscribeOutput,
  EventsSubscribeAllOutput,
  CompanionStatusOutput,
  CompanionEnableInput,
  CompanionEnableOutput,
  CompanionDisableOutput,
  CompanionPairInput,
  CompanionPairOutput,
  CompanionRedeemInput,
  CompanionRedeemOutput,
  CompanionRevokeInput,
  CompanionRevokeOutput,
  WorkspaceDrawingsInput,
  WorkspaceDrawingsOutput,
  WorkspaceDrawingPreviewInput,
  WorkspaceDrawingPreviewOutput,
  WorkspaceComponentsInput,
  WorkspaceComponentsOutput,
  WorkspaceComponentPreviewInput,
  WorkspaceComponentPreviewOutput,
  WorkspaceToolpathsInput,
  WorkspaceToolpathsOutput,
  WorkspaceToolpathInput,
  WorkspaceToolpathOutput,
  WorkspaceToolpathPreviewInput,
  WorkspaceToolpathPreviewOutput,
  WorkspaceLibraryInput,
  WorkspaceLibraryOutput,
} from "./types"
import { ClientError } from "./client-error"

export interface ClientOptions {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
  readonly headers?: RequestInit["headers"]
}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: RequestInit["headers"]
}

interface RequestDescriptor {
  readonly method: string
  readonly path: string
  readonly query?: Record<string, unknown>
  readonly headers?: Record<string, unknown>
  readonly body?: unknown
  readonly successStatus: number
  readonly declaredStatuses: ReadonlyArray<number>
  readonly responseHeaders?: ReadonlyArray<string>
  readonly errorHeaders?: { readonly [status: string]: ReadonlyArray<string> }
  readonly emptyErrors?: ReadonlyArray<number>
  readonly empty: boolean
}

const maxSseEventBytes = 16 * 1024 * 1024

export function make(options: ClientOptions) {
  const fetch = options.fetch ?? globalThis.fetch

  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    const url = new URL(descriptor.path, options.baseUrl)
    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)
    const headers = new Headers(options.headers)
    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {
      if (value !== undefined && value !== null) headers.set(key, String(value))
    }
    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)
    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    return {
      url,
      init: {
        method: descriptor.method,
        signal: requestOptions?.signal,
        headers,
        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),
      } satisfies RequestInit,
    }
  }

  const execute = async (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {
    try {
      const prepared = prepare(descriptor, requestOptions)
      return await fetch(prepared.url, prepared.init)
    } catch (cause) {
      throw new ClientError("Transport", { cause })
    }
  }

  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {
    if (descriptor.declaredStatuses.includes(response.status)) {
      const names = descriptor.errorHeaders?.[String(response.status)]
      if (descriptor.emptyErrors?.includes(response.status)) {
        try {
          await response.body?.cancel()
        } catch {}
        throw { headers: readDeclaredHeaders(response, names) ?? {} }
      }
      throw await json(response)
    }
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })
  }

  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {
    const response = await execute(descriptor, requestOptions)
    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)
    if (descriptor.empty) {
      try {
        await response.body?.cancel()
      } catch {}
      return attachDeclaredHeaders(undefined, response, descriptor.responseHeaders) as A
    }
    return attachDeclaredHeaders(await json(response), response, descriptor.responseHeaders) as A
  }

  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({
    async *[Symbol.asyncIterator]() {
      const response = await execute(descriptor, requestOptions)
      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)
      if (!isContentType(response, "text/event-stream")) {
        try {
          await response.body?.cancel()
        } catch {}
        throw new ClientError("UnsupportedContentType")
      }
      if (response.body === null) throw new ClientError("MalformedResponse")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (true) {
          let next
          try {
            next = await reader.read()
          } catch (cause) {
            throw new ClientError("Transport", { cause })
          }
          buffer += decoder.decode(next.value, { stream: !next.done })
          if (buffer.length > maxSseEventBytes) throw new ClientError("SseEventTooLarge")
          const trailingCarriageReturn = !next.done && buffer.endsWith("\r")
          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)
          buffer = buffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
          if (trailingCarriageReturn) buffer += "\r"
          if (next.done && buffer !== "") buffer += "\n\n"
          let boundary = buffer.indexOf("\n\n")
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = block
              .split("\n")
              .flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trimStart()] : []))
              .join("\n")
            if (data !== "") {
              try {
                yield JSON.parse(data) as A
              } catch (cause) {
                throw new ClientError("MalformedResponse", { cause })
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
          if (next.done) return
        }
      } finally {
        try {
          await reader.cancel()
        } catch {}
        reader.releaseLock()
      }
    },
  })

  return {
    health: {
      check: (requestOptions?: RequestOptions) =>
        request<HealthCheckOutput>(
          { method: "GET", path: `/api/health`, successStatus: 200, declaredStatuses: [], empty: false },
          requestOptions,
        ),
    },
    system: {
      ready: (requestOptions?: RequestOptions) =>
        request<SystemReadyOutput>(
          { method: "GET", path: `/health`, successStatus: 200, declaredStatuses: [401], empty: false },
          requestOptions,
        ),
      version: (requestOptions?: RequestOptions) =>
        request<SystemVersionOutput>(
          { method: "GET", path: `/version`, successStatus: 200, declaredStatuses: [401], empty: false },
          requestOptions,
        ),
    },
    auth: {
      identityStart: (requestOptions?: RequestOptions) =>
        request<AuthIdentityStartOutput>(
          {
            method: "POST",
            path: `/api/auth/identity/start`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      identityPoll: (input: AuthIdentityPollInput, requestOptions?: RequestOptions) =>
        request<AuthIdentityPollOutput>(
          {
            method: "POST",
            path: `/api/auth/identity/poll`,
            body: { id: input["id"] },
            successStatus: 200,
            declaredStatuses: [400, 401],
            empty: false,
          },
          requestOptions,
        ),
      identityCancel: (input: AuthIdentityCancelInput, requestOptions?: RequestOptions) =>
        request<AuthIdentityCancelOutput>(
          {
            method: "POST",
            path: `/api/auth/identity/cancel`,
            body: { id: input["id"] },
            successStatus: 200,
            declaredStatuses: [401],
            empty: false,
          },
          requestOptions,
        ),
      forgotPassword: (input?: AuthForgotPasswordInput, requestOptions?: RequestOptions) =>
        request<AuthForgotPasswordOutput>(
          {
            method: "POST",
            path: `/api/auth/forgot-password`,
            body: { email: input?.["email"], callbackURL: input?.["callbackURL"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      resetPassword: (input?: AuthResetPasswordInput, requestOptions?: RequestOptions) =>
        request<AuthResetPasswordOutput>(
          {
            method: "POST",
            path: `/api/auth/reset-password`,
            body: {
              token: input?.["token"],
              newPassword: input?.["newPassword"],
              confirmPassword: input?.["confirmPassword"],
            },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sendMagicLink: (input?: AuthSendMagicLinkInput, requestOptions?: RequestOptions) =>
        request<AuthSendMagicLinkOutput>(
          {
            method: "POST",
            path: `/api/auth/send-magic-link`,
            body: { email: input?.["email"], callbackURL: input?.["callbackURL"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sendVerificationEmail: (input?: AuthSendVerificationEmailInput, requestOptions?: RequestOptions) =>
        request<AuthSendVerificationEmailOutput>(
          {
            method: "POST",
            path: `/api/auth/send-verification-email`,
            body: { email: input?.["email"], callbackURL: input?.["callbackURL"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      verifyEmail: (input?: AuthVerifyEmailInput, requestOptions?: RequestOptions) =>
        request<AuthVerifyEmailOutput>(
          {
            method: "POST",
            path: `/api/auth/verify-email`,
            body: { token: input?.["token"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      signout: (requestOptions?: RequestOptions) =>
        request<AuthSignoutOutput>(
          {
            method: "POST",
            path: `/api/auth/signout`,
            successStatus: 200,
            declaredStatuses: [401],
            responseHeaders: ["set-cookie"],
            empty: false,
          },
          requestOptions,
        ),
      getSession: (requestOptions?: RequestOptions) =>
        request<AuthGetSessionOutput>(
          {
            method: "GET",
            path: `/api/auth/get-session`,
            successStatus: 200,
            declaredStatuses: [401, 500],
            empty: false,
          },
          requestOptions,
        ),
      signinDirect: (input?: AuthSigninDirectInput, requestOptions?: RequestOptions) =>
        request<AuthSigninDirectOutput>(
          {
            method: "POST",
            path: `/api/auth/signin-direct`,
            body: { email: input?.["email"], password: input?.["password"] },
            successStatus: 200,
            declaredStatuses: [400, 401, 404, 500],
            responseHeaders: ["set-cookie"],
            empty: false,
          },
          requestOptions,
        ),
      signup: (input?: AuthSignupInput, requestOptions?: RequestOptions) =>
        request<AuthSignupOutput>(
          {
            method: "POST",
            path: `/api/auth/signup`,
            body: {
              email: input?.["email"],
              password: input?.["password"],
              confirmPassword: input?.["confirmPassword"],
              name: input?.["name"],
            },
            successStatus: 201,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      testDirectCreate: (input?: AuthTestDirectCreateInput, requestOptions?: RequestOptions) =>
        request<AuthTestDirectCreateOutput>(
          {
            method: "POST",
            path: `/api/auth/test-direct-create`,
            body: { email: input?.["email"], password: input?.["password"], name: input?.["name"] },
            successStatus: 201,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      verifyMagicLink: (input?: AuthVerifyMagicLinkInput, requestOptions?: RequestOptions) =>
        request<AuthVerifyMagicLinkOutput>(
          {
            method: "POST",
            path: `/api/auth/verify-magic-link`,
            body: { token: input?.["token"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            responseHeaders: ["set-cookie"],
            empty: false,
          },
          requestOptions,
        ),
      registerPasskey: (requestOptions?: RequestOptions) =>
        request<AuthRegisterPasskeyOutput>(
          {
            method: "POST",
            path: `/api/auth/passkey-register`,
            successStatus: 200,
            declaredStatuses: [501, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    waitlist: {
      join: (input: WaitlistJoinInput, requestOptions?: RequestOptions) =>
        request<WaitlistJoinOutput>(
          {
            method: "POST",
            path: `/api/waitlist`,
            body: { email: input["email"] },
            successStatus: 201,
            declaredStatuses: [400, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    analytics: {
      systemMetrics: (requestOptions?: RequestOptions) =>
        request<AnalyticsSystemMetricsOutput>(
          {
            method: "GET",
            path: `/api/analytics/system-metrics`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      index: (input?: AnalyticsIndexInput, requestOptions?: RequestOptions) =>
        request<AnalyticsIndexOutput>(
          {
            method: "GET",
            path: `/api/analytics`,
            query: {
              startDate: input?.["startDate"],
              endDate: input?.["endDate"],
              itemType: input?.["itemType"],
              action: input?.["action"],
              groupBy: input?.["groupBy"],
              userFilter: input?.["userFilter"],
            },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      dashboardData: (requestOptions?: RequestOptions) =>
        request<AnalyticsDashboardDataOutput>(
          {
            method: "GET",
            path: `/api/analytics/dashboard-data`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      logView: (input?: AnalyticsLogViewInput, requestOptions?: RequestOptions) =>
        request<AnalyticsLogViewOutput>(
          {
            method: "POST",
            path: `/api/analytics/log-view`,
            body: { path: input?.["path"], query: input?.["query"] },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      recentActivity: (input?: AnalyticsRecentActivityInput, requestOptions?: RequestOptions) =>
        request<AnalyticsRecentActivityOutput>(
          {
            method: "GET",
            path: `/api/analytics/recent-activity`,
            query: { limit: input?.["limit"] },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      userHistory: (input?: AnalyticsUserHistoryInput, requestOptions?: RequestOptions) =>
        request<AnalyticsUserHistoryOutput>(
          {
            method: "GET",
            path: `/api/analytics/user-history`,
            query: {
              limit: input?.["limit"],
              offset: input?.["offset"],
              itemType: input?.["itemType"],
              action: input?.["action"],
              startDate: input?.["startDate"],
              endDate: input?.["endDate"],
            },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      userMetrics: (input?: AnalyticsUserMetricsInput, requestOptions?: RequestOptions) =>
        request<AnalyticsUserMetricsOutput>(
          {
            method: "GET",
            path: `/api/analytics/user-metrics`,
            query: {
              startDate: input?.["startDate"],
              endDate: input?.["endDate"],
              groupBy: input?.["groupBy"],
              metric: input?.["metric"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      userUsage: (input?: AnalyticsUserUsageInput, requestOptions?: RequestOptions) =>
        request<AnalyticsUserUsageOutput>(
          {
            method: "GET",
            path: `/api/analytics/user-usage`,
            query: {
              userId: input?.["userId"],
              startDate: input?.["startDate"],
              endDate: input?.["endDate"],
              period: input?.["period"],
            },
            successStatus: 200,
            declaredStatuses: [403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      clearUserUsage: (requestOptions?: RequestOptions) =>
        request<AnalyticsClearUserUsageOutput>(
          {
            method: "DELETE",
            path: `/api/analytics/user-usage`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      track: (input?: AnalyticsTrackInput, requestOptions?: RequestOptions) =>
        request<AnalyticsTrackOutput>(
          {
            method: "POST",
            path: `/api/analytics/track`,
            body: {
              itemId: input?.["itemId"],
              itemType: input?.["itemType"],
              action: input?.["action"],
              details: input?.["details"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    user: {
      profile: (requestOptions?: RequestOptions) =>
        request<UserProfileOutput>(
          {
            method: "GET",
            path: `/api/user/profile`,
            successStatus: 200,
            declaredStatuses: [404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      stats: (requestOptions?: RequestOptions) =>
        request<UserStatsOutput>(
          { method: "GET", path: `/api/user/stats`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      components: (requestOptions?: RequestOptions) =>
        request<UserComponentsOutput>(
          {
            method: "GET",
            path: `/api/user/components`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      projects: (requestOptions?: RequestOptions) =>
        request<UserProjectsOutput>(
          { method: "GET", path: `/api/user/projects`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      toolpaths: (requestOptions?: RequestOptions) =>
        request<UserToolpathsOutput>(
          {
            method: "GET",
            path: `/api/user/toolpaths`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      organizations: (requestOptions?: RequestOptions) =>
        request<UserOrganizationsOutput>(
          {
            method: "GET",
            path: `/api/user/organizations`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      apiKeys: (requestOptions?: RequestOptions) =>
        request<UserApiKeysOutput>(
          { method: "GET", path: `/api/user/api-keys`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      createApiKey: (input?: UserCreateApiKeyInput, requestOptions?: RequestOptions) =>
        request<UserCreateApiKeyOutput>(
          {
            method: "POST",
            path: `/api/user/api-keys`,
            body: { name: input?.["name"] },
            successStatus: 201,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      revokeApiKey: (input?: UserRevokeApiKeyInput, requestOptions?: RequestOptions) =>
        request<UserRevokeApiKeyOutput>(
          {
            method: "DELETE",
            path: `/api/user/api-keys`,
            query: { keyId: input?.["keyId"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      deleteAccount: (requestOptions?: RequestOptions) =>
        request<UserDeleteAccountOutput>(
          {
            method: "DELETE",
            path: `/api/user/delete-account`,
            successStatus: 200,
            declaredStatuses: [404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      password: (input?: UserPasswordInput, requestOptions?: RequestOptions) =>
        request<UserPasswordOutput>(
          {
            method: "PUT",
            path: `/api/user/password`,
            body: { currentPassword: input?.["currentPassword"], newPassword: input?.["newPassword"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      tokens: (requestOptions?: RequestOptions) =>
        request<UserTokensOutput>(
          { method: "GET", path: `/api/user/tokens`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      createToken: (input?: UserCreateTokenInput, requestOptions?: RequestOptions) =>
        request<UserCreateTokenOutput>(
          {
            method: "POST",
            path: `/api/user/tokens`,
            body: { name: input?.["name"], permissions: input?.["permissions"], expiresIn: input?.["expiresIn"] },
            successStatus: 201,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      verifyChange: (input?: UserVerifyChangeInput, requestOptions?: RequestOptions) =>
        request<UserVerifyChangeOutput>(
          {
            method: "GET",
            path: `/api/user/verify-change`,
            query: { token: input?.["token"], type: input?.["type"], password: input?.["password"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      gitProfile: (requestOptions?: RequestOptions) =>
        request<UserGitProfileOutput>(
          {
            method: "GET",
            path: `/api/user/git-profile`,
            successStatus: 200,
            declaredStatuses: [404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateGitProfile: (input: UserUpdateGitProfileInput, requestOptions?: RequestOptions) =>
        request<UserUpdateGitProfileOutput>(
          {
            method: "PUT",
            path: `/api/user/git-profile`,
            body: { name: input["name"], email: input["email"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      byId: (input: UserByIdInput, requestOptions?: RequestOptions) =>
        request<UserByIdOutput>(
          {
            method: "GET",
            path: `/api/user/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    ai: {
      actions: (requestOptions?: RequestOptions) =>
        request<AiActionsOutput>(
          { method: "GET", path: `/api/ai/actions`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      invokeAction: (input: AiInvokeActionInput, requestOptions?: RequestOptions) =>
        request<AiInvokeActionOutput>(
          {
            method: "POST",
            path: `/api/ai/actions/invoke`,
            body: {
              projectId: input["projectId"],
              drawingId: input["drawingId"],
              tool: input["tool"],
              input: input["input"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      issueBridgeToken: (input: AiIssueBridgeTokenInput, requestOptions?: RequestOptions) =>
        request<AiIssueBridgeTokenOutput>(
          {
            method: "POST",
            path: `/api/ai/bridge/tokens`,
            body: { name: input["name"], projectId: input["projectId"], mode: input["mode"], days: input["days"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      bridgeTokens: (requestOptions?: RequestOptions) =>
        request<AiBridgeTokensOutput>(
          {
            method: "GET",
            path: `/api/ai/bridge/tokens`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      revokeBridgeToken: (input: AiRevokeBridgeTokenInput, requestOptions?: RequestOptions) =>
        request<AiRevokeBridgeTokenOutput>(
          {
            method: "DELETE",
            path: `/api/ai/bridge/tokens/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      agents: (requestOptions?: RequestOptions) =>
        request<AiAgentsOutput>(
          { method: "GET", path: `/api/ai/agents`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      sessionControl: (input: AiSessionControlInput, requestOptions?: RequestOptions) =>
        request<AiSessionControlOutput>(
          {
            method: "POST",
            path: `/api/ai/sessions/control`,
            body: {
              sessionId: input["sessionId"],
              projectId: input["projectId"],
              action: input["action"],
              taskId: input["taskId"],
              requestId: input["requestId"],
              answers: input["answers"],
              decision: input["decision"],
              model: input["model"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sessionState: (input: AiSessionStateInput, requestOptions?: RequestOptions) =>
        request<AiSessionStateOutput>(
          {
            method: "POST",
            path: `/api/ai/sessions/state`,
            body: { sessionId: input["sessionId"], projectId: input["projectId"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      removeSession: (input: AiRemoveSessionInput, requestOptions?: RequestOptions) =>
        request<AiRemoveSessionOutput>(
          {
            method: "POST",
            path: `/api/ai/sessions/remove`,
            body: { sessionId: input["sessionId"], projectId: input["projectId"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      mcpServers: (input: AiMcpServersInput, requestOptions?: RequestOptions) =>
        request<AiMcpServersOutput>(
          {
            method: "GET",
            path: `/api/ai/extensions/mcp`,
            query: { projectId: input["projectId"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      saveMcpServer: (input: AiSaveMcpServerInput, requestOptions?: RequestOptions) =>
        request<AiSaveMcpServerOutput>(
          {
            method: "PUT",
            path: `/api/ai/extensions/mcp`,
            body: { projectId: input["projectId"], name: input["name"], config: input["config"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      deleteMcpServer: (input: AiDeleteMcpServerInput, requestOptions?: RequestOptions) =>
        request<AiDeleteMcpServerOutput>(
          {
            method: "DELETE",
            path: `/api/ai/extensions/mcp/${encodeURIComponent(input.name)}`,
            query: { projectId: input["projectId"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      removeExtensionPlugin: (input: AiRemoveExtensionPluginInput, requestOptions?: RequestOptions) =>
        request<AiRemoveExtensionPluginOutput>(
          {
            method: "DELETE",
            path: `/api/ai/extensions/plugins/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      extensionPlugins: (requestOptions?: RequestOptions) =>
        request<AiExtensionPluginsOutput>(
          {
            method: "GET",
            path: `/api/ai/extensions/plugins`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      installExtensionPlugin: (input: AiInstallExtensionPluginInput, requestOptions?: RequestOptions) =>
        request<AiInstallExtensionPluginOutput>(
          {
            method: "POST",
            path: `/api/ai/extensions/plugins`,
            body: { manifest: input["manifest"], source: input["source"], files: input["files"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      toggleExtensionPlugin: (input: AiToggleExtensionPluginInput, requestOptions?: RequestOptions) =>
        request<AiToggleExtensionPluginOutput>(
          {
            method: "PUT",
            path: `/api/ai/extensions/plugins/${encodeURIComponent(input.id)}`,
            body: { enabled: input["enabled"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      extensionMods: (requestOptions?: RequestOptions) =>
        request<AiExtensionModsOutput>(
          {
            method: "GET",
            path: `/api/ai/extensions/mods`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      toggleExtensionMod: (input: AiToggleExtensionModInput, requestOptions?: RequestOptions) =>
        request<AiToggleExtensionModOutput>(
          {
            method: "PUT",
            path: `/api/ai/extensions/mods/${encodeURIComponent(input.id)}`,
            body: { enabled: input["enabled"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      removeExtensionMod: (input: AiRemoveExtensionModInput, requestOptions?: RequestOptions) =>
        request<AiRemoveExtensionModOutput>(
          {
            method: "DELETE",
            path: `/api/ai/extensions/mods/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      modes: (requestOptions?: RequestOptions) =>
        request<AiModesOutput>(
          { method: "GET", path: `/api/ai/modes`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      skills: (requestOptions?: RequestOptions) =>
        request<AiSkillsOutput>(
          { method: "GET", path: `/api/ai/skills`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      saveSkill: (input?: AiSaveSkillInput, requestOptions?: RequestOptions) =>
        request<AiSaveSkillOutput>(
          {
            method: "PUT",
            path: `/api/ai/skills`,
            body: {
              markdown: input?.["markdown"],
              name: input?.["name"],
              description: input?.["description"],
              body: input?.["body"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      deleteSkill: (input: AiDeleteSkillInput, requestOptions?: RequestOptions) =>
        request<AiDeleteSkillOutput>(
          {
            method: "DELETE",
            path: `/api/ai/skills/${encodeURIComponent(input.name)}`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      setCredentials: (input?: AiSetCredentialsInput, requestOptions?: RequestOptions) =>
        request<AiSetCredentialsOutput>(
          {
            method: "PUT",
            path: `/api/ai/credentials`,
            body: { provider: input?.["provider"], key: input?.["key"], baseUrl: input?.["baseUrl"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      clearCredentials: (input: AiClearCredentialsInput, requestOptions?: RequestOptions) =>
        request<AiClearCredentialsOutput>(
          {
            method: "DELETE",
            path: `/api/ai/credentials/${encodeURIComponent(input.provider)}`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      status: (requestOptions?: RequestOptions) =>
        request<AiStatusOutput>(
          { method: "GET", path: `/api/ai/status`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      models: (input?: AiModelsInput, requestOptions?: RequestOptions) =>
        request<AiModelsOutput>(
          {
            method: "GET",
            path: `/api/ai/models`,
            query: { configuredOnly: input?.["configuredOnly"] },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      providers: (requestOptions?: RequestOptions) =>
        request<AiProvidersOutput>(
          { method: "GET", path: `/api/ai/providers`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      refreshModels: (requestOptions?: RequestOptions) =>
        request<AiRefreshModelsOutput>(
          {
            method: "POST",
            path: `/api/ai/models/refresh`,
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      prompts: (input?: AiPromptsInput, requestOptions?: RequestOptions) =>
        request<AiPromptsOutput>(
          {
            method: "GET",
            path: `/api/ai/prompts`,
            query: { mode: input?.["mode"] },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      title: (input?: AiTitleInput, requestOptions?: RequestOptions) =>
        request<AiTitleOutput>(
          {
            method: "POST",
            path: `/api/ai/title`,
            body: { excerpt: input?.["excerpt"], model: input?.["model"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      designAnalysis: (input?: AiDesignAnalysisInput, requestOptions?: RequestOptions) =>
        request<AiDesignAnalysisOutput>(
          {
            method: "POST",
            path: `/api/ai/design-analysis`,
            body: {
              description: input?.["description"],
              layer: input?.["layer"],
              machine: input?.["machine"],
              model: input?.["model"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      machiningParameters: (input?: AiMachiningParametersInput, requestOptions?: RequestOptions) =>
        request<AiMachiningParametersOutput>(
          {
            method: "POST",
            path: `/api/ai/machining-parameters`,
            body: {
              material: input?.["material"],
              tool: input?.["tool"],
              operation: input?.["operation"],
              machine: input?.["machine"],
              model: input?.["model"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      gcodeOptimization: (input?: AiGcodeOptimizationInput, requestOptions?: RequestOptions) =>
        request<AiGcodeOptimizationOutput>(
          {
            method: "POST",
            path: `/api/ai/gcode-optimization`,
            body: {
              gcode: input?.["gcode"],
              material: input?.["material"],
              machineType: input?.["machineType"],
              constraints: input?.["constraints"],
              model: input?.["model"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      designSuggestions: (input?: AiDesignSuggestionsInput, requestOptions?: RequestOptions) =>
        request<AiDesignSuggestionsOutput>(
          {
            method: "POST",
            path: `/api/ai/design-suggestions`,
            body: {
              elements: input?.["elements"],
              currentOperation: input?.["currentOperation"],
              currentTool: input?.["currentTool"],
              model: input?.["model"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      chat: (input?: AiChatInput, requestOptions?: RequestOptions) =>
        request<AiChatOutput>(
          {
            method: "POST",
            path: `/api/ai/chat`,
            body: {
              messages: input?.["messages"],
              mcpServerId: input?.["mcpServerId"],
              mcpReference: input?.["mcpReference"],
            },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      chatStream: (input?: AiChatStreamInput, requestOptions?: RequestOptions): AsyncIterable<AiChatStreamOutput> =>
        sse<AiChatStreamOutput>(
          {
            method: "POST",
            path: `/api/ai/chat/stream`,
            body: {
              permissionMode: input?.["permissionMode"],
              agent: input?.["agent"],
              mode: input?.["mode"],
              attachments: input?.["attachments"],
              message: input?.["message"],
              sessionId: input?.["sessionId"],
              projectId: input?.["projectId"],
              drawingId: input?.["drawingId"],
              context: input?.["context"],
              includeContext: input?.["includeContext"],
              model: input?.["model"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sessionPrompt: (input?: AiSessionPromptInput, requestOptions?: RequestOptions) =>
        request<AiSessionPromptOutput>(
          {
            method: "POST",
            path: `/api/ai/sessions/prompt`,
            body: {
              permissionMode: input?.["permissionMode"],
              agent: input?.["agent"],
              mode: input?.["mode"],
              attachments: input?.["attachments"],
              message: input?.["message"],
              sessionId: input?.["sessionId"],
              projectId: input?.["projectId"],
              drawingId: input?.["drawingId"],
              context: input?.["context"],
              includeContext: input?.["includeContext"],
              model: input?.["model"],
            },
            successStatus: 200,
            declaredStatuses: [400, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sessionStream: (
        input: AiSessionStreamInput,
        requestOptions?: RequestOptions,
      ): AsyncIterable<AiSessionStreamOutput> =>
        sse<AiSessionStreamOutput>(
          {
            method: "GET",
            path: `/api/ai/sessions/${encodeURIComponent(input.sessionId)}/stream`,
            query: { after: input["after"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sessionList: (input: AiSessionListInput, requestOptions?: RequestOptions) =>
        request<AiSessionListOutput>(
          {
            method: "GET",
            path: `/api/ai/sessions`,
            query: { projectId: input["projectId"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      sessionMessages: (input: AiSessionMessagesInput, requestOptions?: RequestOptions) =>
        request<AiSessionMessagesOutput>(
          {
            method: "GET",
            path: `/api/ai/sessions/${encodeURIComponent(input.sessionId)}/messages`,
            query: { before: input["before"], limit: input["limit"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      chatQueue: (input: AiChatQueueInput, requestOptions?: RequestOptions) =>
        request<AiChatQueueOutput>(
          {
            method: "POST",
            path: `/api/ai/chat/queue`,
            body: {
              sessionId: input["sessionId"],
              message: input["message"],
              projectId: input["projectId"],
              delivery: input["delivery"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      chatAbort: (input?: AiChatAbortInput, requestOptions?: RequestOptions) =>
        request<AiChatAbortOutput>(
          {
            method: "POST",
            path: `/api/ai/chat/abort`,
            body: { sessionId: input?.["sessionId"], projectId: input?.["projectId"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      permissionReply: (input: AiPermissionReplyInput, requestOptions?: RequestOptions) =>
        request<AiPermissionReplyOutput>(
          {
            method: "POST",
            path: `/api/ai/permission/reply`,
            body: {
              sessionId: input["sessionId"],
              projectId: input["projectId"],
              requestId: input["requestId"],
              decision: input["decision"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      completion: (input?: AiCompletionInput, requestOptions?: RequestOptions) =>
        request<AiCompletionOutput>(
          {
            method: "POST",
            path: `/api/ai/completion`,
            body: {
              prompt: input?.["prompt"],
              systemPrompt: input?.["systemPrompt"],
              model: input?.["model"],
              temperature: input?.["temperature"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      analyzeGcode: (input?: AiAnalyzeGcodeInput, requestOptions?: RequestOptions) =>
        request<AiAnalyzeGcodeOutput>(
          {
            method: "POST",
            path: `/api/ai/analyze-gcode`,
            body: { gcode: input?.["gcode"], model: input?.["model"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      gcode: (input?: AiGcodeInput, requestOptions?: RequestOptions) =>
        request<AiGcodeOutput>(
          {
            method: "POST",
            path: `/api/ai/gcode`,
            body: {
              action: input?.["action"],
              gcode: input?.["gcode"],
              partialCode: input?.["partialCode"],
              machineType: input?.["machineType"],
              material: input?.["material"],
              model: input?.["model"],
              options: input?.["options"],
              description: input?.["description"],
              toolpathType: input?.["toolpathType"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      toolpathAnalysis: (input?: AiToolpathAnalysisInput, requestOptions?: RequestOptions) =>
        request<AiToolpathAnalysisOutput>(
          {
            method: "POST",
            path: `/api/ai/toolpath-analysis`,
            body: { gcode: input?.["gcode"], model: input?.["model"], max_tokens: input?.["max_tokens"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      feedback: (input?: AiFeedbackInput, requestOptions?: RequestOptions) =>
        request<AiFeedbackOutput>(
          {
            method: "POST",
            path: `/api/ai/feedback`,
            body: { messageId: input?.["messageId"], rating: input?.["rating"], comment: input?.["comment"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      proxy: (input?: AiProxyInput, requestOptions?: RequestOptions) =>
        request<AiProxyOutput>(
          {
            method: "POST",
            path: `/api/ai/proxy`,
            body: {
              model: input?.["model"],
              messages: input?.["messages"],
              max_tokens: input?.["max_tokens"],
              temperature: input?.["temperature"],
              system: input?.["system"],
              reasoning: input?.["reasoning"],
            },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      oauthAuthorize: (input: AiOauthAuthorizeInput, requestOptions?: RequestOptions) =>
        request<AiOauthAuthorizeOutput>(
          {
            method: "POST",
            path: `/api/ai/oauth/authorize`,
            body: { provider: input["provider"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      oauthComplete: (input: AiOauthCompleteInput, requestOptions?: RequestOptions) =>
        request<AiOauthCompleteOutput>(
          {
            method: "POST",
            path: `/api/ai/oauth/complete`,
            body: { provider: input["provider"], attemptId: input["attemptId"], code: input["code"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    mcp: {
      listConfig: (input?: McpListConfigInput, requestOptions?: RequestOptions) =>
        request<McpListConfigOutput>(
          {
            method: "GET",
            path: `/api/mcp/config`,
            query: { source: input?.["source"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateConfig: (input?: McpUpdateConfigInput, requestOptions?: RequestOptions) =>
        request<McpUpdateConfigOutput>(
          {
            method: "PUT",
            path: `/api/mcp/config`,
            query: { source: input?.["source"] },
            body: {
              id: input?.["id"],
              name: input?.["name"],
              type: input?.["type"],
              url: input?.["url"],
              command: input?.["command"],
              args: input?.["args"],
              workingDirectory: input?.["workingDirectory"],
              defaultWorkingDirectory: input?.["defaultWorkingDirectory"],
              enabled: input?.["enabled"],
              serverName: input?.["serverName"],
              testConnection: input?.["testConnection"],
              mcpServers: input?.["mcpServers"],
              tool_configuration: input?.["tool_configuration"],
              authorization_token: input?.["authorization_token"],
            },
            successStatus: 200,
            declaredStatuses: [400, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      removeConfig: (input?: McpRemoveConfigInput, requestOptions?: RequestOptions) =>
        request<McpRemoveConfigOutput>(
          {
            method: "DELETE",
            path: `/api/mcp/config`,
            query: { source: input?.["source"], name: input?.["name"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      getConfig: (input: McpGetConfigInput, requestOptions?: RequestOptions) =>
        request<McpGetConfigOutput>(
          {
            method: "GET",
            path: `/api/mcp/config/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      removeConfigById: (input: McpRemoveConfigByIdInput, requestOptions?: RequestOptions) =>
        request<McpRemoveConfigByIdOutput>(
          {
            method: "DELETE",
            path: `/api/mcp/config/${encodeURIComponent(input.id)}`,
            successStatus: 204,
            declaredStatuses: [400, 404, 405, 500, 401],
            empty: true,
          },
          requestOptions,
        ),
      serverInfo: (input?: McpServerInfoInput, requestOptions?: RequestOptions) =>
        request<McpServerInfoOutput>(
          {
            method: "POST",
            path: `/api/mcp/server-info`,
            body: { serverId: input?.["serverId"] },
            successStatus: 200,
            declaredStatuses: [405, 400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    billing: {
      info: (input?: BillingInfoInput, requestOptions?: RequestOptions) =>
        request<BillingInfoOutput>(
          {
            method: "GET",
            path: `/api/subscription/info`,
            query: { userId: input?.["userId"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      current: (requestOptions?: RequestOptions) =>
        request<BillingCurrentOutput>(
          { method: "GET", path: `/api/subscriptions`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      subscribe: (input?: BillingSubscribeInput, requestOptions?: RequestOptions) =>
        request<BillingSubscribeOutput>(
          {
            method: "POST",
            path: `/api/subscriptions`,
            body: { priceId: input?.["priceId"], startTrial: input?.["startTrial"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      portal: (input?: BillingPortalInput, requestOptions?: RequestOptions) =>
        request<BillingPortalOutput>(
          {
            method: "POST",
            path: `/api/subscriptions/portal`,
            body: { returnUrl: input?.["returnUrl"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      baGet: (requestOptions?: RequestOptions) =>
        request<BillingBaGetOutput>(
          {
            method: "GET",
            path: `/api/better-auth-stripe/subscription`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      baCheckout: (input?: BillingBaCheckoutInput, requestOptions?: RequestOptions) =>
        request<BillingBaCheckoutOutput>(
          {
            method: "POST",
            path: `/api/better-auth-stripe/subscription`,
            body: {
              plan: input?.["plan"],
              successUrl: input?.["successUrl"],
              cancelUrl: input?.["cancelUrl"],
              trialDays: input?.["trialDays"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      baUpdate: (input?: BillingBaUpdateInput, requestOptions?: RequestOptions) =>
        request<BillingBaUpdateOutput>(
          {
            method: "PUT",
            path: `/api/better-auth-stripe/subscription`,
            body: { newPlan: input?.["newPlan"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      baCancel: (requestOptions?: RequestOptions) =>
        request<BillingBaCancelOutput>(
          {
            method: "DELETE",
            path: `/api/better-auth-stripe/subscription`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      baPortal: (input?: BillingBaPortalInput, requestOptions?: RequestOptions) =>
        request<BillingBaPortalOutput>(
          {
            method: "POST",
            path: `/api/better-auth-stripe/billing-portal`,
            body: { returnUrl: input?.["returnUrl"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      baFeature: (input?: BillingBaFeatureInput, requestOptions?: RequestOptions) =>
        request<BillingBaFeatureOutput>(
          {
            method: "POST",
            path: `/api/better-auth-stripe/feature-access`,
            body: { feature: input?.["feature"], features: input?.["features"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      baSync: (requestOptions?: RequestOptions) =>
        request<BillingBaSyncOutput>(
          {
            method: "POST",
            path: `/api/better-auth-stripe/sync`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      cronGet: (input?: BillingCronGetInput, requestOptions?: RequestOptions) =>
        request<BillingCronGetOutput>(
          {
            method: "GET",
            path: `/api/cron/update-expired-trials`,
            query: { secret: input?.["secret"] },
            successStatus: 200,
            declaredStatuses: [401, 500],
            empty: false,
          },
          requestOptions,
        ),
      cronPost: (input?: BillingCronPostInput, requestOptions?: RequestOptions) =>
        request<BillingCronPostOutput>(
          {
            method: "POST",
            path: `/api/cron/update-expired-trials`,
            query: { secret: input?.["secret"] },
            successStatus: 200,
            declaredStatuses: [401, 500],
            empty: false,
          },
          requestOptions,
        ),
      stripeHealth: (requestOptions?: RequestOptions) =>
        request<BillingStripeHealthOutput>(
          { method: "GET", path: `/api/health/stripe`, successStatus: 200, declaredStatuses: [503, 401], empty: false },
          requestOptions,
        ),
    },
    misc: {
      pushSubscribe: (input?: MiscPushSubscribeInput, requestOptions?: RequestOptions) =>
        request<MiscPushSubscribeOutput>(
          {
            method: "POST",
            path: `/api/push-subscription`,
            body: { endpoint: input?.["endpoint"], keys: input?.["keys"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      pushUnsubscribe: (input?: MiscPushUnsubscribeInput, requestOptions?: RequestOptions) =>
        request<MiscPushUnsubscribeOutput>(
          {
            method: "DELETE",
            path: `/api/push-subscription`,
            body: { endpoint: input?.["endpoint"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      notify: (input?: MiscNotifyInput, requestOptions?: RequestOptions) =>
        request<MiscNotifyOutput>(
          {
            method: "POST",
            path: `/api/app-control/notify`,
            body: { userId: input?.["userId"], message: input?.["message"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      desktopSignin: (input?: MiscDesktopSigninInput, requestOptions?: RequestOptions) =>
        request<MiscDesktopSigninOutput>(
          {
            method: "POST",
            path: `/api/desktop/auth/signin`,
            body: {
              email: input?.["email"],
              password: input?.["password"],
              deviceId: input?.["deviceId"],
              platform: input?.["platform"],
            },
            successStatus: 200,
            declaredStatuses: [400, 401, 500],
            empty: false,
          },
          requestOptions,
        ),
      desktopProjects: (requestOptions?: RequestOptions) =>
        request<MiscDesktopProjectsOutput>(
          {
            method: "GET",
            path: `/api/desktop/projects`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      desktopCreateProject: (input?: MiscDesktopCreateProjectInput, requestOptions?: RequestOptions) =>
        request<MiscDesktopCreateProjectOutput>(
          {
            method: "POST",
            path: `/api/desktop/projects`,
            body: {
              name: input?.["name"],
              description: input?.["description"],
              organization_id: input?.["organization_id"],
              is_public: input?.["is_public"],
            },
            successStatus: 201,
            declaredStatuses: [400, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      desktopUserByEmail: (input?: MiscDesktopUserByEmailInput, requestOptions?: RequestOptions) =>
        request<MiscDesktopUserByEmailOutput>(
          {
            method: "GET",
            path: `/api/desktop/user/by-email`,
            query: { email: input?.["email"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      trackedGet: (input: MiscTrackedGetInput, requestOptions?: RequestOptions) =>
        request<MiscTrackedGetOutput>(
          {
            method: "GET",
            path: `/api/projects/tracked/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      trackedUpdate: (input: MiscTrackedUpdateInput, requestOptions?: RequestOptions) =>
        request<MiscTrackedUpdateOutput>(
          {
            method: "PUT",
            path: `/api/projects/tracked/${encodeURIComponent(input.id)}`,
            body: { name: input["name"], description: input["description"], organizationId: input["organizationId"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      trackedRemove: (input: MiscTrackedRemoveInput, requestOptions?: RequestOptions) =>
        request<MiscTrackedRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/projects/tracked/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    kv: {
      list: (input?: KvListInput, requestOptions?: RequestOptions) =>
        request<KvListOutput>(
          {
            method: "GET",
            path: `/api/kv`,
            query: { prefix: input?.["prefix"] },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: KvGetInput, requestOptions?: RequestOptions) =>
        request<KvGetOutput>(
          {
            method: "GET",
            path: `/api/kv/${encodeURIComponent(input.key)}`,
            successStatus: 200,
            declaredStatuses: [404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      set: (input: KvSetInput, requestOptions?: RequestOptions) =>
        request<KvSetOutput>(
          {
            method: "PUT",
            path: `/api/kv/${encodeURIComponent(input.key)}`,
            body: { value: input["value"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: KvRemoveInput, requestOptions?: RequestOptions) =>
        request<KvRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/kv/${encodeURIComponent(input.key)}`,
            successStatus: 200,
            declaredStatuses: [404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    "production-costs": {
      listEstimates: (input?: ProductionCostsListEstimatesInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsListEstimatesOutput>(
          {
            method: "GET",
            path: `/api/production-costs/estimates`,
            query: {
              toolpathId: input?.["toolpathId"],
              projectId: input?.["projectId"],
              organizationId: input?.["organizationId"],
            },
            successStatus: 200,
            declaredStatuses: [403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createEstimate: (input: ProductionCostsCreateEstimateInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsCreateEstimateOutput>(
          {
            method: "POST",
            path: `/api/production-costs/estimates`,
            body: {
              toolpathId: input["toolpathId"],
              totalCost: input["totalCost"],
              materialCost: input["materialCost"],
              toolWearCost: input["toolWearCost"],
              machineTime: input["machineTime"],
              machineTimeCost: input["machineTimeCost"],
              operatorTime: input["operatorTime"],
              operatorTimeCost: input["operatorTimeCost"],
              setupCost: input["setupCost"],
              currencyCode: input["currencyCode"],
              details: input["details"],
              operationCostId: input["operationCostId"],
              costSettingsId: input["costSettingsId"],
              organizationId: input["organizationId"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      getEstimate: (input: ProductionCostsGetEstimateInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsGetEstimateOutput>(
          {
            method: "GET",
            path: `/api/production-costs/estimates/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateEstimate: (input: ProductionCostsUpdateEstimateInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsUpdateEstimateOutput>(
          {
            method: "PUT",
            path: `/api/production-costs/estimates/${encodeURIComponent(input.id)}`,
            body: { currencyCode: input["currencyCode"], details: input["details"], notes: input["notes"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      deleteEstimate: (input: ProductionCostsDeleteEstimateInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsDeleteEstimateOutput>(
          {
            method: "DELETE",
            path: `/api/production-costs/estimates/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      calculateEstimate: (input: ProductionCostsCalculateEstimateInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsCalculateEstimateOutput>(
          {
            method: "POST",
            path: `/api/production-costs/estimates/calculate`,
            body: {
              toolpathId: input["toolpathId"],
              costSettingsId: input["costSettingsId"],
              organizationId: input["organizationId"],
            },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listMaterialCosts: (input?: ProductionCostsListMaterialCostsInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsListMaterialCostsOutput>(
          {
            method: "GET",
            path: `/api/production-costs/material-costs`,
            query: { materialId: input?.["materialId"], organizationId: input?.["organizationId"] },
            successStatus: 200,
            declaredStatuses: [403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createMaterialCost: (input: ProductionCostsCreateMaterialCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsCreateMaterialCostOutput>(
          {
            method: "POST",
            path: `/api/production-costs/material-costs`,
            body: {
              costPerUnit: input["costPerUnit"],
              wasteFactor: input["wasteFactor"],
              minimumCharge: input["minimumCharge"],
              currencyCode: input["currencyCode"],
              materialId: input["materialId"],
              organizationId: input["organizationId"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 500, 409, 401],
            empty: false,
          },
          requestOptions,
        ),
      getMaterialCost: (input: ProductionCostsGetMaterialCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsGetMaterialCostOutput>(
          {
            method: "GET",
            path: `/api/production-costs/material-costs/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateMaterialCost: (input: ProductionCostsUpdateMaterialCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsUpdateMaterialCostOutput>(
          {
            method: "PUT",
            path: `/api/production-costs/material-costs/${encodeURIComponent(input.id)}`,
            body: {
              costPerUnit: input["costPerUnit"],
              wasteFactor: input["wasteFactor"],
              minimumCharge: input["minimumCharge"],
              currencyCode: input["currencyCode"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      deleteMaterialCost: (input: ProductionCostsDeleteMaterialCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsDeleteMaterialCostOutput>(
          {
            method: "DELETE",
            path: `/api/production-costs/material-costs/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listOperationCosts: (input?: ProductionCostsListOperationCostsInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsListOperationCostsOutput>(
          {
            method: "GET",
            path: `/api/production-costs/operation-costs`,
            query: { organizationId: input?.["organizationId"] },
            successStatus: 200,
            declaredStatuses: [403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createOperationCost: (input: ProductionCostsCreateOperationCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsCreateOperationCostOutput>(
          {
            method: "POST",
            path: `/api/production-costs/operation-costs`,
            body: {
              name: input["name"],
              machineHourlyRate: input["machineHourlyRate"],
              operatorHourlyRate: input["operatorHourlyRate"],
              setupTime: input["setupTime"],
              currencyCode: input["currencyCode"],
              organizationId: input["organizationId"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 500, 409, 401],
            empty: false,
          },
          requestOptions,
        ),
      getOperationCost: (input: ProductionCostsGetOperationCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsGetOperationCostOutput>(
          {
            method: "GET",
            path: `/api/production-costs/operation-costs/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateOperationCost: (input: ProductionCostsUpdateOperationCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsUpdateOperationCostOutput>(
          {
            method: "PUT",
            path: `/api/production-costs/operation-costs/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              machineHourlyRate: input["machineHourlyRate"],
              operatorHourlyRate: input["operatorHourlyRate"],
              setupTime: input["setupTime"],
              currencyCode: input["currencyCode"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 409, 401],
            empty: false,
          },
          requestOptions,
        ),
      deleteOperationCost: (input: ProductionCostsDeleteOperationCostInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsDeleteOperationCostOutput>(
          {
            method: "DELETE",
            path: `/api/production-costs/operation-costs/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listToolWear: (input?: ProductionCostsListToolWearInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsListToolWearOutput>(
          {
            method: "GET",
            path: `/api/production-costs/tool-wear`,
            query: { toolId: input?.["toolId"], organizationId: input?.["organizationId"] },
            successStatus: 200,
            declaredStatuses: [403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createToolWear: (input: ProductionCostsCreateToolWearInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsCreateToolWearOutput>(
          {
            method: "POST",
            path: `/api/production-costs/tool-wear`,
            body: {
              wearRatePerMeter: input["wearRatePerMeter"],
              replacementCost: input["replacementCost"],
              replacementThreshold: input["replacementThreshold"],
              currencyCode: input["currencyCode"],
              toolId: input["toolId"],
              organizationId: input["organizationId"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 500, 409, 401],
            empty: false,
          },
          requestOptions,
        ),
      getToolWear: (input: ProductionCostsGetToolWearInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsGetToolWearOutput>(
          {
            method: "GET",
            path: `/api/production-costs/tool-wear/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateToolWear: (input: ProductionCostsUpdateToolWearInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsUpdateToolWearOutput>(
          {
            method: "PUT",
            path: `/api/production-costs/tool-wear/${encodeURIComponent(input.id)}`,
            body: {
              wearRatePerMeter: input["wearRatePerMeter"],
              replacementCost: input["replacementCost"],
              replacementThreshold: input["replacementThreshold"],
              currencyCode: input["currencyCode"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      deleteToolWear: (input: ProductionCostsDeleteToolWearInput, requestOptions?: RequestOptions) =>
        request<ProductionCostsDeleteToolWearOutput>(
          {
            method: "DELETE",
            path: `/api/production-costs/tool-wear/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    plugins: {
      list: (requestOptions?: RequestOptions) =>
        request<PluginsListOutput>(
          { method: "GET", path: `/api/plugins`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      get: (input: PluginsGetInput, requestOptions?: RequestOptions) =>
        request<PluginsGetOutput>(
          {
            method: "GET",
            path: `/api/plugins/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      uninstall: (input: PluginsUninstallInput, requestOptions?: RequestOptions) =>
        request<PluginsUninstallOutput>(
          {
            method: "DELETE",
            path: `/api/plugins/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      getConfig: (input: PluginsGetConfigInput, requestOptions?: RequestOptions) =>
        request<PluginsGetConfigOutput>(
          {
            method: "GET",
            path: `/api/plugins/${encodeURIComponent(input.id)}/config`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      setConfig: (input: PluginsSetConfigInput, requestOptions?: RequestOptions) =>
        request<PluginsSetConfigOutput>(
          {
            method: "POST",
            path: `/api/plugins/${encodeURIComponent(input.id)}/config`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateConfig: (input: PluginsUpdateConfigInput, requestOptions?: RequestOptions) =>
        request<PluginsUpdateConfigOutput>(
          {
            method: "PUT",
            path: `/api/plugins/${encodeURIComponent(input.id)}/config`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      enable: (input: PluginsEnableInput, requestOptions?: RequestOptions) =>
        request<PluginsEnableOutput>(
          {
            method: "POST",
            path: `/api/plugins/${encodeURIComponent(input.id)}/enable`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      disable: (input: PluginsDisableInput, requestOptions?: RequestOptions) =>
        request<PluginsDisableOutput>(
          {
            method: "POST",
            path: `/api/plugins/${encodeURIComponent(input.id)}/disable`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: PluginsUpdateInput, requestOptions?: RequestOptions) =>
        request<PluginsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/plugins/${encodeURIComponent(input.id)}/update`,
            body: { manifest: input["manifest"], config: input["config"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      patch: (input: PluginsPatchInput, requestOptions?: RequestOptions) =>
        request<PluginsPatchOutput>(
          {
            method: "PATCH",
            path: `/api/plugins/${encodeURIComponent(input.id)}/update`,
            body: { manifest: input["manifest"], config: input["config"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      registry: (requestOptions?: RequestOptions) =>
        request<PluginsRegistryOutput>(
          {
            method: "GET",
            path: `/api/plugins/registry`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      registryGet: (input: PluginsRegistryGetInput, requestOptions?: RequestOptions) =>
        request<PluginsRegistryGetOutput>(
          {
            method: "GET",
            path: `/api/plugins/registry/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      registrySearch: (input: PluginsRegistrySearchInput, requestOptions?: RequestOptions) =>
        request<PluginsRegistrySearchOutput>(
          {
            method: "GET",
            path: `/api/plugins/registry/search`,
            query: { q: input["q"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    files: {
      upload: (input?: FilesUploadInput, requestOptions?: RequestOptions) =>
        request<FilesUploadOutput>(
          {
            method: "POST",
            path: `/api/upload`,
            body: {
              fileName: input?.["fileName"],
              fileType: input?.["fileType"],
              organizationId: input?.["organizationId"],
              conversationId: input?.["conversationId"],
              fileSize: input?.["fileSize"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    organizations: {
      list: (requestOptions?: RequestOptions) =>
        request<OrganizationsListOutput>(
          { method: "GET", path: `/api/organizations`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      create: (input: OrganizationsCreateInput, requestOptions?: RequestOptions) =>
        request<OrganizationsCreateOutput>(
          {
            method: "POST",
            path: `/api/organizations`,
            body: { name: input["name"], description: input["description"] },
            successStatus: 201,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: OrganizationsGetInput, requestOptions?: RequestOptions) =>
        request<OrganizationsGetOutput>(
          {
            method: "GET",
            path: `/api/organizations/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: OrganizationsUpdateInput, requestOptions?: RequestOptions) =>
        request<OrganizationsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/organizations/${encodeURIComponent(input.id)}`,
            body: { name: input["name"], description: input["description"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: OrganizationsRemoveInput, requestOptions?: RequestOptions) =>
        request<OrganizationsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/organizations/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    notifications: {
      list: (input?: NotificationsListInput, requestOptions?: RequestOptions) =>
        request<NotificationsListOutput>(
          {
            method: "GET",
            path: `/api/notifications`,
            query: {
              limit: input?.["limit"],
              offset: input?.["offset"],
              cursor: input?.["cursor"],
              onlyUnread: input?.["onlyUnread"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: NotificationsUpdateInput, requestOptions?: RequestOptions) =>
        request<NotificationsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/notifications/${encodeURIComponent(input.id)}`,
            body: { isRead: input["isRead"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: NotificationsRemoveInput, requestOptions?: RequestOptions) =>
        request<NotificationsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/notifications/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      markAllRead: (requestOptions?: RequestOptions) =>
        request<NotificationsMarkAllReadOutput>(
          {
            method: "POST",
            path: `/api/notifications/mark-all-read`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    projects: {
      list: (requestOptions?: RequestOptions) =>
        request<ProjectsListOutput>(
          { method: "GET", path: `/api/projects`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      create: (input?: ProjectsCreateInput, requestOptions?: RequestOptions) =>
        request<ProjectsCreateOutput>(
          {
            method: "POST",
            path: `/api/projects`,
            body: {
              name: input?.["name"],
              description: input?.["description"],
              organizationId: input?.["organizationId"],
              isPublic: input?.["isPublic"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ProjectsGetInput, requestOptions?: RequestOptions) =>
        request<ProjectsGetOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: ProjectsUpdateInput, requestOptions?: RequestOptions) =>
        request<ProjectsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/projects/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              description: input["description"],
              organizationId: input["organizationId"],
              isPublic: input["isPublic"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: ProjectsRemoveInput, requestOptions?: RequestOptions) =>
        request<ProjectsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/projects/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    materials: {
      list: (input?: MaterialsListInput, requestOptions?: RequestOptions) =>
        request<MaterialsListOutput>(
          {
            method: "GET",
            path: `/api/materials`,
            query: { search: input?.["search"], public: input?.["public"] },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: MaterialsCreateInput, requestOptions?: RequestOptions) =>
        request<MaterialsCreateOutput>(
          {
            method: "POST",
            path: `/api/materials`,
            body: {
              name: input?.["name"],
              description: input?.["description"],
              properties: input?.["properties"],
              organizationId: input?.["organizationId"],
              isPublic: input?.["isPublic"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: MaterialsGetInput, requestOptions?: RequestOptions) =>
        request<MaterialsGetOutput>(
          {
            method: "GET",
            path: `/api/materials/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: MaterialsUpdateInput, requestOptions?: RequestOptions) =>
        request<MaterialsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/materials/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              description: input["description"],
              properties: input["properties"],
              organizationId: input["organizationId"],
              isPublic: input["isPublic"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: MaterialsRemoveInput, requestOptions?: RequestOptions) =>
        request<MaterialsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/materials/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    materialsStorage: {
      save: (input: MaterialsStorageSaveInput, requestOptions?: RequestOptions) =>
        request<MaterialsStorageSaveOutput>(
          {
            method: "POST",
            path: `/api/materials/${encodeURIComponent(input.id)}/storage`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      read: (input: MaterialsStorageReadInput, requestOptions?: RequestOptions) =>
        request<MaterialsStorageReadOutput>(
          {
            method: "GET",
            path: `/api/materials/${encodeURIComponent(input.id)}/storage`,
            query: { signedUrl: input["signedUrl"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: MaterialsStorageRemoveInput, requestOptions?: RequestOptions) =>
        request<MaterialsStorageRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/materials/${encodeURIComponent(input.id)}/storage`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      export: (input?: MaterialsStorageExportInput, requestOptions?: RequestOptions) =>
        request<MaterialsStorageExportOutput>(
          {
            method: "GET",
            path: `/api/materials/export-import`,
            query: { ids: input?.["ids"], format: input?.["format"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      import: (input: MaterialsStorageImportInput, requestOptions?: RequestOptions) =>
        request<MaterialsStorageImportOutput>(
          {
            method: "POST",
            path: `/api/materials/export-import`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    tools: {
      list: (input?: ToolsListInput, requestOptions?: RequestOptions) =>
        request<ToolsListOutput>(
          {
            method: "GET",
            path: `/api/tools`,
            query: {
              type: input?.["type"],
              material: input?.["material"],
              diameter: input?.["diameter"],
              search: input?.["search"],
              public: input?.["public"],
            },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: ToolsCreateInput, requestOptions?: RequestOptions) =>
        request<ToolsCreateOutput>(
          {
            method: "POST",
            path: `/api/tools`,
            body: {
              name: input?.["name"],
              type: input?.["type"],
              diameter: input?.["diameter"],
              material: input?.["material"],
              numberOfFlutes: input?.["numberOfFlutes"],
              maxRPM: input?.["maxRPM"],
              coolantType: input?.["coolantType"],
              cuttingLength: input?.["cuttingLength"],
              totalLength: input?.["totalLength"],
              shankDiameter: input?.["shankDiameter"],
              cornerRadius: input?.["cornerRadius"],
              tipAngle: input?.["tipAngle"],
              threadPitch: input?.["threadPitch"],
              holderDiameter: input?.["holderDiameter"],
              holderLength: input?.["holderLength"],
              stickout: input?.["stickout"],
              notes: input?.["notes"],
              organizationId: input?.["organizationId"],
              isPublic: input?.["isPublic"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ToolsGetInput, requestOptions?: RequestOptions) =>
        request<ToolsGetOutput>(
          {
            method: "GET",
            path: `/api/tools/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: ToolsUpdateInput, requestOptions?: RequestOptions) =>
        request<ToolsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/tools/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              type: input["type"],
              diameter: input["diameter"],
              material: input["material"],
              numberOfFlutes: input["numberOfFlutes"],
              maxRPM: input["maxRPM"],
              coolantType: input["coolantType"],
              cuttingLength: input["cuttingLength"],
              totalLength: input["totalLength"],
              shankDiameter: input["shankDiameter"],
              cornerRadius: input["cornerRadius"],
              tipAngle: input["tipAngle"],
              threadPitch: input["threadPitch"],
              holderDiameter: input["holderDiameter"],
              holderLength: input["holderLength"],
              stickout: input["stickout"],
              notes: input["notes"],
              organizationId: input["organizationId"],
              isPublic: input["isPublic"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: ToolsRemoveInput, requestOptions?: RequestOptions) =>
        request<ToolsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/tools/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    toolsStorage: {
      save: (input: ToolsStorageSaveInput, requestOptions?: RequestOptions) =>
        request<ToolsStorageSaveOutput>(
          {
            method: "POST",
            path: `/api/tools/${encodeURIComponent(input.id)}/storage`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      read: (input: ToolsStorageReadInput, requestOptions?: RequestOptions) =>
        request<ToolsStorageReadOutput>(
          {
            method: "GET",
            path: `/api/tools/${encodeURIComponent(input.id)}/storage`,
            query: { path: input["path"], signedUrl: input["signedUrl"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: ToolsStorageRemoveInput, requestOptions?: RequestOptions) =>
        request<ToolsStorageRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/tools/${encodeURIComponent(input.id)}/storage`,
            query: { path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      export: (input?: ToolsStorageExportInput, requestOptions?: RequestOptions) =>
        request<ToolsStorageExportOutput>(
          {
            method: "GET",
            path: `/api/tools/export-import`,
            query: { ids: input?.["ids"], format: input?.["format"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      import: (input: ToolsStorageImportInput, requestOptions?: RequestOptions) =>
        request<ToolsStorageImportOutput>(
          {
            method: "POST",
            path: `/api/tools/export-import`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      exportById: (input: ToolsStorageExportByIdInput, requestOptions?: RequestOptions) =>
        request<ToolsStorageExportByIdOutput>(
          {
            method: "GET",
            path: `/api/tools/${encodeURIComponent(input.id)}/export-import`,
            query: { ids: input["ids"], format: input["format"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      importById: (input: ToolsStorageImportByIdInput, requestOptions?: RequestOptions) =>
        request<ToolsStorageImportByIdOutput>(
          {
            method: "POST",
            path: `/api/tools/${encodeURIComponent(input.id)}/export-import`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    machineConfigs: {
      list: (input?: MachineConfigsListInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsListOutput>(
          {
            method: "GET",
            path: `/api/machine-configs`,
            query: {
              page: input?.["page"],
              limit: input?.["limit"],
              type: input?.["type"],
              search: input?.["search"],
              public: input?.["public"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input: MachineConfigsCreateInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsCreateOutput>(
          {
            method: "POST",
            path: `/api/machine-configs`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: MachineConfigsGetInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsGetOutput>(
          {
            method: "GET",
            path: `/api/machine-configs/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: MachineConfigsUpdateInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/machine-configs/${encodeURIComponent(input.id)}`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: MachineConfigsRemoveInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/machine-configs/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      clone: (input: MachineConfigsCloneInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsCloneOutput>(
          {
            method: "POST",
            path: `/api/machine-configs/${encodeURIComponent(input.id)}/clone`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      defaults: (requestOptions?: RequestOptions) =>
        request<MachineConfigsDefaultsOutput>(
          {
            method: "GET",
            path: `/api/machine-configs/defaults`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    machineConfigsStorage: {
      save: (input: MachineConfigsStorageSaveInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsStorageSaveOutput>(
          {
            method: "POST",
            path: `/api/machine-configs/${encodeURIComponent(input.id)}/storage`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      read: (input: MachineConfigsStorageReadInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsStorageReadOutput>(
          {
            method: "GET",
            path: `/api/machine-configs/${encodeURIComponent(input.id)}/storage`,
            query: { signedUrl: input["signedUrl"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: MachineConfigsStorageRemoveInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsStorageRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/machine-configs/${encodeURIComponent(input.id)}/storage`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      export: (input?: MachineConfigsStorageExportInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsStorageExportOutput>(
          {
            method: "GET",
            path: `/api/machine-configs/export-import`,
            query: { ids: input?.["ids"], format: input?.["format"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      import: (input: MachineConfigsStorageImportInput, requestOptions?: RequestOptions) =>
        request<MachineConfigsStorageImportOutput>(
          {
            method: "POST",
            path: `/api/machine-configs/export-import`,
            body: input["payload"],
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    drawings: {
      get: (input: DrawingsGetInput, requestOptions?: RequestOptions) =>
        request<DrawingsGetOutput>(
          {
            method: "GET",
            path: `/api/drawings/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: DrawingsUpdateInput, requestOptions?: RequestOptions) =>
        request<DrawingsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/drawings/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              description: input["description"],
              data: input["data"],
              thumbnail: input["thumbnail"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: DrawingsRemoveInput, requestOptions?: RequestOptions) =>
        request<DrawingsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/drawings/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listForProject: (input: DrawingsListForProjectInput, requestOptions?: RequestOptions) =>
        request<DrawingsListForProjectOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/drawings`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createForProject: (input: DrawingsCreateForProjectInput, requestOptions?: RequestOptions) =>
        request<DrawingsCreateForProjectOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/drawings`,
            body: {
              name: input["name"],
              description: input["description"],
              data: input["data"],
              thumbnail: input["thumbnail"],
            },
            successStatus: 201,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    components: {
      get: (input: ComponentsGetInput, requestOptions?: RequestOptions) =>
        request<ComponentsGetOutput>(
          {
            method: "GET",
            path: `/api/components/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: ComponentsUpdateInput, requestOptions?: RequestOptions) =>
        request<ComponentsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/components/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              description: input["description"],
              data: input["data"],
              type: input["type"],
              isPublic: input["isPublic"],
              thumbnail: input["thumbnail"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: ComponentsRemoveInput, requestOptions?: RequestOptions) =>
        request<ComponentsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/components/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listForProject: (input: ComponentsListForProjectInput, requestOptions?: RequestOptions) =>
        request<ComponentsListForProjectOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/components`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createForProject: (input: ComponentsCreateForProjectInput, requestOptions?: RequestOptions) =>
        request<ComponentsCreateForProjectOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/components`,
            body: {
              name: input["name"],
              description: input["description"],
              data: input["data"],
              type: input["type"],
              isPublic: input["isPublic"],
              thumbnail: input["thumbnail"],
            },
            successStatus: 201,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    toolpaths: {
      list: (input?: ToolpathsListInput, requestOptions?: RequestOptions) =>
        request<ToolpathsListOutput>(
          {
            method: "GET",
            path: `/api/toolpaths`,
            query: {
              projectId: input?.["projectId"],
              type: input?.["type"],
              operationType: input?.["operationType"],
              search: input?.["search"],
              public: input?.["public"],
            },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: ToolpathsCreateInput, requestOptions?: RequestOptions) =>
        request<ToolpathsCreateOutput>(
          {
            method: "POST",
            path: `/api/toolpaths`,
            body: {
              name: input?.["name"],
              description: input?.["description"],
              data: input?.["data"],
              gcode: input?.["gcode"],
              projectId: input?.["projectId"],
              type: input?.["type"],
              operationType: input?.["operationType"],
              isPublic: input?.["isPublic"],
              thumbnail: input?.["thumbnail"],
              materialId: input?.["materialId"],
              machineConfigId: input?.["machineConfigId"],
              toolId: input?.["toolId"],
              simulation: input?.["simulation"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: ToolpathsGetInput, requestOptions?: RequestOptions) =>
        request<ToolpathsGetOutput>(
          {
            method: "GET",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: ToolpathsUpdateInput, requestOptions?: RequestOptions) =>
        request<ToolpathsUpdateOutput>(
          {
            method: "PUT",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              description: input["description"],
              data: input["data"],
              gcode: input["gcode"],
              projectId: input["projectId"],
              type: input["type"],
              operationType: input["operationType"],
              isPublic: input["isPublic"],
              thumbnail: input["thumbnail"],
              materialId: input["materialId"],
              machineConfigId: input["machineConfigId"],
              toolId: input["toolId"],
              simulation: input["simulation"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: ToolpathsRemoveInput, requestOptions?: RequestOptions) =>
        request<ToolpathsRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listForDrawing: (input: ToolpathsListForDrawingInput, requestOptions?: RequestOptions) =>
        request<ToolpathsListForDrawingOutput>(
          {
            method: "GET",
            path: `/api/drawings/${encodeURIComponent(input.id)}/toolpaths`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createForDrawing: (input: ToolpathsCreateForDrawingInput, requestOptions?: RequestOptions) =>
        request<ToolpathsCreateForDrawingOutput>(
          {
            method: "POST",
            path: `/api/drawings/${encodeURIComponent(input.id)}/toolpaths`,
            body: {
              name: input["name"],
              description: input["description"],
              data: input["data"],
              gcode: input["gcode"],
              projectId: input["projectId"],
              type: input["type"],
              operationType: input["operationType"],
              isPublic: input["isPublic"],
              thumbnail: input["thumbnail"],
              materialId: input["materialId"],
              machineConfigId: input["machineConfigId"],
              toolId: input["toolId"],
              simulation: input["simulation"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    toolpathExtras: {
      library: (input: ToolpathExtrasLibraryInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasLibraryOutput>(
          {
            method: "GET",
            path: `/api/toolpaths/library`,
            query: {
              projectId: input["projectId"],
              type: input["type"],
              operationType: input["operationType"],
              category: input["category"],
              search: input["search"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listVersions: (input: ToolpathExtrasListVersionsInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasListVersionsOutput>(
          {
            method: "GET",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}/versions`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createVersion: (input: ToolpathExtrasCreateVersionInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasCreateVersionOutput>(
          {
            method: "POST",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}/versions`,
            body: { data: input["data"], gcode: input["gcode"], changeMessage: input["changeMessage"] },
            successStatus: 201,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      restoreVersion: (input: ToolpathExtrasRestoreVersionInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasRestoreVersionOutput>(
          {
            method: "POST",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}/versions/restore`,
            body: { versionId: input["versionId"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listComments: (input: ToolpathExtrasListCommentsInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasListCommentsOutput>(
          {
            method: "GET",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}/comments`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createComment: (input: ToolpathExtrasCreateCommentInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasCreateCommentOutput>(
          {
            method: "POST",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}/comments`,
            body: { content: input["content"] },
            successStatus: 201,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      updateComment: (input: ToolpathExtrasUpdateCommentInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasUpdateCommentOutput>(
          {
            method: "PUT",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}/comments/${encodeURIComponent(input.commentId)}`,
            body: { content: input["content"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      removeComment: (input: ToolpathExtrasRemoveCommentInput, requestOptions?: RequestOptions) =>
        request<ToolpathExtrasRemoveCommentOutput>(
          {
            method: "DELETE",
            path: `/api/toolpaths/${encodeURIComponent(input.id)}/comments/${encodeURIComponent(input.commentId)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    toolpathGenerator: {
      manufacture: (input: ToolpathGeneratorManufactureInput, requestOptions?: RequestOptions) =>
        request<ToolpathGeneratorManufactureOutput>(
          {
            method: "POST",
            path: `/api/toolpaths/manufacture`,
            body: {
              setupOrientation: input["setupOrientation"],
              material: input["material"],
              machine: input["machine"],
              machineConfig: input["machineConfig"],
              origin: input["origin"],
              finishAllowance: input["finishAllowance"],
              scallop: input["scallop"],
              schemaVersion: input["schemaVersion"],
              id: input["id"],
              name: input["name"],
              elements: input["elements"],
              stock: input["stock"],
              tolerance: input["tolerance"],
              resolution: input["resolution"],
              workOffset: input["workOffset"],
              operations: input["operations"],
              tools: input["tools"],
              deburr: input["deburr"],
              subprograms: input["subprograms"],
              progress: input["progress"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      parse: (input: ToolpathGeneratorParseInput, requestOptions?: RequestOptions) =>
        request<ToolpathGeneratorParseOutput>(
          {
            method: "POST",
            path: `/api/toolpaths/parse`,
            body: { gcode: input["gcode"], name: input["name"] },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      verify: (input: ToolpathGeneratorVerifyInput, requestOptions?: RequestOptions) =>
        request<ToolpathGeneratorVerifyOutput>(
          {
            method: "POST",
            path: `/api/toolpaths/verify`,
            body: {
              gcode: input["gcode"],
              program: input["program"],
              stock: input["stock"],
              tool: input["tool"],
              fixtures: input["fixtures"],
              target: input["target"],
              resolution: input["resolution"],
              tolerance: input["tolerance"],
              start: input["start"],
            },
            successStatus: 200,
            declaredStatuses: [400, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    cadExact: {
      analyze: (input?: CadExactAnalyzeInput, requestOptions?: RequestOptions) =>
        request<CadExactAnalyzeOutput>(
          {
            method: "POST",
            path: `/api/cad/exact/analyze`,
            body: {
              elements: input?.["elements"],
              drawingId: input?.["drawingId"],
              ids: input?.["ids"],
              machining: input?.["machining"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      step: (input?: CadExactStepInput, requestOptions?: RequestOptions) =>
        request<CadExactStepOutput>(
          {
            method: "POST",
            path: `/api/cad/exact/step`,
            body: {
              elements: input?.["elements"],
              drawingId: input?.["drawingId"],
              ids: input?.["ids"],
              faceted: input?.["faceted"],
              author: input?.["author"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      assembly: (input?: CadExactAssemblyInput, requestOptions?: RequestOptions) =>
        request<CadExactAssemblyOutput>(
          {
            method: "POST",
            path: `/api/cad/exact/assembly`,
            body: { elements: input?.["elements"], drawingId: input?.["drawingId"], washers: input?.["washers"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    library: {
      list: (input?: LibraryListInput, requestOptions?: RequestOptions) =>
        request<LibraryListOutput>(
          {
            method: "GET",
            path: `/api/library`,
            query: { category: input?.["category"], type: input?.["type"], search: input?.["search"] },
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      create: (input?: LibraryCreateInput, requestOptions?: RequestOptions) =>
        request<LibraryCreateOutput>(
          {
            method: "POST",
            path: `/api/library`,
            body: {
              name: input?.["name"],
              description: input?.["description"],
              category: input?.["category"],
              type: input?.["type"],
              data: input?.["data"],
              properties: input?.["properties"],
              tags: input?.["tags"],
              organizationId: input?.["organizationId"],
              isPublic: input?.["isPublic"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      get: (input: LibraryGetInput, requestOptions?: RequestOptions) =>
        request<LibraryGetOutput>(
          {
            method: "GET",
            path: `/api/library/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      update: (input: LibraryUpdateInput, requestOptions?: RequestOptions) =>
        request<LibraryUpdateOutput>(
          {
            method: "PUT",
            path: `/api/library/${encodeURIComponent(input.id)}`,
            body: {
              name: input["name"],
              description: input["description"],
              category: input["category"],
              type: input["type"],
              data: input["data"],
              properties: input["properties"],
              tags: input["tags"],
              organizationId: input["organizationId"],
              isPublic: input["isPublic"],
            },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remove: (input: LibraryRemoveInput, requestOptions?: RequestOptions) =>
        request<LibraryRemoveOutput>(
          {
            method: "DELETE",
            path: `/api/library/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      components: (requestOptions?: RequestOptions) =>
        request<{ readonly data: LibraryComponentsOutput }>(
          {
            method: "GET",
            path: `/api/library/components`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      materials: (requestOptions?: RequestOptions) =>
        request<{ readonly data: LibraryMaterialsOutput }>(
          {
            method: "GET",
            path: `/api/library/materials`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ).then((value) => value.data),
      tools: (requestOptions?: RequestOptions) =>
        request<{ readonly data: LibraryToolsOutput }>(
          { method: "GET", path: `/api/library/tools`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ).then((value) => value.data),
    },
    projectToolpaths: {
      list: (input: ProjectToolpathsListInput, requestOptions?: RequestOptions) =>
        request<ProjectToolpathsListOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/toolpaths`,
            query: { projectId: input["projectId"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 405, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    vcs: {
      status: (input: VcsStatusInput, requestOptions?: RequestOptions) =>
        request<VcsStatusOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/status`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      log: (input: VcsLogInput, requestOptions?: RequestOptions) =>
        request<VcsLogOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/log`,
            query: { rev: input["rev"], limit: input["limit"], path: input["path"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      commit: (input: VcsCommitInput, requestOptions?: RequestOptions) =>
        request<VcsCommitOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/commit`,
            body: { message: input["message"], authorKind: input["authorKind"], files: input["files"] },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      branches: (input: VcsBranchesInput, requestOptions?: RequestOptions) =>
        request<VcsBranchesOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/branches`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      createBranch: (input: VcsCreateBranchInput, requestOptions?: RequestOptions) =>
        request<VcsCreateBranchOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/branches`,
            body: { name: input["name"], from: input["from"] },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      checkout: (input: VcsCheckoutInput, requestOptions?: RequestOptions) =>
        request<VcsCheckoutOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/checkout`,
            body: { branch: input["branch"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      restore: (input: VcsRestoreInput, requestOptions?: RequestOptions) =>
        request<VcsRestoreOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/restore`,
            body: { rev: input["rev"], paths: input["paths"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      diff: (input: VcsDiffInput, requestOptions?: RequestOptions) =>
        request<VcsDiffOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/diff`,
            query: { from: input["from"], to: input["to"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listPullRequests: (input: VcsListPullRequestsInput, requestOptions?: RequestOptions) =>
        request<VcsListPullRequestsOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/pulls`,
            query: { state: input["state"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      openPullRequest: (input: VcsOpenPullRequestInput, requestOptions?: RequestOptions) =>
        request<VcsOpenPullRequestOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/pulls`,
            body: {
              title: input["title"],
              body: input["body"],
              head: input["head"],
              base: input["base"],
              authorKind: input["authorKind"],
            },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      pullRequest: (input: VcsPullRequestInput, requestOptions?: RequestOptions) =>
        request<VcsPullRequestOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/pulls/${encodeURIComponent(input.number)}`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      review: (input: VcsReviewInput, requestOptions?: RequestOptions) =>
        request<VcsReviewOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/pulls/${encodeURIComponent(input.number)}/reviews`,
            body: { verdict: input["verdict"], body: input["body"], path: input["path"], pointer: input["pointer"] },
            successStatus: 201,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      mergePullRequest: (input: VcsMergePullRequestInput, requestOptions?: RequestOptions) =>
        request<VcsMergePullRequestOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/pulls/${encodeURIComponent(input.number)}/merge`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      closePullRequest: (input: VcsClosePullRequestInput, requestOptions?: RequestOptions) =>
        request<VcsClosePullRequestOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/pulls/${encodeURIComponent(input.number)}/close`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      remote: (input: VcsRemoteInput, requestOptions?: RequestOptions) =>
        request<VcsRemoteOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/remote`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      setRemote: (input: VcsSetRemoteInput, requestOptions?: RequestOptions) =>
        request<VcsSetRemoteOutput>(
          {
            method: "PUT",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/remote`,
            body: { remote: input["remote"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      push: (input: VcsPushInput, requestOptions?: RequestOptions) =>
        request<VcsPushOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/push`,
            headers: { "x-github-token": input["x-github-token"] },
            body: { branch: input["branch"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      pull: (input: VcsPullInput, requestOptions?: RequestOptions) =>
        request<VcsPullOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/vcs/pull`,
            headers: { "x-github-token": input["x-github-token"] },
            body: { branch: input["branch"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      runs: (input: VcsRunsInput, requestOptions?: RequestOptions) =>
        request<VcsRunsOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/actions/runs`,
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      dispatch: (input: VcsDispatchInput, requestOptions?: RequestOptions) =>
        request<VcsDispatchOutput>(
          {
            method: "POST",
            path: `/api/projects/${encodeURIComponent(input.id)}/actions/dispatch`,
            body: { ref: input["ref"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      listWorkflows: (input: VcsListWorkflowsInput, requestOptions?: RequestOptions) =>
        request<VcsListWorkflowsOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/actions/workflows`,
            query: { ref: input["ref"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      workflow: (input: VcsWorkflowInput, requestOptions?: RequestOptions) =>
        request<VcsWorkflowOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/actions/workflows/${encodeURIComponent(input.name)}`,
            query: { ref: input["ref"] },
            successStatus: 200,
            declaredStatuses: [400, 403, 404, 409, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    events: {
      subscribe: (input: EventsSubscribeInput, requestOptions?: RequestOptions): AsyncIterable<EventsSubscribeOutput> =>
        sse<EventsSubscribeOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/events`,
            successStatus: 200,
            declaredStatuses: [401, 404, 500],
            empty: false,
          },
          requestOptions,
        ),
      subscribeAll: (requestOptions?: RequestOptions): AsyncIterable<EventsSubscribeAllOutput> =>
        sse<EventsSubscribeAllOutput>(
          { method: "GET", path: `/api/events`, successStatus: 200, declaredStatuses: [401, 500], empty: false },
          requestOptions,
        ),
    },
    companion: {
      status: (requestOptions?: RequestOptions) =>
        request<CompanionStatusOutput>(
          { method: "GET", path: `/api/companion`, successStatus: 200, declaredStatuses: [500, 401], empty: false },
          requestOptions,
        ),
      enable: (input?: CompanionEnableInput, requestOptions?: RequestOptions) =>
        request<CompanionEnableOutput>(
          {
            method: "POST",
            path: `/api/companion/enable`,
            body: { port: input?.["port"] },
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      disable: (requestOptions?: RequestOptions) =>
        request<CompanionDisableOutput>(
          {
            method: "POST",
            path: `/api/companion/disable`,
            successStatus: 200,
            declaredStatuses: [500, 401],
            empty: false,
          },
          requestOptions,
        ),
      pair: (input: CompanionPairInput, requestOptions?: RequestOptions) =>
        request<CompanionPairOutput>(
          {
            method: "POST",
            path: `/api/companion/pair`,
            body: { name: input["name"], host: input["host"] },
            successStatus: 201,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      redeem: (input: CompanionRedeemInput, requestOptions?: RequestOptions) =>
        request<CompanionRedeemOutput>(
          {
            method: "POST",
            path: `/api/companion/redeem`,
            body: { code: input["code"] },
            successStatus: 201,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      revoke: (input: CompanionRevokeInput, requestOptions?: RequestOptions) =>
        request<CompanionRevokeOutput>(
          {
            method: "DELETE",
            path: `/api/companion/devices/${encodeURIComponent(input.id)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
    workspace: {
      drawings: (input: WorkspaceDrawingsInput, requestOptions?: RequestOptions) =>
        request<WorkspaceDrawingsOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/drawings`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      drawingPreview: (input: WorkspaceDrawingPreviewInput, requestOptions?: RequestOptions) =>
        request<WorkspaceDrawingPreviewOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/drawings/${encodeURIComponent(input.drawingId)}/preview`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      components: (input: WorkspaceComponentsInput, requestOptions?: RequestOptions) =>
        request<WorkspaceComponentsOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/components`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      componentPreview: (input: WorkspaceComponentPreviewInput, requestOptions?: RequestOptions) =>
        request<WorkspaceComponentPreviewOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/components/${encodeURIComponent(input.componentId)}/preview`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      toolpaths: (input: WorkspaceToolpathsInput, requestOptions?: RequestOptions) =>
        request<WorkspaceToolpathsOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/toolpaths`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      toolpath: (input: WorkspaceToolpathInput, requestOptions?: RequestOptions) =>
        request<WorkspaceToolpathOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/toolpaths/${encodeURIComponent(input.toolpathId)}`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      toolpathPreview: (input: WorkspaceToolpathPreviewInput, requestOptions?: RequestOptions) =>
        request<WorkspaceToolpathPreviewOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/toolpaths/${encodeURIComponent(input.toolpathId)}/preview`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
      library: (input: WorkspaceLibraryInput, requestOptions?: RequestOptions) =>
        request<WorkspaceLibraryOutput>(
          {
            method: "GET",
            path: `/api/projects/${encodeURIComponent(input.id)}/workspace/library`,
            successStatus: 200,
            declaredStatuses: [400, 404, 500, 401],
            empty: false,
          },
          requestOptions,
        ),
    },
  }
}

function appendQuery(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined) return
  if (value === null) {
    params.append(key, "null")
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) appendQuery(params, key, item)
    return
  }
  if (typeof value === "object") {
    for (const [child, item] of Object.entries(value)) appendQuery(params, `${key}[${child}]`, item)
    return
  }
  params.append(key, String(value))
}

async function json(response: Response): Promise<unknown> {
  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {
    try {
      await response.body?.cancel()
    } catch {}
    throw new ClientError("UnsupportedContentType")
  }
  let text: string
  try {
    text = await response.text()
  } catch (cause) {
    throw new ClientError("Transport", { cause })
  }
  if (text === "") throw new ClientError("MalformedResponse")
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ClientError("MalformedResponse", { cause })
  }
}

function isContentType(response: Response, expected: string) {
  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected
}

function readDeclaredHeaders(response: Response, names: ReadonlyArray<string> | undefined) {
  if (names === undefined) return undefined
  const headers: { [key: string]: string } = {}
  for (const name of names) {
    const value = response.headers.get(name)
    if (value !== null) headers[name] = value
  }
  return headers
}

function attachDeclaredHeaders<A>(body: A, response: Response, names: ReadonlyArray<string> | undefined): A {
  const headers = readDeclaredHeaders(response, names)
  return headers === undefined ? body : ({ body, headers } as A)
}
