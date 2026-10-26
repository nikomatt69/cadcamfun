import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Image } from "expo-image"
import * as Clipboard from "expo-clipboard"
import { Check, Copy, ImageOff, Maximize2, Share2, X, type LucideIcon } from "lucide-react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { usePrefersReducedMotion } from "@/lib/animation"
import { bubbleImageWidth, clampAspect, imageGrid } from "@/lib/chat-geometry"
import { type as typeStyle } from "@/lib/typography"
import type { ChatPreview } from "@/lib/chat-log"

/** The full-screen viewer is always black, so its chrome is white in both themes. */
const ON_DARK = "#FFFFFF"

/** The base64 payload of a `data:` URL, which is what the clipboard takes; null for anything else. */
const base64Of = (uri: string): string | null => (uri.startsWith("data:") ? uri.slice(uri.indexOf(",") + 1) || null : null)

function ViewerButton({ label, Icon, done, onPress }: { label: string; Icon: LucideIcon; done?: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={done ? `${label}, done` : label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
      {done ? <Check size={20} color={ON_DARK} /> : <Icon size={20} color={ON_DARK} />}
    </Pressable>
  )
}

/**
 * A picture full screen: pinch to zoom, the name above it, and Copy / Share / Close. Shared by renders and photos.
 * Copy puts the image itself on the clipboard (to paste into a note or a message); Share hands it to the system share
 * sheet, where "Save Image" or "Save to Files" keep it. Both work from the inline picture the phone already holds, so
 * the viewer needs no file or photo-library permission.
 */
export function ImageViewer({ uri, title, onClose }: { uri: string | null; title: string; onClose: () => void }) {
  const { palette } = useTheme()
  const { width, height } = useWindowDimensions()
  const reduced = usePrefersReducedMotion()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const payload = uri ? base64Of(uri) : null

  useEffect(() => {
    setLoading(true)
    setFailed(false)
    setCopied(false)
  }, [uri])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copyImage = async () => {
    if (!payload) return
    try {
      await Clipboard.setImageAsync(payload)
      haptic("success")
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      haptic("error")
    }
  }
  const shareImage = async () => {
    if (!uri) return
    haptic("selection")
    try { await Share.share({ url: uri }) } catch { /* The sheet was dismissed or the system refused: nothing to undo. */ }
  }

  return (
    <Modal visible={uri !== null} animationType={reduced ? "none" : "fade"} presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]} onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} accessibilityViewIsModal style={{ flex: 1, backgroundColor: palette.overlay }}>
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: layout.touchTarget + 8, paddingLeft: 20, paddingRight: 4 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: ON_DARK, ...typeStyle(17, { weight: "600" }) }}>{title}</Text>
          {payload ? <ViewerButton label="Copy image" Icon={Copy} done={copied} onPress={() => void copyImage()} /> : null}
          <ViewerButton label="Share image" Icon={Share2} onPress={() => void shareImage()} />
          <ViewerButton label="Close image" Icon={X} onPress={onClose} />
        </View>
        {/* iOS pinch-zooms a ScrollView natively; a double tap is not needed to read a picture. */}
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          {uri && !failed ? (
            <Image source={{ uri }} contentFit="contain" transition={reduced ? 0 : 180} accessibilityLabel={`${title}. Pinch to zoom`}
              onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true) }}
              style={{ width, height: height * 0.8 }} />
          ) : null}
          {failed ? (
            <View accessible accessibilityLabel="The image could not be shown" style={{ alignItems: "center", gap: 10 }}>
              <ImageOff size={28} color={hexToRgba(ON_DARK, 0.7)} />
              <Text style={{ color: hexToRgba(ON_DARK, 0.7), ...typeStyle(14) }}>The image could not be shown</Text>
            </View>
          ) : null}
          {loading && !failed ? <View pointerEvents="none" style={{ position: "absolute", alignSelf: "center" }}><ActivityIndicator color={ON_DARK} /></View> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

/**
 * One thumbnail, the same everywhere a picture is drawn small (photos in a bubble, renders in a tool card): rounded
 * corners with a hairline edge, a cross-dissolve while it loads over the panel colour, a quiet glyph when it cannot be
 * decoded, and an optional corner badge (a render's "1/2"). The tap target is the whole tile.
 */
export function ImageThumb({ uri, label, hint = "Opens the image full screen", onPress, style, radius = 12, contentFit = "cover", badge, expandGlyph = false, onSize }: {
  uri: string
  label: string
  hint?: string
  onPress(): void
  style?: StyleProp<ViewStyle>
  radius?: number
  contentFit?: "cover" | "contain"
  badge?: string
  /** A small expand glyph in the corner says the tile opens larger. */
  expandGlyph?: boolean
  /** The picture's pixel size once it has loaded, for a card that follows its aspect ratio. */
  onSize?: (width: number, height: number) => void
}) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const [failed, setFailed] = useState(false)
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={label} accessibilityHint={hint}
      style={({ pressed }) => [{ borderRadius: radius, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: hexToRgba(palette.border, 0.7), backgroundColor: palette.panel, opacity: pressed ? 0.85 : 1 }, style]}>
      {failed ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}>
          <ImageOff size={20} color={palette.muted} />
          <Text style={{ color: palette.muted, ...typeStyle(11, { weight: "600" }) }}>Unavailable</Text>
        </View>
      ) : (
        <Image source={{ uri }} contentFit={contentFit} transition={reduced ? 0 : 200} recyclingKey={label} accessible={false}
          onLoad={(event) => onSize?.(event.source.width, event.source.height)} onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%" }} />
      )}
      {badge ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 6, top: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderCurve: "continuous", backgroundColor: hexToRgba("#000000", isDark ? 0.6 : 0.5) }}>
          <Text style={{ color: ON_DARK, fontVariant: ["tabular-nums"], ...typeStyle(11, { weight: "600" }) }}>{badge}</Text>
        </View>
      ) : null}
      {expandGlyph && !failed ? (
        <View pointerEvents="none" style={{ position: "absolute", right: 6, bottom: 6, width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: hexToRgba("#000000", isDark ? 0.6 : 0.5) }}>
          <Maximize2 size={12} color={ON_DARK} />
        </View>
      ) : null}
    </Pressable>
  )
}

/**
 * The photos that went with a message, drawn where they were sent and looking like nikcli's file parts: a card with a
 * hairline edge, the picture at its own aspect ratio and the file name under it. Several photos become a grid of
 * squares. A tap opens the picture full screen, so a part's photo can be checked against the answer.
 */
export function MessageImages({ images }: { images: readonly ChatPreview[] }) {
  const { palette } = useTheme()
  const { width, fontScale } = useWindowDimensions()
  const [shown, setShown] = useState<ChatPreview | null>(null)
  const [aspect, setAspect] = useState<number | null>(null)
  const cardWidth = bubbleImageWidth(width, fontScale)
  const caption = Math.min(fontScale, 1.3)

  if (images.length === 1) {
    const image = images[0]!
    const ratio = aspect ?? 4 / 3
    return (
      <>
        <View style={{ width: cardWidth, borderRadius: 12, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: hexToRgba(palette.border, 0.7), backgroundColor: palette.surface }}>
          <ImageThumb uri={image.uri} label={`Photo sent with the message: ${image.name}`} contentFit="contain" radius={0}
            onPress={() => { haptic("selection"); setShown(image) }} onSize={(w, h) => setAspect(clampAspect(w, h))}
            style={{ width: cardWidth, height: Math.min(cardWidth / ratio, 320 * caption), borderWidth: 0 }} />
          {image.name ? <Text numberOfLines={1} style={{ color: palette.muted, paddingHorizontal: 10, paddingVertical: 6, ...typeStyle(11) }}>{image.name}</Text> : null}
        </View>
        <ImageViewer uri={shown?.uri ?? null} title={shown?.name ?? ""} onClose={() => setShown(null)} />
      </>
    )
  }

  const grid = imageGrid(images.length, cardWidth)
  return (
    <>
      <View style={{ width: cardWidth, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {images.map((image, index) => (
          <ImageThumb key={`${image.name}-${index}`} uri={image.uri} label={`Photo ${index + 1} of ${images.length} sent with the message: ${image.name}`}
            onPress={() => { haptic("selection"); setShown(image) }} style={{ width: grid.tile, height: grid.tile }} />
        ))}
      </View>
      <ImageViewer uri={shown?.uri ?? null} title={shown?.name ?? ""} onClose={() => setShown(null)} />
    </>
  )
}
