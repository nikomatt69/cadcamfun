import React from "react"
import { Platform, Text, View } from "react-native"
import { router } from "expo-router"
import Constants from "expo-constants"
import * as Clipboard from "expo-clipboard"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { useTheme } from "@/lib/theme"

const MAX_RESTARTS = 3

type State = { hasError: boolean; message: string; restartCount: number; details: string }

/** What support needs to place a crash: the message, where React was rendering, and the build. Never user data. */
export const crashReport = (error: { name?: string; message?: string; stack?: string }, componentStack: string | null | undefined, build: string, at: Date): string => [
  `CADCAMFUN ${build} · ${Platform.OS} ${String(Platform.Version)} · ${at.toISOString()}`,
  `${error.name ?? "Error"}: ${error.message ?? "Unknown error"}`,
  ...(error.stack ? ["", error.stack.split("\n").slice(0, 12).join("\n")] : []),
  ...(componentStack ? ["", "Components:", componentStack.trim().split("\n").slice(0, 12).join("\n")] : []),
].join("\n")

function CrashFallback({ message, restartCount, onRestart, details }: { message: string; restartCount: number; onRestart(): void; details: string }) {
  const { palette } = useTheme()
  const [copied, setCopied] = React.useState(false)
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.background, paddingHorizontal: 24, gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: "700", textAlign: "center" }}>Something went wrong</Text>
      <ErrorBanner message={message} />
      {restartCount < MAX_RESTARTS ? (
        <ActionButton label="Restart" onPress={onRestart} />
      ) : (
        <Text selectable style={{ textAlign: "center", color: palette.soft, fontSize: 14, lineHeight: 20 }}>
          The app encountered a persistent error. Please close and reopen the app.
        </Text>
      )}
      {details ? <ActionButton label={copied ? "Details copied" : "Copy error details"} variant="secondary" onPress={() => { void Clipboard.setStringAsync(details).then(() => setCopied(true)).catch(() => undefined) }} /> : null}
    </View>
  )
}

/** Catches render crashes per route subtree so one bad panel cannot blank the app. */
export class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: "", restartCount: 0, details: "" }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, message: error.message || "An unexpected error occurred." }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GlobalErrorBoundary]", error, info)
    this.setState({ details: crashReport(error, info.componentStack, Constants.expoConfig?.version ?? "6.0.0", new Date()) })
  }

  render() {
    if (this.state.hasError) {
      return (
        <CrashFallback
          message={this.state.message}
          restartCount={this.state.restartCount}
          details={this.state.details}
          onRestart={() => {
            this.setState((previous) => ({ hasError: false, message: "", details: "", restartCount: previous.restartCount + 1 }))
            router.replace("/")
          }}
        />
      )
    }
    return this.props.children
  }
}
