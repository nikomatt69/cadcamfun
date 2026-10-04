import { Provider } from "../provider"
import { ProviderID, type ModelID, type TypedModelRef } from "../schema"
import * as OpenAICompatibleChat from "../protocols/openai-compatible-chat"
import type { OpenAICompatibleChatModelInput } from "../protocols/openai-compatible-chat"
import { profiles, type OpenAICompatibleProfile } from "./openai-compatible-profile"
import { withOpenAICompatibleOptions, type OpenAICompatibleProviderOptionsInput } from "./openai-compatible-options"

export type { OpenAICompatibleProviderOptionsInput } from "./openai-compatible-options"

export const id = ProviderID.make("openai-compatible")

export type ModelOptions = Omit<OpenAICompatibleChatModelInput, "id" | "provider" | "providerOptions"> & {
  readonly provider: string
  readonly providerOptions?: OpenAICompatibleProviderOptionsInput
}

type GenericModelOptions = Omit<ModelOptions, "provider"> & {
  readonly provider?: string
}

export type FamilyModelOptions = Omit<
  OpenAICompatibleChatModelInput,
  "id" | "provider" | "baseURL" | "providerOptions"
> & {
  readonly baseURL?: string
  readonly providerOptions?: OpenAICompatibleProviderOptionsInput
}

export const routes = [OpenAICompatibleChat.route]

export const model = (
  modelID: string | ModelID,
  options: ModelOptions,
): TypedModelRef<OpenAICompatibleProviderOptionsInput> => {
  return OpenAICompatibleChat.model({
    ...withOpenAICompatibleOptions(String(modelID), options, { profile: options.provider }),
    provider: ProviderID.make(options.provider),
  })
}

export const profileModel = (
  profile: OpenAICompatibleProfile,
  modelID: string | ModelID,
  options: FamilyModelOptions = {},
) =>
  OpenAICompatibleChat.model({
    ...withOpenAICompatibleOptions(String(modelID), options, { profile: profile.provider }),
    provider: profile.provider,
    baseURL: options.baseURL ?? profile.baseURL,
  })

const define = (profile: OpenAICompatibleProfile) =>
  Provider.make({
    id: ProviderID.make(profile.provider),
    model: (id: string | ModelID, options: FamilyModelOptions = {}) => profileModel(profile, id, options),
  })

export const provider = Provider.make({
  id,
  model: (id: string | ModelID, options: GenericModelOptions) =>
    model(id, { ...options, provider: options.provider ?? "openai-compatible" }),
})

export const baseten = define(profiles.baseten)
export const cerebras = define(profiles.cerebras)
export const cohere = define(profiles.cohere)
export const deepinfra = define(profiles.deepinfra)
export const deepseek = define(profiles.deepseek)
export const fireworks = define(profiles.fireworks)
export const groq = define(profiles.groq)
export const mistral = define(profiles.mistral)
export const perplexity = define(profiles.perplexity)
export const togetherai = define(profiles.togetherai)
export const v0 = define(profiles.v0)
