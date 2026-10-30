/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  appendWireTraceEntry,
  getWireTraceFilePath,
  isWireTraceEnabled,
  redactWireTraceData,
  resolveWireTraceFilePath,
  setWireTraceEnabled,
  setWireTraceFilePath,
} from '@google/gemini-cli-core';
import { traceCommand } from './traceCommand.js';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';

function createContext(
  projectRoot?: string,
  sessionId?: string,
): { context: CommandContext; addItem: ReturnType<typeof vi.fn> } {
  const addItem = vi.fn();
  const context = {
    services: {
      agentContext:
        projectRoot === undefined || sessionId === undefined
          ? null
          : {
              config: {
                getProjectRoot: () => projectRoot,
                getSessionId: () => sessionId,
              },
            },
    },
    ui: {
      addItem,
    },
  } as unknown as CommandContext;
  return { context, addItem };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SubCommandWithAction = {
  name: string;
  action: NonNullable<SlashCommand['action']>;
};

function getSubCommand(name: string): SubCommandWithAction {
  const subCommand = traceCommand.subCommands?.find(
    (candidate) => candidate.name === name,
  );
  const action = subCommand?.action;
  if (!subCommand || !action) {
    throw new Error(`Subcommand ${name} is not defined`);
  }
  return { name: subCommand.name, action };
}

describe('redactWireTraceData', () => {
  it('redacts every sensitive key variant', () => {
    const redacted = redactWireTraceData({
      Authorization: 'Bearer secret-token',
      apiKey: 'key-123',
      api_key: 'key-456',
      API_KEY: 'key-789',
      'x-goog-api-key': 'key-000',
      token: 'tok-123',
      access_token: 'tok-456',
      secret: 'shh',
      client_secret: 'shh-2',
      password: 'hunter2',
    });
    expect(redacted).toEqual({
      Authorization: '[REDACTED]',
      apiKey: '[REDACTED]',
      api_key: '[REDACTED]',
      API_KEY: '[REDACTED]',
      'x-goog-api-key': '[REDACTED]',
      token: '[REDACTED]',
      access_token: '[REDACTED]',
      secret: '[REDACTED]',
      client_secret: '[REDACTED]',
      password: '[REDACTED]',
    });
  });

  it('matches sensitive keys case-insensitively', () => {
    const redacted = redactWireTraceData({
      AUTHORIZATION: 'Bearer x',
      ApiKey: 'k',
      PASSWORD: 'p',
      ToKeN: 't',
    });
    expect(redacted).toEqual({
      AUTHORIZATION: '[REDACTED]',
      ApiKey: '[REDACTED]',
      PASSWORD: '[REDACTED]',
      ToKeN: '[REDACTED]',
    });
  });

  it('redacts nested objects and arrays', () => {
    const redacted = redactWireTraceData({
      headers: {
        Authorization: 'Bearer x',
        nested: { password: 'p' },
      },
      items: [{ token: 't' }, { name: 'kept' }],
    });
    expect(redacted).toEqual({
      headers: {
        Authorization: '[REDACTED]',
        nested: { password: '[REDACTED]' },
      },
      items: [{ token: '[REDACTED]' }, { name: 'kept' }],
    });
  });

  it('leaves non-sensitive fields untouched and does not mutate the input', () => {
    const input = {
      model: 'gemini-2.5-flash',
      contents: [{ text: 'hello' }],
      username: 'alice',
      tokenCount: 42,
    };
    const redacted = redactWireTraceData(input);
    expect(redacted).toEqual(input);
    expect(input).toEqual({
      model: 'gemini-2.5-flash',
      contents: [{ text: 'hello' }],
      username: 'alice',
      tokenCount: 42,
    });
  });

  it('passes primitives through unchanged', () => {
    expect(redactWireTraceData('hello')).toBe('hello');
    expect(redactWireTraceData(42)).toBe(42);
    expect(redactWireTraceData(null)).toBe(null);
    expect(redactWireTraceData(undefined)).toBe(undefined);
  });
});

describe('resolveWireTraceFilePath', () => {
  it('uses the session id first 8 characters under .mr-coder', () => {
    expect(resolveWireTraceFilePath('/proj', 'abcdef123456')).toBe(
      path.join('/proj', '.mr-coder', 'wire-trace-abcdef12.jsonl'),
    );
  });
});

describe('appendWireTraceEntry', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-trace-'));
    tempDirs.push(dir);
    return dir;
  }

  it('appends valid redacted JSONL lines', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'trace.jsonl');
    appendWireTraceEntry(filePath, 'request', 'test-model', {
      apiKey: 'secret-key',
      prompt: 'hello',
    });
    appendWireTraceEntry(filePath, 'response', 'test-model', {
      text: 'world',
    });

    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const requestRaw: unknown = JSON.parse(lines[0] ?? '');
    const responseRaw: unknown = JSON.parse(lines[1] ?? '');
    if (!isRecord(requestRaw) || !isRecord(responseRaw)) {
      throw new Error('Expected trace lines to parse as JSON objects');
    }
    const request = requestRaw;
    const response = responseRaw;
    expect(request['direction']).toBe('request');
    expect(request['model']).toBe('test-model');
    const ts = request['ts'];
    expect(typeof ts).toBe('string');
    expect(request['payload']).toEqual({
      apiKey: '[REDACTED]',
      prompt: 'hello',
    });
    expect(response['direction']).toBe('response');
    expect(response['payload']).toEqual({ text: 'world' });
  });

  it('creates missing parent directories', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'nested', 'deep', 'trace.jsonl');
    appendWireTraceEntry(filePath, 'request', 'test-model', {});
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('never throws on an unwritable path', () => {
    const dir = makeTempDir();
    const blockingFile = path.join(dir, 'blocking');
    fs.writeFileSync(blockingFile, 'not a directory');
    expect(() =>
      appendWireTraceEntry(
        path.join(blockingFile, 'trace.jsonl'),
        'request',
        'test-model',
        {},
      ),
    ).not.toThrow();
  });
});

describe('traceCommand', () => {
  beforeEach(() => {
    setWireTraceEnabled(false);
    setWireTraceFilePath(undefined);
  });

  afterEach(() => {
    setWireTraceEnabled(false);
    setWireTraceFilePath(undefined);
  });

  it('has the expected name, kind, and subcommands', () => {
    expect(traceCommand.name).toBe('trace');
    expect(traceCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(traceCommand.subCommands?.map((sub) => sub.name)).toEqual([
      'on',
      'off',
      'status',
    ]);
  });

  it('status reports off with no trace file yet when never enabled', async () => {
    const { context, addItem } = createContext();
    const status = getSubCommand('status');
    await status.action(context, '');
    expect(isWireTraceEnabled()).toBe(false);
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('off'),
      }),
    );
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('no trace file yet'),
      }),
    );
  });

  it('on enables tracing and records the session trace file path', async () => {
    const { context, addItem } = createContext('/fake/project', 'abcdef123456');
    const on = getSubCommand('on');
    await on.action(context, '');
    expect(isWireTraceEnabled()).toBe(true);
    const expected = path.join(
      '/fake/project',
      '.mr-coder',
      'wire-trace-abcdef12.jsonl',
    );
    expect(getWireTraceFilePath()).toBe(expected);
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(expected),
      }),
    );
  });

  it('on without config still enables tracing', async () => {
    const { context, addItem } = createContext();
    const on = getSubCommand('on');
    await on.action(context, '');
    expect(isWireTraceEnabled()).toBe(true);
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('on'),
      }),
    );
  });

  it('off disables tracing but keeps the last trace file path', async () => {
    const { context, addItem } = createContext('/fake/project', 'abcdef123456');
    await getSubCommand('on').action(context, '');
    await getSubCommand('off').action(context, '');
    expect(isWireTraceEnabled()).toBe(false);
    expect(getWireTraceFilePath()).toBe(
      path.join('/fake/project', '.mr-coder', 'wire-trace-abcdef12.jsonl'),
    );
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('off'),
      }),
    );
  });

  it('status reports on and the file path while tracing', async () => {
    const { context, addItem } = createContext('/fake/project', 'abcdef123456');
    await getSubCommand('on').action(context, '');
    addItem.mockClear();
    await getSubCommand('status').action(context, '');
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('on'),
      }),
    );
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('wire-trace-abcdef12.jsonl'),
      }),
    );
  });

  it('bare /trace reports status', async () => {
    const { context, addItem } = createContext();
    const action = traceCommand.action;
    if (!action) {
      throw new Error('traceCommand action is not defined');
    }
    await action(context, '');
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('off'),
      }),
    );
  });

  it('transitions on to off to status', async () => {
    const { context, addItem } = createContext('/fake/project', 'abcdef123456');
    await getSubCommand('on').action(context, '');
    expect(isWireTraceEnabled()).toBe(true);
    await getSubCommand('off').action(context, '');
    expect(isWireTraceEnabled()).toBe(false);
    addItem.mockClear();
    await getSubCommand('status').action(context, '');
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('off'),
      }),
    );
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('wire-trace-abcdef12.jsonl'),
      }),
    );
  });
});
