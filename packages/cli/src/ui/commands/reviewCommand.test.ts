/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { buildReviewPrompt, reviewCommand } from './reviewCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const execFileMock = vi.mocked(execFile);

function gitReturns(diff: string, untracked = '') {
  execFileMock.mockImplementation(((
    _cmd: string,
    args: string[],
    _opts: unknown,
    callback: (e: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const out = args[0] === 'diff' ? diff : untracked;
    callback(null, out, '');
    return undefined;
  }) as never);
}

describe('reviewCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildReviewPrompt frames a read-only review with the diff', () => {
    const prompt = buildReviewPrompt('diff --git a/x b/x\n+bad', ['new.ts']);
    expect(prompt).toContain('read-only code review');
    expect(prompt).toContain('Do NOT modify');
    expect(prompt).toContain('+bad');
    expect(prompt).toContain('new.ts');
  });

  it('submits a review prompt when there are changes', async () => {
    gitReturns('diff --git a/x.ts b/x.ts\n+const a = 1;');
    const config = {
      getProjectRoot: vi.fn().mockReturnValue('/repo'),
    } as unknown as Config;
    const context = createMockCommandContext({
      services: {
        agentContext: { config } as never,
      },
      invocation: { raw: '/review', name: 'review', args: '' },
    });
    const result = await reviewCommand.action!(context, '');
    expect(result).toMatchObject({ type: 'submit_prompt' });
    expect((result as { content: string }).content).toContain('const a = 1;');
  });

  it('reports a clean tree without submitting a prompt', async () => {
    gitReturns('');
    const config = {
      getProjectRoot: vi.fn().mockReturnValue('/repo'),
    } as unknown as Config;
    const context = createMockCommandContext({
      services: {
        agentContext: { config } as never,
      },
      invocation: { raw: '/review', name: 'review', args: '' },
    });
    const result = await reviewCommand.action!(context, '');
    expect(result).toMatchObject({ type: 'message', messageType: 'info' });
    expect((result as { content: string }).content).toContain('clean');
  });
});
