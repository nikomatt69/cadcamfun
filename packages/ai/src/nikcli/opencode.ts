/** OpenCode account keys also authorize Go subscriptions; OAuth is not its documented connection method. */
export const OPENCODE_PROVIDERS = ["opencode", "opencode-go"] as const
export const isOpenCodeProvider = (id: string): boolean => (OPENCODE_PROVIDERS as ReadonlyArray<string>).includes(id)

/** models.dev supplies the full, protocol-specific catalogue; retain one documented open-model fallback. */
export const openCodeProviderSpecs = () => OPENCODE_PROVIDERS.map((id) => ({
  id, name: id === "opencode" ? "OpenCode Zen" : "OpenCode Go",
  protocol: "openai-compatible" as const,
  baseURL: `https://opencode.ai/inference/${id === "opencode-go" ? "go/" : ""}openai/v1`,
  catalogueRouting: true,
  models: [{ id: "minimax-m3", name: "MiniMax M3" }]
}))
