import React from "react"
import { Text, View } from "react-native"
import { router } from "expo-router"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { useTheme } from "@/lib/theme"

const MAX_RESTARTS = 3

type State = { hasError: boolean; message: string; restartCount: number }

function CrashFallback({ message, restartCount, onRestart }: { message: string; restartCount: number; onRestart(): void }) {
  const { palette } = useTheme()
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.background, paddingHorizontal: 24, gap: 16 }}>
      <ErrorBanner message={message} />
      {restartCount < MAX_RESTARTS ? (
        <ActionButton label="Restart" onPress={onRestart} />
      ) : (
        <Text selectable style={{ textAlign: "center", color: palette.soft, fontSize: 14, lineHeight: 20 }}>
          The app encountered a persistent error. Please close and reopen the app.
        </Text>
      )}
    </View>
  )
}

/** Catches render crashes per route subtree so one bad panel cannot blank the app. */
export class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: "", restartCount: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, message: error.message || "An unexpected error occurred." }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GlobalErrorBoundary]", error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <CrashFallback
          message={this.state.message}
          restartCount={this.state.restartCount}
          onRestart={() => {
            this.setState((previous) => ({ hasError: false, message: "", restartCount: previous.restartCount + 1 }))
            router.replace("/")
          }}
        />
      )
    }
    return this.props.children
  }
}
