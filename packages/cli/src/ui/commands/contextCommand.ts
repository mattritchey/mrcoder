/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: /context visualizer, modeled on Claude Code's /context.
// Renders a breakdown of what is consuming context in this session:
// session token totals, the number of tools offered, and the context
// files on disk with their sizes. Every figure comes from data the
// codebase already exposes; nothing is estimated.
//
// Deliberately absent: a context-window limit and any usage percentage.
// No clean accessor for the current model's context window exists in
// core (the context-management historyWindow maxTokens budget is a
// compression budget, not the model window), so no limit is hardcoded
// and no percentage is shown. formatContextReport accepts an optional
// contextWindowTokens only so a future real accessor can be wired in;
// the command itself never passes one.

import { statSync } from 'node:fs';
import path from 'node:path';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';
import { formatBytes } from '../utils/formatters.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';

export interface ContextTokenTotals {
  promptTokens: number;
  cachedTokens: number;
  candidateTokens: number;
}

export interface ContextFileRow {
  filePath: string;
  sizeBytes: number | null;
}

export interface ContextReportData {
  model: string | undefined;
  tokens: ContextTokenTotals;
  cacheSharePercent: number;
  toolCount: number | null;
  files: ContextFileRow[] | null;
  /**
   * The current model's context window in tokens, from a real core
   * accessor. Absent unless such an accessor supplies it; the command
   * never invents a value here.
   */
  contextWindowTokens?: number;
}

/** Sums prompt, cached, and candidate tokens across every model. */
export function aggregateSessionTokens(
  metrics: SessionMetrics,
): ContextTokenTotals {
  const totals: ContextTokenTotals = {
    promptTokens: 0,
    cachedTokens: 0,
    candidateTokens: 0,
  };
  for (const model of Object.values(metrics.models)) {
    totals.promptTokens += model.tokens.prompt;
    totals.cachedTokens += model.tokens.cached;
    totals.candidateTokens += model.tokens.candidates;
  }
  return totals;
}

/** Share of prompt tokens served from cache; 0 when nothing was sent. */
export function calculateCacheShare(
  promptTokens: number,
  cachedTokens: number,
): number {
  if (promptTokens === 0) {
    return 0;
  }
  return (cachedTokens / promptTokens) * 100;
}

/**
 * Sizes each context file. A file that cannot be statted is reported
 * with an unknown size instead of failing the whole report.
 */
export function getContextFileRows(filePaths: string[]): ContextFileRow[] {
  return filePaths.map((filePath) => {
    let sizeBytes: number | null = null;
    try {
      sizeBytes = statSync(filePath).size;
    } catch {
      sizeBytes = null;
    }
    return { filePath, sizeBytes };
  });
}

export function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null) {
    return 'unknown';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} bytes`;
  }
  return formatBytes(sizeBytes);
}

function formatUsageBar(percent: number): string {
  const width = 20;
  const filled = Math.min(
    width,
    Math.max(0, Math.round((percent / 100) * width)),
  );
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
}

export function formatContextReport(data: ContextReportData): string {
  const lines = ['Context Usage', ''];
  lines.push(`Model: ${data.model ?? 'Unknown'}`);
  lines.push('');
  lines.push('Tokens (session totals):');
  lines.push(`  Prompt: ${data.tokens.promptTokens.toLocaleString()}`);
  lines.push(
    `  Cached: ${data.tokens.cachedTokens.toLocaleString()} ` +
      `(${data.cacheSharePercent.toFixed(1)}% of prompt)`,
  );
  lines.push(`  Candidates: ${data.tokens.candidateTokens.toLocaleString()}`);
  if (data.contextWindowTokens !== undefined) {
    const percent = (data.tokens.promptTokens / data.contextWindowTokens) * 100;
    lines.push(
      `  Usage: ${percent.toFixed(1)}% of ` +
        `${data.contextWindowTokens.toLocaleString()} tokens ` +
        formatUsageBar(percent),
    );
  }
  lines.push('');
  lines.push(
    data.toolCount === null
      ? 'Tools available: unknown'
      : `Tools available: ${data.toolCount.toLocaleString()}`,
  );
  lines.push('');
  if (data.files === null) {
    lines.push('Context files: unknown');
  } else if (data.files.length === 0) {
    lines.push('Context files: none found');
  } else {
    lines.push('Context files:');
    for (const file of data.files) {
      lines.push(
        `  ${path.basename(file.filePath)} — ${formatFileSize(file.sizeBytes)}`,
      );
    }
  }
  return lines.join('\n');
}

export function buildContextReport(context: CommandContext): string {
  const config = context.services.agentContext?.config;
  const tokens = aggregateSessionTokens(context.session.stats.metrics);
  const data: ContextReportData = {
    model: config?.getModel(),
    tokens,
    cacheSharePercent: calculateCacheShare(
      tokens.promptTokens,
      tokens.cachedTokens,
    ),
    toolCount: config ? config.getToolRegistry().getAllTools().length : null,
    files: config ? getContextFileRows(config.getGeminiMdFilePaths()) : null,
  };
  return formatContextReport(data);
}

export const contextCommand: SlashCommand = {
  name: 'context',
  description:
    'Show what is consuming context: session tokens, tools, and context files',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: (context) => {
    context.ui.addItem({
      type: MessageType.INFO,
      text: buildContextReport(context),
    });
  },
};
