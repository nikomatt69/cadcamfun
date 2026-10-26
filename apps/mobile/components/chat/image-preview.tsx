import { useState } from "react"
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Image } from "expo-image"
import { X } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { type as typeStyle } from "@/lib/typography"
import type { ChatPreview } from "@/lib/chat-log"

/** The full-screen viewer is always black, so its chrome is white in both themes. */
const ON_DARK = "#FFFFFF"

/** A picture full screen: pinch to zoom, the name above it, one close button. Shared by renders and photos. */
export function ImageViewer({ uri, title, onClose }: { uri: string | null; title: string; onClose: () => void }) {
  const { palette } = useTheme()
  const { width, height } = useWindowDimensions()
  return (
    <Modal visible={uri !== null} animationType="fade" presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]} onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: palette.overlay }}>
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: layout.touchTarget + 8, paddingLeft: 20, paddingRight: 8 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: ON_DARK, ...typeStyle(17, { weight: "600" }) }}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={onClose}
            style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
            <X size={22} color={ON_DARK} />
          </Pressable>
        </View>
        {/* iOS pinch-zooms a ScrollView natively; a double tap is not needed to read a picture. */}
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          {uri ? <Image source={{ uri }} contentFit="contain" accessibilityLabel={title} style={{ width, height: height * 0.8 }} /> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

/**
 * The photos that went with a message, drawn where they were sent: a single photo is a wide card, several
 * are a row of squares. A tap opens the picture full screen, so a part's photo can be checked against the answer.
 */
export function MessageImages({ images }: { images: readonly ChatPreview[] }) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const [shown, setShown] = useState<ChatPreview | null>(null)
  const single = images.length === 1
  const side = Math.round(96 * Math.min(fontScale, 1.3))
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 }}>
        {images.map((image, index) => (
          <Pressable
            key={`${image.name}-${index}`}
            onPress={() => { haptic("selection"); setShown(image) }}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo sent with the message: ${image.name}`}
            accessibilityHint="Opens the photo full screen"
            style={({ pressed }) => ({
              width: single ? side * 2 : side,
              height: single ? Math.round(side * 1.5) : side,
              borderRadius: 16,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.border,
              backgroundColor: palette.panel,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Image source={{ uri: image.uri }} contentFit="cover" transition={160} recyclingKey={image.name} style={{ width: "100%", height: "100%" }} />
          </Pressable>
        ))}
      </View>
      <ImageViewer uri={shown?.uri ?? null} title={shown?.name ?? ""} onClose={() => setShown(null)} />
    </>
  )
}
