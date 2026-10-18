/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: goal mode, modeled on Kimi Code's /goal. Setting a goal
// stores it in <project>/.mr-coder/goal.json and installs an AfterAgent
// hook in the workspace settings. After every turn the hook checks the
// agent's final response: if it does not contain the completion marker
// "GOAL COMPLETE", the hook exits 2 and its stderr is fed back as the
// next prompt, so the agent keeps working toward the goal (bounded by a
// turn cap). The hook takes effect from the next launch; the first goal
// turn is submitted immediately by this command.
//   /goal <objective> [--max-turns N]   set a goal and start
//   /goal status | pause | resume | cancel | complete
//   /goal next <objective>             queue the next goal

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';
import { SettingScope } from '../../config/settings.js';

export const GOAL_HOOK_NAME = 'mr-coder-goal';
export const GOAL_COMPLETE_MARKER = 'GOAL COMPLETE';
export const DEFAULT_MAX_TURNS = 25;

export interface GoalState {
  objective: string;
  status: 'active' | 'paused' | 'complete';
  createdAt: string;
  turns: number;
  maxTurns: number;
  queue: string[];
}

export function goalStatePath(projectRoot: string): string {
  return path.join(projectRoot, '.mr-coder', 'goal.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isGoalState(value: unknown): value is GoalState {
  if (!isRecord(value)) {
    return false;
  }
  const objective = value['objective'];
  const status = value['status'];
  const createdAt = value['createdAt'];
  const turns = value['turns'];
  const maxTurns = value['maxTurns'];
  const queue = value['queue'];
  return (
    typeof objective === 'string' &&
    (status === 'active' || status === 'paused' || status === 'complete') &&
    typeof createdAt === 'string' &&
    typeof turns === 'number' &&
    typeof maxTurns === 'number' &&
    Array.isArray(queue) &&
    queue.every((q) => typeof q === 'string')
  );
}

export function readGoalState(projectRoot: string): GoalState | null {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(goalStatePath(projectRoot), 'utf8'),
    );
    return isGoalState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeGoalState(projectRoot: string, state: GoalState): void {
  const file = goalStatePath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

export function deleteGoalState(projectRoot: string): void {
  try {
    fs.unlinkSync(goalStatePath(projectRoot));
  } catch {
    // Already gone.
  }
}

export function buildGoalHookScript(statePath: string): string {
  return [
    "const fs=require('fs');",
    `const statePath=${JSON.stringify(statePath)};`,
    "let input='';",
    "process.stdin.on('data',d=>input+=d);",
    "process.stdin.on('end',()=>{",
    'let state;',
    "try{state=JSON.parse(fs.readFileSync(statePath,'utf8'))}catch{process.exit(0)}",
    "if(state.status!=='active')process.exit(0);",
    'let payload={};',
    'try{payload=JSON.parse(input)}catch{}',
    "const resp=typeof payload.prompt_response==='string'?payload.prompt_response:'';",
    `if(resp.includes('${GOAL_COMPLETE_MARKER}')){state.status='complete';fs.writeFileSync(statePath,JSON.stringify(state,null,2));process.exit(0)}`,
    'state.turns=(state.turns||0)+1;',
    "if(state.turns>state.maxTurns){state.status='complete';fs.writeFileSync(statePath,JSON.stringify(state,null,2));console.error('Goal turn limit ('+state.maxTurns+') reached; goal mode is off. Run /goal status to review.');process.exit(0)}",
    'fs.writeFileSync(statePath,JSON.stringify(state,null,2));',
    `console.error('GOAL MODE: the goal is not complete yet. Goal: '+state.objective+' Continue working toward it now. When, and only when, it is fully achieved, end your reply with the line ${GOAL_COMPLETE_MARKER}. (Turn '+state.turns+' of '+state.maxTurns+')');`,
    'process.exit(2);',
    '});',
  ].join('');
}

export function buildGoalHookCommand(statePath: string): string {
  // The script travels through a shell command string in settings.json,
  // so it is base64-wrapped: no quote characters to break out of the
  // node -e argument, whatever the project path contains.
  const encoded = Buffer.from(buildGoalHookScript(statePath), 'utf8').toString(
    'base64',
  );
  return `node -e "eval(Buffer.from('${encoded}','base64').toString('utf8'))"`;
}

interface HookEntry {
  name?: string;
  type?: string;
  command?: string;
  timeout?: number;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}
type HooksObject = Record<string, HookGroup[]>;

export function upsertGoalHook(
  hooks: HooksObject | undefined,
  command: string,
): HooksObject {
  const next: HooksObject = { ...(hooks ?? {}) };
  const groups = (next['AfterAgent'] ?? []).filter(
    (group) => !(group.hooks ?? []).some((h) => h.name === GOAL_HOOK_NAME),
  );
  groups.push({
    hooks: [{ name: GOAL_HOOK_NAME, type: 'command', command, timeout: 10000 }],
  });
  next['AfterAgent'] = groups;
  return next;
}

export function stripGoalHook(hooks: HooksObject | undefined): HooksObject {
  const next: HooksObject = { ...(hooks ?? {}) };
  if (next['AfterAgent']) {
    next['AfterAgent'] = next['AfterAgent']
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((h) => h.name !== GOAL_HOOK_NAME),
      }))
      .filter((group) => (group.hooks ?? []).length > 0);
    if (next['AfterAgent'].length === 0) {
      delete next['AfterAgent'];
    }
  }
  return next;
}

export function buildGoalPrompt(state: GoalState): string {
  return [
    'You are now in goal mode. Your persistent goal is:',
    '',
    state.objective,
    '',
    'Work toward it autonomously, using the tools you need. Do not stop to ask questions unless you are genuinely blocked.',
    `When — and only when — the goal is fully achieved, end your reply with this exact line on its own: ${GOAL_COMPLETE_MARKER}`,
    `If you stop before completing it, a hook will return you to the goal (up to ${state.maxTurns} turns). The user can check /goal status, or /goal pause / /goal cancel to stop.`,
  ].join('\n');
}

function message(
  content: string,
  messageType: 'info' | 'error' = 'info',
): SlashCommandActionReturn {
  return { type: 'message', messageType, content };
}

function parseMaxTurns(args: string): { objective: string; maxTurns: number } {
  const match = args.match(/--max-turns\s+(\d+)\s*$/);
  if (match) {
    return {
      objective: args.slice(0, match.index).trim(),
      maxTurns: Math.max(1, Number.parseInt(match[1], 10)),
    };
  }
  return { objective: args.trim(), maxTurns: DEFAULT_MAX_TURNS };
}

export const goalCommand: SlashCommand = {
  name: 'goal',
  description:
    'Goal mode: set a persistent objective the agent keeps working toward across turns (/goal <objective>, status, pause, resume, cancel, next)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context): Promise<SlashCommandActionReturn | void> => {
    const config = context.services.agentContext?.config;
    if (!config) {
      return message('Configuration not available.', 'error');
    }
    const projectRoot = config.getProjectRoot();
    const settings = context.services.settings;
    const args = (context.invocation?.args ?? '').trim();
    const [sub, ...rest] = args.split(/\s+/).filter(Boolean);
    const state = readGoalState(projectRoot);

    const installHook = (s: GoalState) => {
      const current = settings.forScope(SettingScope.Workspace).settings[
        'hooks'
      ] as HooksObject | undefined;
      settings.setValue(
        SettingScope.Workspace,
        'hooks',
        upsertGoalHook(
          current,
          buildGoalHookCommand(goalStatePath(projectRoot)),
        ),
      );
      writeGoalState(projectRoot, s);
    };
    const removeHook = () => {
      const current = settings.forScope(SettingScope.Workspace).settings[
        'hooks'
      ] as HooksObject | undefined;
      settings.setValue(
        SettingScope.Workspace,
        'hooks',
        stripGoalHook(current),
      );
    };

    if (!sub || sub === 'status') {
      if (!state) {
        return message('No goal is set. Start one with /goal <objective>.');
      }
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: [
            `Goal: ${state.objective}`,
            `Status: ${state.status}`,
            `Turns used: ${state.turns} of ${state.maxTurns}`,
            `Set: ${state.createdAt}`,
            state.queue.length > 0
              ? `Queued next: ${state.queue.join(' | ')}`
              : 'Queued next: (none)',
          ].join('\n'),
        },
        Date.now(),
      );
      return;
    }

    if (sub === 'pause') {
      if (!state) return message('No goal to pause.', 'error');
      writeGoalState(projectRoot, { ...state, status: 'paused' });
      return message(
        'Goal paused. The continuation hook will stand down; /goal resume picks it back up.',
      );
    }

    if (sub === 'resume') {
      if (!state) return message('No goal to resume.', 'error');
      const resumed: GoalState = { ...state, status: 'active' };
      try {
        installHook(resumed);
      } catch (error) {
        return message(
          `Could not install the goal hook: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
      return { type: 'submit_prompt', content: buildGoalPrompt(resumed) };
    }

    if (sub === 'cancel') {
      if (!state) return message('No goal to cancel.', 'error');
      try {
        removeHook();
      } catch {
        // State removal below still stands the hook down (it exits 0
        // when the state file is missing).
      }
      deleteGoalState(projectRoot);
      return message('Goal cancelled and the continuation hook removed.');
    }

    if (sub === 'complete') {
      if (!state) return message('No goal to complete.', 'error');
      const nextObjective = state.queue[0];
      try {
        removeHook();
      } catch {
        // See cancel.
      }
      if (nextObjective) {
        const promoted: GoalState = {
          objective: nextObjective,
          status: 'active',
          createdAt: new Date().toISOString(),
          turns: 0,
          maxTurns: state.maxTurns,
          queue: state.queue.slice(1),
        };
        try {
          installHook(promoted);
        } catch (error) {
          return message(
            `Goal marked complete, but installing the next goal's hook failed: ${error instanceof Error ? error.message : String(error)}`,
            'error',
          );
        }
        return {
          type: 'submit_prompt',
          content: buildGoalPrompt(promoted),
        };
      }
      deleteGoalState(projectRoot);
      return message('Goal marked complete. Goal mode is off.');
    }

    if (sub === 'next') {
      if (!state) {
        return message(
          'No active goal to queue behind. Set one first with /goal <objective>.',
          'error',
        );
      }
      const objective = rest.join(' ');
      if (!objective) return message('Usage: /goal next <objective>', 'error');
      writeGoalState(projectRoot, {
        ...state,
        queue: [...state.queue, objective],
      });
      return message(`Queued after the current goal: ${objective}`);
    }

    // Anything else is a new objective.
    const { objective, maxTurns } = parseMaxTurns(args);
    if (!objective) {
      return message(
        'Usage: /goal <objective> [--max-turns N], or /goal status | pause | resume | cancel | next <objective>.',
        'error',
      );
    }
    const fresh: GoalState = {
      objective,
      status: 'active',
      createdAt: new Date().toISOString(),
      turns: 0,
      maxTurns,
      queue: state?.queue ?? [],
    };
    try {
      installHook(fresh);
    } catch (error) {
      return message(
        `Could not install the goal hook in workspace settings: ${error instanceof Error ? error.message : String(error)}. The goal was not started.`,
        'error',
      );
    }
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Goal set: ${objective}\nContinuation hook installed in the workspace settings — it takes effect from the next launch (and needs this folder to be trusted). The first goal turn starts now. Turns are capped at ${maxTurns}; /goal cancel stops early.`,
      },
      Date.now(),
    );
    return { type: 'submit_prompt', content: buildGoalPrompt(fresh) };
  },
};
