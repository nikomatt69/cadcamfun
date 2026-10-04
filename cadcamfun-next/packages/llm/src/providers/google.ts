import type { RouteModelInput } from "../route/client"
import { Provider } from "../provider"
import { ProviderID, type ModelID, type TypedModelRef } from "../schema"
import * as Gemini from "../protocols/gemini"
import { withGoogleOptions, type GoogleProviderOptionsInput, type GoogleVariant } from "./google-options"

export type { GoogleOptionsInput, GoogleProviderOptionsInput, GoogleVariant } from "./google-options"

export const id = ProviderID.make("google")

export type ModelOptions = Omit<RouteModelInput, "id" | "baseURL" | "providerOptions"> & {
  readonly baseURL?: string
  readonly providerOptions?: GoogleProviderOptionsInput
  readonly variant?: GoogleVariant
  readonly enableThoughts?: boolean
}

export const routes = [Gemini.route]

export const model = (
  modelID: string | ModelID,
  options: ModelOptions = {},
): TypedModelRef<GoogleProviderOptionsInput> => {
  const { variant, enableThoughts, ...rest } = options
  return Gemini.model(withGoogleOptions(String(modelID), rest, { variant, enableThoughts }))
}

export const provider = Provider.make({
  id,
  model,
})
