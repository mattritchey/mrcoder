/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SMART_APPROVE_DEFAULT,
  SMART_APPROVE_SETTING_KEY,
  isSmartApproveEnabled,
  smartApproveCommand,
} from './smartApproveCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { SettingScope } from '../../config/settings.js';

function setMergedFlag(context: CommandContext, value: boolean): void {
  const tools = context.services.settings.merged.tools;
  if (tools) {
    Object.assign(tools, { smartApprove: value });
  }
}

function runAction(
  context: CommandContext,
  args: string,
): ReturnType<NonNullable<typeof smartApproveCommand.action>> {
  if (!smartApproveCommand.action) {
    throw new Error('The smart-approve command must have an action.');
  }
  return smartApproveCommand.action(context, args);
}

function runSubcommand(
  context: CommandContext,
  name: string,
): ReturnType<NonNullable<typeof smartApproveCommand.action>> {
  const subcommand = (smartApproveCommand.subCommands ?? []).find(
    (candidate) => candidate.name === name,
  );
  if (!subcommand || !subcommand.action) {
    throw new Error(`Subcommand ${name} must exist and have an action.`);
  }
  return subcommand.action(context, '');
}

describe('smartApproveCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    vi.clearAllMocks();
  });

  it('has the correct name, kind, and subcommands', () => {
    expect(smartApproveCommand.name).toBe('smart-approve');
    expect(smartApproveCommand.kind).toBe('built-in');
    expect((smartApproveCommand.subCommands ?? []).map((c) => c.name)).toEqual([
      'on',
      'off',
      'status',
    ]);
  });

  it('defaults to OFF', () => {
    expect(SMART_APPROVE_DEFAULT).toBe(false);
    expect(isSmartApproveEnabled(mockContext.services.settings.merged)).toBe(
      false,
    );
  });

  it('on persists the flag and reports ON', () => {
    const result = runSubcommand(mockContext, 'on');
    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      SMART_APPROVE_SETTING_KEY,
      true,
    );
    expect(result).toMatchObject({
      type: 'message',
      messageType: 'info',
    });
    const content = result && 'content' in result ? result.content : undefined;
    expect(content).toContain('ON');
  });

  it('off persists the flag and reports OFF', () => {
    const result = runSubcommand(mockContext, 'off');
    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      SMART_APPROVE_SETTING_KEY,
      false,
    );
    const content = result && 'content' in result ? result.content : undefined;
    expect(content).toContain('OFF');
  });

  it('status reports OFF by default', () => {
    const result = runSubcommand(mockContext, 'status');
    const content = result && 'content' in result ? result.content : undefined;
    expect(content).toContain('OFF');
  });

  it('status reports ON when the merged flag is true', () => {
    setMergedFlag(mockContext, true);
    expect(isSmartApproveEnabled(mockContext.services.settings.merged)).toBe(
      true,
    );
    const result = runSubcommand(mockContext, 'status');
    const content = result && 'content' in result ? result.content : undefined;
    expect(content).toContain('ON');
  });

  it('bare invocation defaults to status', () => {
    const result = runAction(mockContext, '');
    const content = result && 'content' in result ? result.content : undefined;
    expect(content).toContain('OFF');
  });

  it('parent action handles on/off args', () => {
    const onResult = runAction(mockContext, 'on');
    expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      SMART_APPROVE_SETTING_KEY,
      true,
    );
    const onContent =
      onResult && 'content' in onResult ? onResult.content : undefined;
    expect(onContent).toContain('ON');

    const offResult = runAction(mockContext, 'off');
    const offContent =
      offResult && 'content' in offResult ? offResult.content : undefined;
    expect(offContent).toContain('OFF');
  });

  it('unknown subcommand returns a usage error', () => {
    const result = runAction(mockContext, 'bogus');
    expect(result).toMatchObject({
      type: 'message',
      messageType: 'error',
    });
    const content = result && 'content' in result ? result.content : undefined;
    expect(content).toContain('Usage');
  });

  it('isSmartApproveEnabled ignores non-boolean values', () => {
    expect(isSmartApproveEnabled({ tools: { smartApprove: 'yes' } })).toBe(
      false,
    );
    expect(isSmartApproveEnabled({ tools: {} })).toBe(false);
    expect(isSmartApproveEnabled(undefined)).toBe(false);
    expect(isSmartApproveEnabled({ tools: { smartApprove: true } })).toBe(true);
  });
});
