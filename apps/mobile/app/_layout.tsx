import { useEffect } from "react"
import { usePathname, useRouter } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { StatusBar } from "expo-status-bar"
import { Stack } from "expo-router"
import { ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from "expo-router/react-navigation"
import { ThemeProvider, useTheme } from "@/lib/theme"
import { ServerProvider, useServer } from "@/lib/server"
import { configureNotificationHandler } from "@/lib/notifications"
import * as Notifications from "expo-notifications"
import { setupOfflineDrainOnForeground } from "@/lib/offline-queue"
import { ToastHost } from "@/components/ui/ToastHost"
import { AppLockCoordinator } from "@/components/layout/AppLockCoordinator"
import { GlobalErrorBoundary } from "@/components/GlobalErrorBoundary"
import "@/global.css"

/**
 * Root layout: providers (theme → server), then a Stack with the boot screen, the pairing sheet
 * and the signed-in (app) group. The pairing screen is a full-screen modal from the bottom, like
 * every iOS first-run setup; the (app) group owns NativeTabs internally.
 */
function Gate() {
  const { booting, config, client } = useServer()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (booting || pathname === "/pair") return
    if (!config || !client) {
      if (pathname !== "/connect") router.replace("/connect")
    } else if (pathname === "/" || pathname === "/connect") {
      router.replace("/projects")
    }
  }, [booting, config, client, pathname, router])

  return null
}

/** Tapping a native notification opens the synced Activity feed it came from. */
function NotificationTap() {
  const router = useRouter()
  useEffect(() => {
    configureNotificationHandler()
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.push("/(app)/activity" as never))
    return () => sub.remove()
  }, [router])
  return null
}

function OfflineDrain() {
  const { config } = useServer()
  useEffect(() => setupOfflineDrainOnForeground(() => config), [config])
  return null
}

function ThemedStack() {
  const { palette, colorScheme } = useTheme()
  const baseTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme
  const navigationTheme = { ...baseTheme, colors: { ...baseTheme.colors, primary: palette.accent, background: palette.background, card: palette.surface, text: palette.ink, border: palette.border, notification: palette.danger } }
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Gate />
      <NotificationTap />
      <OfflineDrain />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.accent,
          headerShadowVisible: false,
          headerTitleStyle: { color: palette.ink },
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="pair" options={{ headerShown: false }} />
        <Stack.Screen
          name="connect"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
      <ToastHost />
      <AppLockCoordinator />
    </NavigationThemeProvider>
  )
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <GlobalErrorBoundary>
            <ServerProvider>
              <ThemedStack />
            </ServerProvider>
          </GlobalErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
