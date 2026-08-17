"use client";

import { useEffect } from "react";
import { usePreferences } from "@/lib/usePreferences";
import { applyTheme } from "@/lib/theme";

/**
 * Keeps <html class="dark"> in sync with the stored theme preference —
 * on mount, whenever /perfil changes it, and (while the preference is
 * "system") whenever the OS scheme itself changes. The inline script in
 * layout.tsx already set the right class before first paint; this is what
 * keeps it right afterwards. Renders nothing.
 */
export function ThemeSync() {
  const [{ theme }] = usePreferences();

  useEffect(() => applyTheme(theme), [theme]);

  return null;
}
