import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { defaultTagCollection, type TagCollection } from "./list-tags"

interface TagState {
  collections: Record<string, TagCollection>
  update: (scope: string, change: (collection: TagCollection) => TagCollection) => void
}
const initial = defaultTagCollection()
const useTagStore = create<TagState>()(persist((set) => ({
  collections: {},
  update: (scope, change) => set((state) => ({ collections: { ...state.collections, [scope]: change(state.collections[scope] ?? initial) } })),
}), { name: "cadcamfun.list-tags.v1", storage: createJSONStorage(() => AsyncStorage) }))

export function useListTags(scope: string) {
  const collection = useTagStore((state) => state.collections[scope] ?? initial)
  const update = useTagStore((state) => state.update)
  return { collection, update: (change: (value: TagCollection) => TagCollection) => update(scope, change) }
}
