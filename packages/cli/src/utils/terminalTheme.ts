/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type TerminalBackgroundColor,
  terminalCapabilityManager,
} from '../ui/utils/terminalCapabilityManager.js';
import { themeManager, DEFAULT_THEME } from '../ui/themes/theme-manager.js';
import { getThemeTypeFromBackgroundColor } from '../ui/themes/color-utils.js';
import type { LoadedSettings } from '../config/settings.js';
import { type Config, coreEvents, debugLogger } from '@google/gemini-cli-core';

/**
 * Detects terminal capabilities, loads themes, and sets the active theme.
 * @param config The application config.
 * @param settings The loaded settings.
 * @returns The detected terminal background color.
 */
export async function setupTerminalAndTheme(
  config: Config,
  settings: LoadedSettings,
): Promise<TerminalBackgroundColor> {
  let terminalBackground: TerminalBackgroundColor = undefined;
  if (config.isInteractive() && process.stdin.isTTY) {
    // Detect terminal capabilities (Kitty protocol, background color) in parallel.
    await terminalCapabilityManager.detectCapabilities();
    terminalBackground = terminalCapabilityManager.getTerminalBackgroundColor();
  }

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.ui.customThemes);

  if (settings.merged.ui.theme) {
    if (!themeManager.setActiveTheme(settings.merged.ui.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in AppContainer.tsx will handle opening the dialog.
      debugLogger.warn(
        `Warning: Theme "${settings.merged.ui.theme}" not found.`,
      );
    }
  } else {
    // mr-coder fork: always start on the fork's default theme (Mr Coder).
    // Upstream's pickDefaultThemeName() first exact-matches the detected
    // terminal background against every theme's Background color, and
    // DefaultDark's Background is #000000 — so on any black terminal it
    // silently returned "Default" and overrode the fork's default theme.
    // A theme the user picks via /theme or settings still wins (above).
    themeManager.setActiveTheme(DEFAULT_THEME.name);
  }

  config.setTerminalBackground(terminalBackground);
  // mr-coder fork: do NOT hand the detected terminal background to the
  // theme manager. Upstream blends panel/message/border colors toward
  // the terminal background, which washes out the active theme; MiMo
  // Code (the fork's look target) renders its theme colors flat, so the
  // fork does the same. Detection above still drives the compatibility
  // warning below.
  themeManager.setTerminalBackground(undefined);

  if (
    terminalBackground !== undefined &&
    (settings.merged.ui.autoThemeSwitching ?? true)
  ) {
    const currentTheme = themeManager.getActiveTheme();
    if (!themeManager.isThemeCompatible(currentTheme, terminalBackground)) {
      const backgroundType =
        getThemeTypeFromBackgroundColor(terminalBackground);
      coreEvents.emitFeedback(
        'warning',
        `Theme '${currentTheme.name}' (${currentTheme.type}) might look incorrect on your ${backgroundType} terminal background. Type /theme to change theme.`,
      );
    }
  }

  return terminalBackground;
}
