/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: /transcript, modeled on hax's inspectable transcript
// (Ctrl-T). Writes the model-facing view of the current session — the
// context files loaded, the tool schemas the model was offered, and the
// recorded conversation including tool calls and results — to a Markdown
// file the user can open, search, or share when diagnosing behavior.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { SessionSelector } from '../../utils/sessionUtils.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function partToText(part: unknown): string {
  if (typeof part === 'string') {
    return part;
  }
  if (!isRecord(part)) {
    return '';
  }
  const text = part['text'];
  if (typeof text === 'string') {
    return text;
  }
  const call = part['functionCall'];
  if (isRecord(call)) {
    const name = call['name'];
    const label = typeof name === 'string' ? name : 'unknown';
    return `[tool call] ${label}(${JSON.stringify(call['args'] ?? {})})`;
  }
  const response = part['functionResponse'];
  if (isRecord(response)) {
    const name = response['name'];
    const label = typeof name === 'string' ? name : 'unknown';
    const out = response['response'];
    return `[tool result] ${label}: ${typeof out === 'string' ? out : JSON.stringify(out ?? {})}`;
  }
  return '';
}

export function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(partToText).filter(Boolean).join('\n');
  }
  return partToText(content);
}

interface RecordedMessage {
  type?: unknown;
  role?: unknown;
  content?: unknown;
  parts?: unknown;
}

function extractMessages(sessionData: unknown): RecordedMessage[] {
  if (!isRecord(sessionData)) {
    return [];
  }
  const raw = sessionData['messages'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((m): m is RecordedMessage => isRecord(m));
}

export function renderTranscript(args: {
  sessionId: string;
  model: string;
  sessionData: unknown;
  contextFiles: string[];
  tools: Array<{ name: string; description?: string; parameters?: unknown }>;
}): string {
  const lines: string[] = [
    '# Mr Coder session transcript (model-facing)',
    '',
    `Session: ${args.sessionId}`,
    `Model: ${args.model}`,
    `Exported: ${new Date().toISOString()}`,
    '',
    '## Context files loaded',
    '',
  ];
  if (args.contextFiles.length > 0) {
    for (const f of args.contextFiles) {
      lines.push(`- ${f}`);
    }
  } else {
    lines.push('(none)');
  }
  lines.push('', '## Tools offered to the model', '');
  for (const tool of args.tools) {
    lines.push(`### ${tool.name}`, '');
    if (tool.description) {
      lines.push(tool.description, '');
    }
    if (tool.parameters !== undefined) {
      lines.push(
        '```json',
        JSON.stringify(tool.parameters, null, 2),
        '```',
        '',
      );
    }
  }
  lines.push('## Conversation', '');

  const messages = extractMessages(args.sessionData);
  if (messages.length === 0) {
    lines.push('(no recorded messages found)');
  }
  for (const message of messages) {
    const rawKind = message.type ?? message.role;
    const kind = typeof rawKind === 'string' ? rawKind : 'unknown';
    const heading =
      kind === 'user'
        ? 'User'
        : kind === 'gemini' || kind === 'model'
          ? 'Model'
          : kind;
    const text = contentToText(message.content ?? message.parts);
    lines.push(`### ${heading}`, '', text || '(empty)', '');
  }
  return lines.join('\n');
}

export const transcriptCommand: SlashCommand = {
  name: 'transcript',
  description:
    'Export the model-facing transcript of this session (context files, tool schemas, conversation) to a Markdown file',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const sessionId = config.getSessionId();
    if (!sessionId) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No active session found to transcribe.',
      };
    }
    try {
      const selector = new SessionSelector(config.storage);
      const { sessionData } = await selector.resolveSession(sessionId);
      const tools = config
        .getToolRegistry()
        .getAllTools()
        .map((tool) => ({
          name: tool.schema.name ?? 'unknown',
          description: tool.schema.description,
          parameters: tool.schema.parameters,
        }));
      const text = renderTranscript({
        sessionId,
        model: config.getModel(),
        sessionData,
        contextFiles: config.getGeminiMdFilePaths(),
        tools,
      });
      const requested = context.invocation?.args.trim();
      const targetPath = requested
        ? path.resolve(process.cwd(), requested)
        : path.resolve(
            process.cwd(),
            `mr-coder-transcript-${sessionId.slice(0, 8)}.md`,
          );
      await fs.writeFile(targetPath, text, 'utf8');
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Transcript written to ${targetPath} (${tools.length} tools, ${text.split('\n').length} lines). It shows exactly what the model was offered and what it saw.`,
        },
        Date.now(),
      );
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Could not export the transcript: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
