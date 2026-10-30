/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: smart approve (Goose-style). When enabled, read-only
// ('low') tool calls are allowed without prompting; file writes/edits
// ('medium') and shell calls ('high') go through the existing approval
// flow exactly as before. The flag is persisted in user settings and,
// when a live config is available, applied to the running policy
// engine immediately (it also takes effect on the next launch via the
// persisted flag once the coordinator wires settings into the engine
// config). Default is OFF.
//   /smart-approve on | off | status   (bare /smart-approve = status)

import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { SettingScope } from '../../config/settings.js';

/** Settings key for the smart-approve flag (user scope). */
export const SMART_APPROVE_SETTING_KEY = 'tools.smartApprove';

/** Default for the smart-approve flag: OFF. */
export const SMART_APPROVE_DEFAULT = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the smart-approve flag from merged settings. Anything other
 * than an explicit boolean true reads as OFF (the default).
 */
export function isSmartApproveEnabled(merged: unknown): boolean {
  if (!isRecord(merged)) {
    return SMART_APPROVE_DEFAULT;
  }
  const tools = merged['tools'];
  if (!isRecord(tools)) {
    return SMART_APPROVE_DEFAULT;
  }
  const value = tools['smartApprove'];
  if (typeof value === 'boolean') {
    return value;
  }
  return SMART_APPROVE_DEFAULT;
}

function message(
  content: string,
  messageType: 'info' | 'error' = 'info',
): SlashCommandActionReturn {
  return { type: 'message', messageType, content };
}

function statusText(enabled: boolean): string {
  return enabled
    ? 'Smart approve is ON: read-only tool calls are allowed without prompting. File writes/edits and shell calls still ask for approval.'
    : 'Smart approve is OFF: all tool calls go through the existing approval flow. Run /smart-approve on to enable it.';
}

function applyToLiveEngine(context: CommandContext, enabled: boolean): void {
  try {
    const config = context.services.agentContext?.config;
    const policyEngine = config?.getPolicyEngine();
    if (policyEngine) {
      policyEngine.setSmartApproveEnabled(enabled);
    }
  } catch {
    // The persisted flag still stands; the engine picks it up on the
    // next launch. Never fail the toggle because the live engine
    // could not be reached.
  }
}

function setSmartApprove(
  context: CommandContext,
  enabled: boolean,
): SlashCommandActionReturn {
  context.services.settings.setValue(
    SettingScope.User,
    SMART_APPROVE_SETTING_KEY,
    enabled,
  );
  applyToLiveEngine(context, enabled);
  return message(
    enabled
      ? 'Smart approve is ON: read-only tool calls are allowed without prompting. File writes/edits and shell calls still ask for approval.'
      : 'Smart approve is OFF: all tool calls go through the existing approval flow.',
  );
}

function showStatus(context: CommandContext): SlashCommandActionReturn {
  return message(
    statusText(isSmartApproveEnabled(context.services.settings.merged)),
  );
}

function handleSubcommand(
  context: CommandContext,
  subcommand: string,
): SlashCommandActionReturn {
  if (subcommand === 'on') {
    return setSmartApprove(context, true);
  }
  if (subcommand === 'off') {
    return setSmartApprove(context, false);
  }
  if (subcommand === 'status' || subcommand === '') {
    return showStatus(context);
  }
  return message('Usage: /smart-approve on | off | status', 'error');
}

function makeSubcommand(name: string, description: string): SlashCommand {
  return {
    name,
    description,
    kind: CommandKind.BUILT_IN,
    autoExecute: true,
    action: (context: CommandContext) => handleSubcommand(context, name),
  };
}

export const smartApproveCommand: SlashCommand = {
  name: 'smart-approve',
  description:
    'Smart approve: auto-allow read-only tool calls without prompting (/smart-approve on, off, status)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  subCommands: [
    makeSubcommand('on', 'Enable smart approve'),
    makeSubcommand('off', 'Disable smart approve'),
    makeSubcommand('status', 'Show whether smart approve is on or off'),
  ],
  action: (context: CommandContext, args: string) => {
    // The framework passes args positionally; fall back to the
    // invocation record for callers that only set that.
    const raw = (args || context.invocation?.args || '').trim();
    const subcommand = raw.split(/\s+/).filter(Boolean)[0] ?? '';
    return handleSubcommand(context, subcommand);
  },
};
