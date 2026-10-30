/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: /diff, modeled on Codex's /diff viewer. Collects the
// working-tree diff locally and displays it read-only: a stat summary
// plus the diff itself. Files are never touched.

import { execFile } from 'node:child_process';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';

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

export async function getDiff(
  cwd: string,
): Promise<{ diff: string; untracked: string[] }> {
  const diff = await runGit(['diff', 'HEAD'], cwd);
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

export function buildDiffStat(diff: string, untracked: string[]): string {
  let files = 0;
  let insertions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      files += 1;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      insertions += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }
  const stat =
    `${files} file(s) changed, ` +
    `${insertions} insertion(s), ${deletions} deletion(s)`;
  if (untracked.length === 0) {
    return stat;
  }
  return `${stat}\nUntracked file(s): ${untracked.join(', ')}`;
}

export function buildDiffText(
  diff: string,
  untracked: string[],
  statOnly: boolean,
): string {
  const stat = buildDiffStat(diff, untracked);
  if (statOnly) {
    return stat;
  }
  const untrackedSection =
    untracked.length > 0
      ? `\n\nUntracked files (not in the diff):\n${untracked.map((f) => `- ${f}`).join('\n')}`
      : '';
  if (!diff.trim()) {
    return `${stat}${untrackedSection}`;
  }
  let truncatedNote = '';
  let body = diff;
  if (body.length > MAX_DIFF_CHARS) {
    body = body.slice(0, MAX_DIFF_CHARS);
    truncatedNote = `\n\n(Note: the diff was truncated at ${MAX_DIFF_CHARS} characters.)`;
  }
  return [
    stat,
    '',
    '```diff',
    body,
    '```',
    untrackedSection,
    truncatedNote,
  ].join('\n');
}

export const diffCommand: SlashCommand = {
  name: 'diff',
  description:
    'Show uncommitted changes as a read-only diff (use `/diff stat` for the summary only)',
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
    const statOnly = context.invocation?.args.trim() === 'stat';
    const cwd = config.getProjectRoot();
    let diff: string;
    let untracked: string[];
    try {
      ({ diff, untracked } = await getDiff(cwd));
    } catch {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Could not read a git diff here. /diff needs a git repository with at least one commit.',
      };
    }
    if (!diff.trim() && untracked.length === 0) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'Nothing to show — the working tree is clean.',
      });
      return;
    }
    context.ui.addItem({
      type: MessageType.INFO,
      text: buildDiffText(diff, untracked, statOnly),
    });
  },
};
