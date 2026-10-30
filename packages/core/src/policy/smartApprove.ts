/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PolicyDecision } from './types.js';
import {
  EDIT_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LIST_MCP_RESOURCES_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  READ_MCP_RESOURCE_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { isRecord } from '../utils/markdownUtils.js';

/**
 * Risk level assigned to a tool call by the smart-approve classifier.
 *
 * - 'low': read-only calls. When smart approve is enabled, the policy
 *   engine may allow these without prompting.
 * - 'medium': file writes/edits and anything unrecognized. These always
 *   go through the existing approval flow.
 * - 'high': shell calls. These always go through the existing approval
 *   flow.
 */
export type SmartApproveRisk = 'low' | 'medium' | 'high';

/**
 * Read-only tools. There is no dedicated memory tool in this codebase
 * (memory is read through read_file and read_mcp_resource), so no
 * separate memory tool name is listed here.
 */
const LOW_RISK_TOOLS: ReadonlySet<string> = new Set([
  READ_FILE_TOOL_NAME,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  // Alias for the search tool, as named in the feature spec.
  'search',
  LS_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  READ_MCP_RESOURCE_TOOL_NAME,
  LIST_MCP_RESOURCES_TOOL_NAME,
]);

const MEDIUM_RISK_TOOLS: ReadonlySet<string> = new Set([
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
]);

const SHELL_TOOLS: ReadonlySet<string> = new Set([
  SHELL_TOOL_NAME,
  // Legacy shell tool alias (see SHELL_TOOL_NAMES in shell-utils).
  'ShellTool',
]);

const SUDO_PATTERN = /\bsudo\b/;
const RM_COMBINED_FLAGS_PATTERN =
  /\brm\b[^;&|\n]*\s-[a-z]*r[a-z]*f[a-z]*\b|\brm\b[^;&|\n]*\s-[a-z]*f[a-z]*r[a-z]*\b/;
const RM_SEPARATE_FLAGS_PATTERN =
  /\brm\b[^;&|\n]*\s-r\b[^;&|\n]*\s-f\b|\brm\b[^;&|\n]*\s-f\b[^;&|\n]*\s-r\b/;
const RM_LONG_FLAGS_PATTERN =
  /\brm\b[^;&|\n]*--recursive\b[^;&|\n]*--force\b|\brm\b[^;&|\n]*--force\b[^;&|\n]*--recursive\b/;
const CURL_WGET_PIPE_TO_SHELL_PATTERN =
  /\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|fish)\b/;
const CHMOD_CHOWN_SYSTEM_PATH_PATTERN =
  /\b(?:chmod|chown)\b[^;&|\n]*\/(?:etc|usr|bin|sbin|var|System|Library)\b/;

/**
 * Returns true when a shell command string contains a destructive or
 * privilege/network-elevating pattern: `rm -rf` (in any flag spelling),
 * `sudo`, `curl`/`wget` piped to a shell, or `chmod`/`chown` on a
 * system path. Matching is case-insensitive and works on substrings,
 * so a destructive fragment embedded in a longer command still matches.
 */
export function hasDestructiveShellPattern(command: string): boolean {
  const lowered = command.toLowerCase();
  return (
    SUDO_PATTERN.test(lowered) ||
    RM_COMBINED_FLAGS_PATTERN.test(lowered) ||
    RM_SEPARATE_FLAGS_PATTERN.test(lowered) ||
    RM_LONG_FLAGS_PATTERN.test(lowered) ||
    CURL_WGET_PIPE_TO_SHELL_PATTERN.test(lowered) ||
    CHMOD_CHOWN_SYSTEM_PATH_PATTERN.test(lowered)
  );
}

/**
 * Extracts the shell command string from tool arguments, if present.
 * Returns undefined for missing, non-record, or non-string commands.
 */
export function extractShellCommand(args: unknown): string | undefined {
  if (!isRecord(args)) {
    return undefined;
  }
  const command = args['command'];
  if (typeof command === 'string') {
    return command;
  }
  return undefined;
}

/**
 * Pure risk classifier for a tool call. It never throws: unrecognized
 * tool names, missing names, and unusable arguments all classify as
 * 'medium' (fail-safe: never auto-allow something unknown).
 *
 * Shell calls are always 'high', so a destructive shell pattern can
 * never lower a shell call below 'high'; see
 * hasDestructiveShellPattern for the explicit pattern check.
 */
export function classifyToolCall(
  toolName: string | undefined,
  args: unknown,
): SmartApproveRisk {
  if (typeof toolName !== 'string' || toolName.length === 0) {
    return 'medium';
  }
  if (LOW_RISK_TOOLS.has(toolName)) {
    return 'low';
  }
  if (MEDIUM_RISK_TOOLS.has(toolName)) {
    return 'medium';
  }
  if (SHELL_TOOLS.has(toolName)) {
    const command = extractShellCommand(args);
    if (command !== undefined && hasDestructiveShellPattern(command)) {
      return 'high';
    }
    return 'high';
  }
  return 'medium';
}

/**
 * The policy rule behind smart approve. It ONLY ADDS allows and only
 * for 'low' calls:
 *
 * - Returns PolicyDecision.ALLOW when enabled and the call is 'low'.
 * - Returns undefined (defers to the existing policy flow) for
 *   'medium' and 'high' calls, and when disabled.
 * - Returns undefined on any classifier error (fail-open to asking,
 *   never to allowing).
 *
 * Callers must treat undefined as "no decision from this rule" and
 * continue with the normal rule/default decision.
 */
export function evaluateSmartApprove(
  toolName: string | undefined,
  args: unknown,
  enabled: boolean,
): PolicyDecision | undefined {
  if (!enabled) {
    return undefined;
  }
  try {
    if (classifyToolCall(toolName, args) === 'low') {
      return PolicyDecision.ALLOW;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
