import { ActionSheetIOS, Alert, Platform } from "react-native"

/** Asks for one line of text (iOS prompt); resolves undefined when cancelled or empty. */
export const promptText = (title: string, message?: string, defaultValue = ""): Promise<string | undefined> =>
  new Promise((resolve) => {
    if (Platform.OS !== "ios") return resolve(undefined)
    Alert.prompt(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(undefined) },
      { text: "OK", onPress: (value?: string) => resolve(value?.trim() ? value.trim() : undefined) },
    ], "plain-text", defaultValue)
  })

/** A destructive confirmation; resolves true only when the user confirms. */
export const confirmDelete = (title: string, message: string): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  })

/** An action sheet over `options`; resolves the chosen label, or undefined when dismissed. */
export const chooseAction = (title: string, options: readonly string[], destructive?: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    const labels = [...options, "Cancel"]
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ title, options: labels, cancelButtonIndex: labels.length - 1, ...(destructive ? { destructiveButtonIndex: labels.indexOf(destructive) } : {}) },
        (index) => resolve(index === labels.length - 1 ? undefined : labels[index]))
    } else {
      Alert.alert(title, undefined, labels.map((text) => ({ text, style: text === destructive ? "destructive" as const : text === "Cancel" ? "cancel" as const : "default" as const, onPress: () => resolve(text === "Cancel" ? undefined : text) })))
    }
  })
