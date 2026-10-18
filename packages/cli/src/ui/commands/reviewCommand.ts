/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: /review, modeled on Codex's /review. Collects the
// working-tree diff locally and submits it to the agent as a strictly
// read-only review task: findings are reported, files are never touched.

import { execFile } from 'node:child_process';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

const MAX_DIFF_CHARS = 50_000;

export function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

export async function getReviewDiff(
  cwd: string,
  base?: string,
): Promise<{ diff: string; untracked: string[] }> {
  const diff = base
    ? await runGit(['diff', base], cwd)
    : await runGit(['diff', 'HEAD'], cwd);
  const untrackedRaw = await runGit(
    ['ls-files', '--others', '--exclude-standard'],
    cwd,
  );
  const untracked = untrackedRaw
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
  return { diff, untracked };
}

export function buildReviewPrompt(
  diff: string,
  untracked: string[],
  base?: string,
): string {
  let truncatedNote = '';
  let body = diff;
  if (body.length > MAX_DIFF_CHARS) {
    body = body.slice(0, MAX_DIFF_CHARS);
    truncatedNote = `\n\n(Note: the diff was truncated at ${MAX_DIFF_CHARS} characters. Review what is shown and say that the review is partial.)`;
  }
  const scope = base
    ? `the changes relative to \`${base}\``
    : 'the uncommitted changes in the working tree';
  const untrackedSection =
    untracked.length > 0
      ? `\n\nUntracked files (not in the diff; inspect them only if a changed file references them):\n${untracked.map((f) => `- ${f}`).join('\n')}`
      : '';
  return [
    `Perform a read-only code review of ${scope}.`,
    '',
    'Rules for this review:',
    '- Do NOT modify, create, or delete any files. This is a review only.',
    '- Report concrete findings ordered by severity (bugs and security issues first, then correctness risks, then style/maintainability).',
    '- For every finding, cite the file and line from the diff and explain the problem and a suggested fix.',
    '- If a change looks fine, do not invent problems. If there are no findings, say the changes look clean.',
    '',
    'The diff:',
    '',
    '```diff',
    body,
    '```',
    untrackedSection,
    truncatedNote,
  ].join('\n');
}

export const reviewCommand: SlashCommand = {
  name: 'review',
  description:
    'Review uncommitted changes (or changes vs a base ref) without modifying any files',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context): Promise<SlashCommandActionReturn> => {
    const config = context.services.agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const base = context.invocation?.args.trim() || undefined;
    const cwd = config.getProjectRoot();
    let diff: string;
    let untracked: string[];
    try {
      ({ diff, untracked } = await getReviewDiff(cwd, base));
    } catch {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Could not read a git diff here. /review needs a git repository with at least one commit.',
      };
    }
    if (!diff.trim() && untracked.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: base
          ? `Nothing to review — no changes relative to ${base}.`
          : 'Nothing to review — the working tree is clean.',
      };
    }
    if (!diff.trim() && untracked.length > 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: `No changes to tracked files. Untracked files present: ${untracked.join(', ')}. Stage or commit them, or ask for a review of a specific file.`,
      };
    }
    return {
      type: 'submit_prompt',
      content: buildReviewPrompt(diff, untracked, base),
    };
  },
};
