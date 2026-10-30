/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { buildDiffStat, diffCommand } from './diffCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
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

function gitFails() {
  execFileMock.mockImplementation(((
    _cmd: string,
    _args: string[],
    _opts: unknown,
    callback: (e: Error | null, stdout: string, stderr: string) => void,
  ) => {
    callback(new Error('fatal: not a git repository'), '', '');
    return undefined;
  }) as never);
}

function makeContext(args: string) {
  const config = {
    getProjectRoot: vi.fn().mockReturnValue('/repo'),
  } as unknown as Config;
  return createMockCommandContext({
    services: {
      agentContext: { config } as never,
    },
    invocation: { raw: `/diff ${args}`.trim(), name: 'diff', args },
  });
}

describe('diffCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildDiffStat counts files, insertions, and deletions', () => {
    const stat = buildDiffStat(
      'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n+const a = 1;\n-const b = 2;\n',
      [],
    );
    expect(stat).toContain('1 file(s) changed');
    expect(stat).toContain('1 insertion(s)');
    expect(stat).toContain('1 deletion(s)');
  });

  it('renders the stat summary plus the full diff for a bare /diff', async () => {
    gitReturns('diff --git a/x.ts b/x.ts\n+const a = 1;', 'new.ts');
    const context = makeContext('');
    await diffCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: expect.stringContaining('1 file(s) changed'),
    });
    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: expect.stringContaining('const a = 1;'),
    });
    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: expect.stringContaining('new.ts'),
    });
  });

  it('renders only the stat summary for /diff stat', async () => {
    gitReturns('diff --git a/x.ts b/x.ts\n+const a = 1;');
    const context = makeContext('stat');
    await diffCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: expect.stringContaining('1 file(s) changed'),
    });
    expect(context.ui.addItem).not.toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: expect.stringContaining('const a = 1;'),
    });
  });

  it('truncates a long diff at 50,000 characters with a note', async () => {
    gitReturns('a'.repeat(50_000) + 'UNIQUE_TAIL_MARKER');
    const context = makeContext('');
    await diffCommand.action!(context, '');
    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: expect.stringContaining('truncated at 50000 characters'),
    });
    expect(context.ui.addItem).not.toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: expect.stringContaining('UNIQUE_TAIL_MARKER'),
    });
  });

  it('returns an error message outside a git repository without rejecting', async () => {
    gitFails();
    const context = makeContext('');
    const result = await diffCommand.action!(context, '');
    expect(result).toMatchObject({ type: 'message', messageType: 'error' });
    expect((result as { content: string }).content).toContain('git');
  });
});
