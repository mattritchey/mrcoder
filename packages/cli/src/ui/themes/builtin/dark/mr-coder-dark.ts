/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mr Coder theme — the default theme for the mr-coder fork.
 *
 * Palette is a direct port of MiMo Code's default theme
 * (`mimocode.json` in XiaomiMiMo/MiMo-Code,
 * packages/cli/src/cli/cmd/tui/context/theme/mimocode.json):
 *
 *   background        darkStep1  #0a0a0a
 *   backgroundPanel   darkStep2  #141414
 *   backgroundElement darkStep3  #1e1e1e
 *   primary           darkStep9  #FF6A00  (MiMo orange)
 *   secondary         darkSecondary #FF8A3C
 *   accent            darkAccent #818CF8  (indigo)
 *   error             darkRed    #FB7185
 *   warning           darkOrange #FBBF24
 *   success           darkGreen  #FF6A00  (MiMo maps success/string to its orange)
 *   text              darkStep12 #eeeeee
 *   textMuted         darkStep11 #808080
 *   border            darkStep7  #484848
 *   diffAddedBg                  #20303b
 *   diffRemovedBg                #37222c
 *
 * All other Gemini CLI features are unchanged; this is a theme only.
 */

import type { ColorsTheme } from '../../theme.js';
import { Theme } from '../../theme.js';
import type { SemanticColors } from '../../semantic-tokens.js';

const palette = {
  bg: '#0a0a0a',
  bgPanel: '#141414',
  bgElement: '#1e1e1e',
  step4: '#282828',
  step5: '#323232',
  step6: '#3c3c3c',
  border: '#484848',
  borderActive: '#606060',
  primary: '#FF6A00',
  secondary: '#FF8A3C',
  accent: '#818CF8',
  red: '#FB7185',
  warning: '#FBBF24',
  yellow: '#e5c07b',
  fg: '#eeeeee',
  muted: '#808080',
  diffAdded: '#4fd6be',
  diffRemoved: '#c53b53',
  diffAddedBg: '#20303b',
  diffRemovedBg: '#37222c',
};

const mrCoderColors: ColorsTheme = {
  type: 'dark',
  Background: palette.bg,
  Foreground: palette.fg,
  LightBlue: palette.secondary,
  AccentBlue: palette.primary,
  AccentPurple: palette.accent,
  AccentCyan: palette.secondary,
  AccentGreen: palette.primary,
  AccentYellow: palette.warning,
  AccentRed: palette.red,
  DiffAdded: palette.diffAddedBg,
  DiffRemoved: palette.diffRemovedBg,
  Comment: palette.muted,
  Gray: palette.muted,
  DarkGray: palette.border,
  InputBackground: palette.bgPanel,
  MessageBackground: palette.bgPanel,
  FocusBackground: palette.bgElement,
  FocusColor: palette.primary,
  GradientColors: [palette.primary, palette.secondary, palette.accent],
};

const mrCoderSemanticColors: SemanticColors = {
  text: {
    primary: palette.fg,
    secondary: palette.muted,
    link: palette.primary,
    accent: palette.accent,
    response: palette.fg,
  },
  background: {
    primary: palette.bg,
    message: palette.bgPanel,
    input: palette.bgPanel,
    focus: palette.bgElement,
    diff: {
      added: palette.diffAddedBg,
      removed: palette.diffRemovedBg,
    },
  },
  border: {
    default: palette.border,
  },
  ui: {
    comment: palette.muted,
    symbol: palette.secondary,
    active: palette.primary,
    dark: palette.border,
    focus: palette.primary,
    gradient: [palette.primary, palette.secondary, palette.accent],
  },
  status: {
    error: palette.red,
    success: palette.primary,
    warning: palette.warning,
  },
};

export const MrCoder: Theme = new Theme(
  'Mr Coder',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: palette.bg,
      color: palette.fg,
    },
    'hljs-keyword': { color: palette.accent },
    'hljs-literal': { color: palette.primary },
    'hljs-symbol': { color: palette.primary },
    'hljs-name': { color: palette.primary },
    'hljs-link': { color: palette.primary, textDecoration: 'underline' },
    'hljs-built_in': { color: palette.secondary },
    'hljs-type': { color: palette.yellow },
    'hljs-number': { color: palette.warning },
    'hljs-class': { color: palette.yellow },
    'hljs-string': { color: palette.primary },
    'hljs-meta-string': { color: palette.primary },
    'hljs-regexp': { color: palette.red },
    'hljs-template-tag': { color: palette.red },
    'hljs-subst': { color: palette.fg },
    'hljs-function': { color: palette.primary },
    'hljs-title': { color: palette.primary },
    'hljs-params': { color: palette.fg },
    'hljs-formula': { color: palette.fg },
    'hljs-comment': { color: palette.muted, fontStyle: 'italic' },
    'hljs-quote': { color: palette.muted, fontStyle: 'italic' },
    'hljs-doctag': { color: palette.muted },
    'hljs-meta': { color: palette.muted },
    'hljs-meta-keyword': { color: palette.muted },
    'hljs-tag': { color: palette.muted },
    'hljs-variable': { color: palette.red },
    'hljs-template-variable': { color: palette.red },
    'hljs-attr': { color: palette.secondary },
    'hljs-attribute': { color: palette.secondary },
    'hljs-builtin-name': { color: palette.secondary },
    'hljs-section': { color: palette.warning },
    'hljs-emphasis': { fontStyle: 'italic' },
    'hljs-strong': { fontWeight: 'bold' },
    'hljs-bullet': { color: palette.warning },
    'hljs-selector-tag': { color: palette.warning },
    'hljs-selector-id': { color: palette.warning },
    'hljs-selector-class': { color: palette.warning },
    'hljs-selector-attr': { color: palette.warning },
    'hljs-selector-pseudo': { color: palette.warning },
    'hljs-addition': {
      backgroundColor: palette.diffAddedBg,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: palette.diffRemovedBg,
      display: 'inline-block',
      width: '100%',
    },
  },
  mrCoderColors,
  mrCoderSemanticColors,
);
