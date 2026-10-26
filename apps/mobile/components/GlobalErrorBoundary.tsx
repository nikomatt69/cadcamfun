import React from "react"
import { Platform, Text, View } from "react-native"
import { router } from "expo-router"
import Constants from "expo-constants"
import * as Clipboard from "expo-clipboard"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { layout } from "@/lib/layout"
import { canRestart, crashReport, crashSummary } from "@/lib/crash-report"

type State = { hasError: boolean; message: string; restartCount: number; details: string }

function CrashFallback({ message, restartCount, onRestart, details }: { message: string; restartCount: number; onRestart(): void; details: string }) {
  const { palette } = useTheme()
  const [copied, setCopied] = React.useState(false)
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.background, paddingHorizontal: layout.gutter, gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: palette.ink, textAlign: "center", ...type(20, { weight: "700" }) }}>Something went wrong</Text>
      <ErrorBanner message={message} />
      {canRestart(restartCount) ? (
        <ActionButton label="Restart" onPress={onRestart} />
      ) : (
        <Text selectable style={{ textAlign: "center", color: palette.soft, ...type(14) }}>
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
    return { hasError: true, message: crashSummary(error.message ?? "") }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GlobalErrorBoundary]", error, info)
    this.setState({ details: crashReport(error, info.componentStack, Constants.expoConfig?.version ?? "6.0.0", `${Platform.OS} ${String(Platform.Version)}`, new Date()) })
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
