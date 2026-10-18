/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { doctorCommand, runDoctorChecks } from './doctorCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getVersion: vi.fn().mockResolvedValue('0.0.0-test'),
  };
});

describe('doctorCommand', () => {
  const originalBaseUrl = process.env['GOOGLE_GEMINI_BASE_URL'];

  const makeConfig = (overrides: Record<string, unknown> = {}) =>
    ({
      getModel: vi.fn().mockReturnValue('mimo-v2.6-flash-free'),
      getGeminiMdFilePaths: vi
        .fn()
        .mockReturnValue(['/repo/MR-CODER.md', '/repo/packages/cli/GEMINI.md']),
      getFolderTrust: vi.fn().mockReturnValue(true),
      getMcpServers: vi.fn().mockReturnValue({ 'aws-mcp': {} }),
      getExtensions: vi.fn().mockReturnValue([{ name: 'ext' }]),
      getProjectRoot: vi.fn().mockReturnValue('/repo'),
      getCheckpointingEnabled: vi.fn().mockReturnValue(true),
      ...overrides,
    }) as unknown as Config;

  const makeContext = (config: Config | null) =>
    createMockCommandContext({
      services: {
        agentContext: (config ? { config } : null) as unknown as ReturnType<
          typeof createMockCommandContext
        >['services']['agentContext'],
        settings: {
          merged: {
            security: { auth: { selectedType: 'gemini-api-key' } },
          },
        } as unknown as LoadedSettings,
      },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['GOOGLE_GEMINI_BASE_URL'];
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env['GOOGLE_GEMINI_BASE_URL'];
    } else {
      process.env['GOOGLE_GEMINI_BASE_URL'] = originalBaseUrl;
    }
  });

  it('reports all checks passing on a healthy install', async () => {
    // The real repo root has no .git in the test environment necessarily,
    // so assert on the checks that do not depend on the filesystem.
    const context = makeContext(makeConfig());
    const checks = await runDoctorChecks(context);
    const byName = new Map(checks.map((c) => [c.name, c]));

    expect(byName.get('Node.js runtime')?.status).toBe('pass');
    expect(byName.get('Mr Coder version')?.detail).toBe('0.0.0-test');
    expect(byName.get('Authentication')?.status).toBe('pass');
    expect(byName.get('Model')?.detail).toBe('mimo-v2.6-flash-free');
    expect(byName.get('Model endpoint')?.status).toBe('pass');
    expect(byName.get('Context files')?.detail).toContain('MR-CODER.md');
    expect(byName.get('Folder trust')?.status).toBe('pass');
    expect(byName.get('MCP servers')?.detail).toContain('aws-mcp');
    expect(byName.get('Checkpointing')?.status).toBe('pass');
  });

  it('warns with fixes for untrusted folder and missing context files', async () => {
    const context = makeContext(
      makeConfig({
        getFolderTrust: vi.fn().mockReturnValue(false),
        getGeminiMdFilePaths: vi.fn().mockReturnValue([]),
      }),
    );
    const checks = await runDoctorChecks(context);
    const byName = new Map(checks.map((c) => [c.name, c]));

    expect(byName.get('Folder trust')?.status).toBe('warn');
    expect(byName.get('Folder trust')?.fix).toContain('Trust folder');
    expect(byName.get('Context files')?.status).toBe('warn');
    expect(byName.get('Context files')?.fix).toContain('/init');
  });

  it('adds a formatted report item to the UI', async () => {
    const context = makeContext(makeConfig());
    await doctorCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledTimes(1);
    const item = vi.mocked(context.ui.addItem).mock.calls[0]?.[0] as {
      type: string;
      text: string;
    };
    expect(item.type).toBe(MessageType.INFO);
    expect(item.text).toContain('Mr Coder Doctor');
    expect(item.text).toContain('Summary:');
  });

  it('fails gracefully when the config service is unavailable', async () => {
    const context = makeContext(null);
    const checks = await runDoctorChecks(context);
    expect(checks.some((c) => c.status === 'fail')).toBe(true);
  });
});
