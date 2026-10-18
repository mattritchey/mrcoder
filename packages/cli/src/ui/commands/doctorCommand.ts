/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: /doctor health check, modeled on Claude Code's /doctor.
// Runs a battery of local checks over the install (runtime, auth, model
// endpoint, context files, folder trust, MCP servers, extensions, git,
// checkpointing) and prints a pass/warn/fail report with a concrete fix
// for every problem found. Checks never modify anything.

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';
import { getVersion } from '@google/gemini-cli-core';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

const STATUS_MARK: Record<CheckStatus, string> = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
};

async function probeEndpoint(baseUrl: string): Promise<boolean> {
  try {
    // Any HTTP response at all (even 401/404) proves the endpoint is up.
    await fetch(baseUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    });
    return true;
  } catch {
    return false;
  }
}

export async function runDoctorChecks(
  context: CommandContext,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const config = context.services.agentContext?.config;
  const settings = context.services.settings;

  // Runtime
  const nodeMajor = Number.parseInt(
    process.versions.node.split('.')[0] ?? '0',
    10,
  );
  checks.push(
    nodeMajor >= 20
      ? {
          name: 'Node.js runtime',
          status: 'pass',
          detail: `v${process.versions.node} (20 or newer required)`,
        }
      : {
          name: 'Node.js runtime',
          status: 'fail',
          detail: `v${process.versions.node} is below the required 20`,
          fix: 'Install Node.js 20 or newer and relaunch mr-coder.',
        },
  );

  // Version
  checks.push({
    name: 'Mr Coder version',
    status: 'pass',
    detail: await getVersion(),
  });

  if (!config) {
    checks.push({
      name: 'Configuration',
      status: 'fail',
      detail: 'Config service is unavailable in this session',
      fix: 'Relaunch mr-coder; if this persists, check ~/.gemini/settings.json for JSON errors.',
    });
    return checks;
  }

  // Authentication
  const selectedAuth = settings.merged.security?.auth?.selectedType;
  checks.push(
    selectedAuth
      ? {
          name: 'Authentication',
          status: 'pass',
          detail: `Method selected: ${selectedAuth}`,
        }
      : {
          name: 'Authentication',
          status: 'warn',
          detail: 'No authentication method is selected',
          fix: 'Run /auth to choose a sign-in method, or set GEMINI_API_KEY.',
        },
  );

  // Model
  const model = config.getModel();
  checks.push(
    model
      ? { name: 'Model', status: 'pass', detail: model }
      : {
          name: 'Model',
          status: 'warn',
          detail: 'No model is configured',
          fix: 'Pick a model with /model or pass one with -m.',
        },
  );

  // Model endpoint (the fork is often pointed at a local bridge)
  const baseUrl = process.env['GOOGLE_GEMINI_BASE_URL'];
  if (baseUrl) {
    const reachable = await probeEndpoint(baseUrl);
    checks.push(
      reachable
        ? {
            name: 'Model endpoint',
            status: 'pass',
            detail: `${baseUrl} responded`,
          }
        : {
            name: 'Model endpoint',
            status: 'warn',
            detail: `${baseUrl} did not respond within 3s`,
            fix: 'If this is a local bridge URL, start that port from the dashboard; otherwise check GOOGLE_GEMINI_BASE_URL.',
          },
    );
  } else {
    checks.push({
      name: 'Model endpoint',
      status: 'pass',
      detail: 'Default Google endpoint (GOOGLE_GEMINI_BASE_URL not set)',
    });
  }

  // Context files
  const contextFiles = config.getGeminiMdFilePaths();
  if (contextFiles.length > 0) {
    const names = contextFiles.map((f) => path.basename(f));
    checks.push({
      name: 'Context files',
      status: 'pass',
      detail: `${contextFiles.length} found: ${names.join(', ')}`,
    });
  } else {
    checks.push({
      name: 'Context files',
      status: 'warn',
      detail: 'No MR-CODER.md or GEMINI.md found for this project',
      fix: 'Run /init to generate an MR-CODER.md with project context.',
    });
  }

  // Folder trust
  checks.push(
    config.getFolderTrust()
      ? {
          name: 'Folder trust',
          status: 'pass',
          detail: 'This folder is trusted',
        }
      : {
          name: 'Folder trust',
          status: 'warn',
          detail:
            'This folder is not trusted, so project settings, hooks, and MCP servers from it are skipped',
          fix: 'Relaunch here and choose "Trust folder", or set GEMINI_CLI_TRUST_WORKSPACE=true for headless runs.',
        },
  );

  // MCP servers
  const mcpServers = config.getMcpServers() ?? {};
  const mcpNames = Object.keys(mcpServers);
  checks.push({
    name: 'MCP servers',
    status: 'pass',
    detail:
      mcpNames.length > 0
        ? `${mcpNames.length} configured: ${mcpNames.join(', ')}`
        : 'None configured (optional)',
  });

  // Extensions
  const extensionCount = config.getExtensions().length;
  checks.push({
    name: 'Extensions',
    status: 'pass',
    detail:
      extensionCount > 0
        ? `${extensionCount} installed`
        : 'None installed (optional)',
  });

  // Git repository
  const projectRoot = config.getProjectRoot();
  checks.push(
    existsSync(path.join(projectRoot, '.git'))
      ? {
          name: 'Git repository',
          status: 'pass',
          detail: projectRoot,
        }
      : {
          name: 'Git repository',
          status: 'warn',
          detail:
            'This folder is not a git repository; checkpoint restore and worktree features are limited',
          fix: 'Run git init here, or open mr-coder inside a repository.',
        },
  );

  // Checkpointing
  checks.push({
    name: 'Checkpointing',
    status: 'pass',
    detail: config.getCheckpointingEnabled()
      ? 'Enabled (file snapshots are saved before edits)'
      : 'Disabled (enable with --checkpointing or the checkpointing setting)',
  });

  return checks;
}

export function formatDoctorReport(checks: DoctorCheck[]): string {
  const lines = ['Mr Coder Doctor', ''];
  for (const check of checks) {
    lines.push(`${STATUS_MARK[check.status]} ${check.name} — ${check.detail}`);
    if (check.status !== 'pass' && check.fix) {
      lines.push(`  Fix: ${check.fix}`);
    }
  }
  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  lines.push('');
  lines.push(
    `Summary: ${passed} passed, ${warned} warning${warned === 1 ? '' : 's'}, ${failed} failed`,
  );
  return lines.join('\n');
}

export const doctorCommand: SlashCommand = {
  name: 'doctor',
  description: 'Run health checks on this Mr Coder install and report fixes',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const checks = await runDoctorChecks(context);
    context.ui.addItem({
      type: MessageType.INFO,
      text: formatDoctorReport(checks),
    });
  },
};
