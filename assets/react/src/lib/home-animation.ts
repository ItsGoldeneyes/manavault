import { useLocalStorageState } from "./use-local-storage"

const storageKey = "manavault:home-animation"
const deserialize = (value: string) => value !== "false"
const shouldRemove = (enabled: boolean) => enabled

/** Per-device preference for the animated home screen backdrop and entrance. */
export function useHomeAnimation() {
  return useLocalStorageState<boolean>(storageKey, true, { deserialize, shouldRemove })
}
