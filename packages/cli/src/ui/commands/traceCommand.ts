/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getWireTraceFilePath,
  isWireTraceEnabled,
  resolveWireTraceFilePath,
  setWireTraceEnabled,
  setWireTraceFilePath,
} from '@google/gemini-cli-core';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

/**
 * Resolves the wire-trace file path for the current session, or undefined
 * when the project root or session id is unavailable (in which case the
 * trace writer resolves it lazily from the model-call config instead).
 */
function resolveTraceFilePath(context: CommandContext): string | undefined {
  try {
    const config = context.services.agentContext?.config;
    if (!config) {
      return undefined;
    }
    const projectRoot = config.getProjectRoot();
    const sessionId = config.getSessionId();
    if (!projectRoot || !sessionId) {
      return undefined;
    }
    return resolveWireTraceFilePath(projectRoot, sessionId);
  } catch {
    return undefined;
  }
}

function reportStatus(context: CommandContext): void {
  const enabled = isWireTraceEnabled();
  const filePath = getWireTraceFilePath() ?? resolveTraceFilePath(context);
  const state = enabled ? 'on' : 'off';
  const filePart = filePath ? `Trace file: ${filePath}` : 'no trace file yet';
  context.ui.addItem({
    type: MessageType.INFO,
    text: `Wire tracing is ${state}. ${filePart}`,
  });
}

function enableTracing(context: CommandContext): void {
  const filePath = resolveTraceFilePath(context);
  if (filePath) {
    setWireTraceFilePath(filePath);
  }
  setWireTraceEnabled(true);
  const filePart = filePath
    ? `Trace file: ${filePath}`
    : 'The trace file will be created on the next model call.';
  context.ui.addItem({
    type: MessageType.INFO,
    text: `Wire tracing is on. ${filePart}`,
  });
}

function disableTracing(context: CommandContext): void {
  setWireTraceEnabled(false);
  const filePath = getWireTraceFilePath();
  const filePart = filePath ? ` Last trace file: ${filePath}` : '';
  context.ui.addItem({
    type: MessageType.INFO,
    text: `Wire tracing is off.${filePart}`,
  });
}

export const traceCommand: SlashCommand = {
  name: 'trace',
  description:
    'Toggle raw wire tracing of model calls. Usage: /trace [on|off|status]',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: (context) => {
    reportStatus(context);
  },
  subCommands: [
    {
      name: 'on',
      description: 'Enable wire tracing of model calls',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context) => {
        enableTracing(context);
      },
    },
    {
      name: 'off',
      description: 'Disable wire tracing of model calls',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context) => {
        disableTracing(context);
      },
    },
    {
      name: 'status',
      description: 'Show whether wire tracing is on and its file path',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      isSafeConcurrent: true,
      action: (context) => {
        reportStatus(context);
      },
    },
  ],
};
