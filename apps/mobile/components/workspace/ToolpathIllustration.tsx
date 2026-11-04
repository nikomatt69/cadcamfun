import { Text, View } from "react-native"
import Svg, { Path, Rect } from "react-native-svg"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

/** A labelled illustration of the review experience, never a preview of project data. */
export function ToolpathIllustration() {
  const { palette } = useTheme()
  return <View accessibilityRole="image" accessibilityLabel="Illustration of a toolpath review" style={{ overflow: "hidden", borderRadius: 18, borderCurve: "continuous", backgroundColor: palette.surface, borderWidth: 0.5, borderColor: palette.border }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 }}>
      <Text style={{ color: palette.ink, ...type(13, { weight: "600" }) }}>Toolpath review</Text>
      <Text style={{ color: palette.muted, ...type(11) }}>Illustration</Text>
    </View>
    <Svg width="100%" height={130} viewBox="0 0 320 130" accessibilityElementsHidden>
      <Path d="M40 91 L152 35 L278 76 L166 128 Z" fill={palette.background} stroke={palette.border} strokeWidth="1" />
      <Path d="M64 89 L154 45 L255 78 L165 119 Z" fill="none" stroke={palette.accent} strokeWidth="2" />
      <Path d="M78 91 L155 53 L241 80 L165 112 Z M91 93 L156 61 L227 82 L165 105 Z M105 95 L157 69 L213 84 L165 98 Z" fill="none" stroke={palette.accent} strokeWidth="1.5" opacity={0.7} />
      <Path d="M157 15 L157 67" stroke={palette.muted} strokeWidth="2" />
      <Rect x="151" y="18" width="12" height="26" rx="3" fill={palette.ink} />
      <Path d="M152 44 L162 44 L159 67 L155 67 Z" fill={palette.soft} />
    </Svg>
    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <Text style={{ color: palette.soft, ...type(12) }}>Inspect the path and follow each G-code block.</Text>
    </View>
  </View>
}
