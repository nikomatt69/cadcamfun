import { Route, type RouteModelInput } from "../route/client"
import { Provider } from "../provider"
import { ProviderID, type ModelID, type TypedModelRef } from "../schema"
import * as BedrockConverse from "../protocols/bedrock-converse"
import type { BedrockCredentials } from "../protocols/bedrock-converse"
import { withBedrockOptions, type BedrockProviderOptionsInput, type BedrockVariant } from "./bedrock-options"

export type {
  BedrockOptionsInput,
  BedrockProviderOptionsInput,
  BedrockReasoningConfig,
  BedrockVariant,
} from "./bedrock-options"

export const id = ProviderID.make("amazon-bedrock")

export type ModelOptions = Omit<RouteModelInput, "id" | "baseURL" | "providerOptions"> & {
  readonly apiKey?: string
  readonly headers?: Record<string, string>
  readonly credentials?: BedrockCredentials
  /** AWS region. Defaults to `us-east-1` when neither this nor `credentials.region` is set. */
  readonly region?: string
  /** Override the computed `https://bedrock-runtime.<region>.amazonaws.com` URL. */
  readonly baseURL?: string
  readonly providerOptions?: BedrockProviderOptionsInput
  readonly variant?: BedrockVariant
}
type ModelInput = ModelOptions & Pick<RouteModelInput, "id">

export const routes = [BedrockConverse.route]

const bedrockBaseURL = (region: string) => `https://bedrock-runtime.${region}.amazonaws.com`

const converseModel = Route.model<ModelInput>(
  BedrockConverse.route,
  {
    provider: "amazon-bedrock",
  },
  {
    mapInput: (input) => {
      const { credentials, region, baseURL, variant: _variant, ...rest } = input
      const resolvedRegion = region ?? credentials?.region ?? "us-east-1"
      return {
        ...rest,
        baseURL: baseURL ?? bedrockBaseURL(resolvedRegion),
        native: BedrockConverse.nativeCredentials(input.native, credentials),
      }
    },
  },
)

export const model = (
  modelID: string | ModelID,
  options: ModelOptions = {},
): TypedModelRef<BedrockProviderOptionsInput> => {
  const { variant, ...rest } = options
  return converseModel({ ...withBedrockOptions(String(modelID), rest, { variant }) })
}

export const provider = Provider.make({
  id,
  model,
})
