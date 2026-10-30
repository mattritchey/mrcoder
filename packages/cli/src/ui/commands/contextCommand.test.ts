/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contextCommand,
  aggregateSessionTokens,
  calculateCacheShare,
  getContextFileRows,
  formatFileSize,
  formatContextReport,
  type ContextReportData,
} from './contextCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config } from '@google/gemini-cli-core';
import type { SessionMetrics } from '../contexts/SessionContext.js';
import { MessageType } from '../types.js';

function isInfoTextItem(value: unknown): value is {
  type: MessageType;
  text: string;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('type' in value) || !('text' in value)) {
    return false;
  }
  const typeValue = value.type;
  const textValue = value.text;
  return typeValue === MessageType.INFO && typeof textValue === 'string';
}

const makeConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    getModel: vi.fn().mockReturnValue('test-model'),
    getToolRegistry: vi.fn().mockReturnValue({
      getAllTools: vi.fn().mockReturnValue([{}, {}, {}]),
    }),
    getGeminiMdFilePaths: vi.fn().mockReturnValue([]),
    ...overrides,
  }) as unknown as Config;

const twoModelMetrics: SessionMetrics = {
  models: {
    'model-a': {
      api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 10 },
      tokens: {
        input: 900,
        prompt: 1000,
        candidates: 50,
        total: 1050,
        cached: 400,
        thoughts: 0,
        tool: 0,
      },
      roles: {},
    },
    'model-b': {
      api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 5 },
      tokens: {
        input: 450,
        prompt: 500,
        candidates: 25,
        total: 525,
        cached: 100,
        thoughts: 0,
        tool: 0,
      },
      roles: {},
    },
  },
  tools: {
    totalCalls: 0,
    totalSuccess: 0,
    totalFail: 0,
    totalDurationMs: 0,
    totalDecisions: { accept: 0, reject: 0, modify: 0, auto_accept: 0 },
    byName: {},
  },
  files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
};

const makeContext = (config: Config | null) =>
  createMockCommandContext({
    services: {
      agentContext: (config ? { config } : null) as unknown as ReturnType<
        typeof createMockCommandContext
      >['services']['agentContext'],
    },
    session: {
      stats: {
        metrics: twoModelMetrics,
      },
    },
  });

const getReportText = async (config: Config | null): Promise<string> => {
  const context = makeContext(config);
  await contextCommand.action!(context, '');
  expect(context.ui.addItem).toHaveBeenCalledTimes(1);
  const firstArg = vi.mocked(context.ui.addItem).mock.calls[0]?.[0];
  expect(isInfoTextItem(firstArg)).toBe(true);
  if (!isInfoTextItem(firstArg)) {
    return '';
  }
  return firstArg.text;
};

describe('aggregateSessionTokens', () => {
  it('sums prompt, cached, and candidate tokens across models', () => {
    const totals = aggregateSessionTokens(twoModelMetrics);
    expect(totals.promptTokens).toBe(1500);
    expect(totals.cachedTokens).toBe(500);
    expect(totals.candidateTokens).toBe(75);
  });

  it('returns zeros when no models have reported metrics', () => {
    const totals = aggregateSessionTokens({
      ...twoModelMetrics,
      models: {},
    });
    expect(totals).toEqual({
      promptTokens: 0,
      cachedTokens: 0,
      candidateTokens: 0,
    });
  });
});

describe('calculateCacheShare', () => {
  it('computes cached tokens as a share of prompt tokens', () => {
    expect(calculateCacheShare(1500, 500)).toBeCloseTo(33.333, 2);
  });

  it('returns zero when no prompt tokens were sent', () => {
    expect(calculateCacheShare(0, 0)).toBe(0);
  });
});

describe('getContextFileRows and formatFileSize', () => {
  it('sizes a readable file', () => {
    const readable = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'doctorCommand.ts',
    );
    const rows = getContextFileRows([readable]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.filePath).toBe(readable);
    expect(row?.sizeBytes).not.toBeNull();
    const size = row?.sizeBytes;
    if (size !== undefined && size !== null) {
      expect(size).toBeGreaterThan(0);
    }
  });

  it('reports an unreadable file with an unknown size instead of failing', () => {
    const rows = getContextFileRows([
      '/definitely-not-a-real-context-file/MR-CODER.md',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sizeBytes).toBeNull();
  });

  it('formats sizes, including the unknown case', () => {
    expect(formatFileSize(null)).toBe('unknown');
    expect(formatFileSize(512)).toBe('512 bytes');
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });
});

describe('contextCommand', () => {
  it('renders token totals, cache share, tool count, and model as an INFO item', async () => {
    const text = await getReportText(makeConfig());
    expect(text).toContain('Model: test-model');
    expect(text).toContain('Prompt: 1,500');
    expect(text).toContain('Cached: 500 (33.3% of prompt)');
    expect(text).toContain('Candidates: 75');
    expect(text).toContain('Tools available: 3');
  });

  it('renders context-file rows with sizes, and unknown for unreadable files', async () => {
    const readable = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'doctorCommand.ts',
    );
    const text = await getReportText(
      makeConfig({
        getGeminiMdFilePaths: vi
          .fn()
          .mockReturnValue([
            readable,
            '/definitely-not-a-real-context-file/MR-CODER.md',
          ]),
      }),
    );
    const lines = text.split('\n');
    const readableLine = lines.find((line) =>
      line.includes('doctorCommand.ts'),
    );
    expect(readableLine).toBeDefined();
    expect(readableLine).not.toContain('unknown');
    const unreadableLine = lines.find((line) => line.includes('MR-CODER.md'));
    expect(unreadableLine).toContain('unknown');
  });

  it('shows no percentage row when no context-window limit is known', async () => {
    const text = await getReportText(makeConfig());
    expect(text).not.toContain('Usage:');
    expect(text).not.toContain('█');
  });

  it('still renders tokens when the config service is unavailable', async () => {
    const text = await getReportText(null);
    expect(text).toContain('Prompt: 1,500');
    expect(text).toContain('Tools available: unknown');
    expect(text).toContain('Context files: unknown');
  });
});

describe('formatContextReport with a known limit', () => {
  it('shows a percentage row only when a real limit is supplied', () => {
    const data: ContextReportData = {
      model: 'test-model',
      tokens: { promptTokens: 2500, cachedTokens: 500, candidateTokens: 100 },
      cacheSharePercent: 20,
      toolCount: 3,
      files: [],
      contextWindowTokens: 10000,
    };
    const text = formatContextReport(data);
    expect(text).toContain('Usage: 25.0% of 10,000 tokens');
    expect(text).toContain('█');
  });
});
