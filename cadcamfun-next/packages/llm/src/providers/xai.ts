import { AuthOptions, type ProviderAuthOption } from "../route/auth-options"
import { Route } from "../route/client"
import type { RouteModelInput } from "../route/client"
import { Provider } from "../provider"
import { ProviderID, type ModelID, type TypedModelRef } from "../schema"
import * as OpenAICompatibleProfiles from "./openai-compatible-profile"
import * as OpenAICompatibleChat from "../protocols/openai-compatible-chat"
import * as OpenAIResponses from "../protocols/openai-responses"
import { withXAIOptions, type XAIProviderOptionsInput } from "./xai-options"

export type { XAIOptionsInput, XAIProviderOptionsInput } from "./xai-options"

export const id = ProviderID.make("xai")

export type ModelOptions = Omit<RouteModelInput, "id" | "apiKey" | "auth" | "baseURL" | "providerOptions"> &
  ProviderAuthOption<"optional"> & {
    readonly baseURL?: string
    readonly providerOptions?: XAIProviderOptionsInput
  }

export const routes = [OpenAIResponses.route, OpenAICompatibleChat.route]

const responsesModel = Route.model(OpenAIResponses.route, { provider: id })
const chatModel = OpenAICompatibleChat.model

const auth = (options: ProviderAuthOption<"optional">) => AuthOptions.bearer(options, "XAI_API_KEY")

export const responses = (
  modelID: string | ModelID,
  options: ModelOptions = {},
): TypedModelRef<XAIProviderOptionsInput> => {
  const { apiKey: _, ...rest } = options
  return responsesModel(
    withXAIOptions(String(modelID), {
      ...rest,
      auth: auth(options),
      baseURL: options.baseURL ?? OpenAICompatibleProfiles.profiles.xai.baseURL,
    }),
  )
}

export const chat = (modelID: string | ModelID, options: ModelOptions = {}): TypedModelRef<XAIProviderOptionsInput> => {
  const { apiKey: _, ...rest } = options
  return chatModel(
    withXAIOptions(String(modelID), {
      ...rest,
      auth: auth(options),
      provider: id,
      baseURL: options.baseURL ?? OpenAICompatibleProfiles.profiles.xai.baseURL,
    }),
  )
}

export const provider = Provider.make({
  id,
  model: responses,
  apis: { responses, chat },
})

export const model = provider.model
export const apis = provider.apis
