/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { contentToText, renderTranscript } from './transcriptCommand.js';

describe('transcriptCommand helpers', () => {
  it('extracts text from strings, parts, and tool calls', () => {
    expect(contentToText('hello')).toBe('hello');
    expect(contentToText([{ text: 'a' }, { text: 'b' }])).toBe('a\nb');
    expect(
      contentToText([
        { functionCall: { name: 'read_file', args: { path: 'x' } } },
      ]),
    ).toContain('[tool call] read_file');
    expect(
      contentToText([
        { functionResponse: { name: 'read_file', response: 'file body' } },
      ]),
    ).toContain('[tool result] read_file: file body');
  });

  it('renders context files, tool schemas, and the conversation', () => {
    const text = renderTranscript({
      sessionId: 'abcd1234-session',
      model: 'mimo-v2.6-flash-free',
      contextFiles: ['/repo/MR-CODER.md'],
      tools: [
        {
          name: 'read_file',
          description: 'Reads a file',
          parameters: { type: 'object', properties: {} },
        },
      ],
      sessionData: {
        messages: [
          { type: 'user', content: 'fix the bug' },
          {
            type: 'gemini',
            content: [
              { text: 'Looking now.' },
              { functionCall: { name: 'read_file', args: { path: 'a.ts' } } },
            ],
          },
        ],
      },
    });
    expect(text).toContain('# Mr Coder session transcript');
    expect(text).toContain('/repo/MR-CODER.md');
    expect(text).toContain('### read_file');
    expect(text).toContain('### User');
    expect(text).toContain('fix the bug');
    expect(text).toContain('### Model');
    expect(text).toContain('[tool call] read_file');
  });
});
