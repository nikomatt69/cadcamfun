import { Provider } from "../provider"
import { ProviderID, type ModelID } from "../schema"
import * as OpenAICompatibleChat from "../protocols/openai-compatible-chat"
import type { OpenAICompatibleChatModelInput } from "../protocols/openai-compatible-chat"

export const id = ProviderID.make("nikcli-inference")
export const baseURL = "https://inference.nikcli-ai.dev/v1"

export type ModelOptions = Omit<OpenAICompatibleChatModelInput, "id" | "provider" | "baseURL"> & {
  readonly baseURL?: string
}

export const routes = [OpenAICompatibleChat.route]

export const model = (id: string | ModelID, options: ModelOptions = {}) =>
  OpenAICompatibleChat.model({
    ...options,
    id,
    provider: ProviderID.make("nikcli-inference"),
    baseURL: options.baseURL ?? baseURL,
  })

export const provider = Provider.make({
  id,
  model,
})
