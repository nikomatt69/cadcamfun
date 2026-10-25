/**
 * What a conversation costs.
 *
 * The provider catalogue prices every model in USD per million tokens, so the
 * cost of a turn is arithmetic, not a guess. What the catalogue does not price
 * stays unknown: the assistant says so rather than showing a number that could
 * be wrong.
 */
import type { AiUsage, ChatModel, ProviderInfo } from "./types.ts"

/** USD per million tokens, as the catalogue lists it. */
export interface CostRates {
  readonly input: number
  readonly output: number
}

/** The price of one model, from the provider catalogue. */
export const ratesFor = (model: ChatModel | undefined, providers: ReadonlyArray<ProviderInfo>): CostRates | undefined => {
  if (model === undefined) return undefined
  const listed = providers.find((provider) => provider.id === model.provider)?.models.find((entry) => entry.id === model.model)
  if (listed === undefined) return undefined
  return { input: listed.cost.input, output: listed.cost.output }
}

/**
 * What a turn cost, in USD. The rates are per million tokens, so the tokens are
 * scaled down before they are multiplied.
 */
export const costOf = (usage: AiUsage | undefined, rates: CostRates | undefined): number | undefined => {
  if (usage === undefined || rates === undefined) return undefined
  return (usage.inputTokens * rates.input + usage.outputTokens * rates.output) / 1_000_000
}

/** The cost of a whole conversation: every turn that reported its usage. */
export const conversationCost = (
  messages: ReadonlyArray<{ readonly usage?: AiUsage }>,
  rates: CostRates | undefined
): number | undefined => {
  if (rates === undefined) return undefined
  let total = 0
  let counted = false
  for (const message of messages) {
    const cost = costOf(message.usage, rates)
    if (cost !== undefined) { total += cost; counted = true }
  }
  return counted ? total : undefined
}

/** A price as it is shown: cents while it is small, dollars once it is not. */
export const formatCost = (usd: number | undefined): string => {
  if (usd === undefined) return "—"
  if (usd === 0) return "$0.00"
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}
