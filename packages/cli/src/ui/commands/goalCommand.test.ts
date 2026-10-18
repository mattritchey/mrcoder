/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildGoalHookCommand,
  buildGoalHookScript,
  buildGoalPrompt,
  goalStatePath,
  readGoalState,
  stripGoalHook,
  upsertGoalHook,
  writeGoalState,
  type GoalState,
} from './goalCommand.js';

function runHookScript(
  script: string,
  payload: unknown,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['-e', script]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe('goalCommand helpers', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcoder-goal-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const baseState = (overrides: Partial<GoalState> = {}): GoalState => ({
    objective: 'Ship the thing',
    status: 'active',
    createdAt: new Date().toISOString(),
    turns: 0,
    maxTurns: 3,
    queue: [],
    ...overrides,
  });

  it('round-trips goal state on disk', () => {
    writeGoalState(tmp, baseState());
    expect(readGoalState(tmp)?.objective).toBe('Ship the thing');
    expect(readGoalState(path.join(tmp, 'nope'))).toBeNull();
  });

  it('upserts and strips the goal hook without disturbing other hooks', () => {
    const existing = {
      BeforeTool: [
        { hooks: [{ name: 'other', type: 'command', command: 'x' }] },
      ],
    };
    const withGoal = upsertGoalHook(existing, 'node -e "..."');
    expect(withGoal['AfterAgent']).toHaveLength(1);
    expect(withGoal['BeforeTool']).toHaveLength(1);
    // Upserting again replaces, never duplicates.
    const again = upsertGoalHook(withGoal, 'node -e "..."');
    expect(again['AfterAgent']).toHaveLength(1);
    const stripped = stripGoalHook(again);
    expect(stripped['AfterAgent']).toBeUndefined();
    expect(stripped['BeforeTool']).toHaveLength(1);
  });

  it('hook exits 2 and increments turns while the goal is incomplete', async () => {
    writeGoalState(tmp, baseState());
    const command = buildGoalHookScript(goalStatePath(tmp));
    const result = await runHookScript(command, {
      prompt_response: 'I did some work but stopped.',
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('GOAL MODE');
    expect(readGoalState(tmp)?.turns).toBe(1);
  });

  it('hook stands down when the response contains the completion marker', async () => {
    writeGoalState(tmp, baseState());
    const command = buildGoalHookScript(goalStatePath(tmp));
    const result = await runHookScript(command, {
      prompt_response: 'All done.\nGOAL COMPLETE',
    });
    expect(result.code).toBe(0);
    expect(readGoalState(tmp)?.status).toBe('complete');
  });

  it('hook stops at the turn cap', async () => {
    writeGoalState(tmp, baseState({ turns: 3, maxTurns: 3 }));
    const command = buildGoalHookScript(goalStatePath(tmp));
    const result = await runHookScript(command, {
      prompt_response: 'still working',
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('turn limit');
    expect(readGoalState(tmp)?.status).toBe('complete');
  });

  it('hook command is a shell-safe base64 wrapper around the script', () => {
    const command = buildGoalHookCommand(goalStatePath(tmp));
    expect(command).toMatch(
      /^node -e "eval\(Buffer\.from\('[A-Za-z0-9+/=]+','base64'\)/,
    );
    const encoded = command.match(/Buffer\.from\('([A-Za-z0-9+/=]+)'/)?.[1];
    expect(Buffer.from(encoded!, 'base64').toString('utf8')).toBe(
      buildGoalHookScript(goalStatePath(tmp)),
    );
  });

  it('goal prompt carries the objective and the marker contract', () => {
    const prompt = buildGoalPrompt(baseState());
    expect(prompt).toContain('Ship the thing');
    expect(prompt).toContain('GOAL COMPLETE');
  });
});
