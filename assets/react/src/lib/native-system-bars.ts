import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core"

/**
 * The native shells draw the page behind transparent system bars, so their icons must contrast
 * with the page: light icons on a dark page, dark icons on a light one.
 */
export function setNativeSystemBarsTheme(theme: "light" | "dark") {
  if (!Capacitor.isNativePlatform()) return
  SystemBars.setStyle({
    style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  }).catch(() => {
    // Older native shells without the SystemBars plugin keep their fixed style.
  })
}

/** The system bar style for the page's current theme. */
export function restoreNativeSystemBarsTheme() {
  setNativeSystemBarsTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark")
}
