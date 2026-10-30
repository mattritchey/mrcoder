/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadRecipes,
  parseRecipeFile,
  renderRecipe,
  parseAssignments,
  recipeCommand,
} from './recipeCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

describe('recipeCommand helpers', () => {
  let tmp: string;
  let projectRoot: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcoder-recipes-'));
    projectRoot = path.join(tmp, 'project');
    const recipeDir = path.join(projectRoot, '.mr-coder', 'recipes');
    fs.mkdirSync(recipeDir, { recursive: true });
    fs.writeFileSync(
      path.join(recipeDir, 'greet.toml'),
      [
        'name = "greet"',
        'description = "Greet someone"',
        'prompt = "Say hello to {{name}} in {{lang}}."',
        '',
        '[parameters.name]',
        'required = true',
        'description = "Who to greet"',
        '',
        '[parameters.lang]',
        'default = "English"',
        '',
      ].join('\n'),
      'utf8',
    );
    vi.stubEnv('HOME', tmp);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('parses a recipe file with parameters', () => {
    const recipe = parseRecipeFile(
      path.join(projectRoot, '.mr-coder', 'recipes', 'greet.toml'),
    );
    expect(recipe?.name).toBe('greet');
    expect(recipe?.parameters).toHaveLength(2);
    expect(recipe?.parameters[0]).toMatchObject({
      name: 'name',
      required: true,
    });
    expect(recipe?.parameters[1]).toMatchObject({
      name: 'lang',
      default: 'English',
    });
  });

  it('loads recipes from the project recipes dir', () => {
    const recipes = loadRecipes(projectRoot);
    expect(recipes.map((r) => r.name)).toContain('greet');
  });

  it('renders with defaults and provided values', () => {
    const recipe = loadRecipes(projectRoot)[0];
    expect(renderRecipe(recipe, { name: 'Sam' })).toEqual({
      prompt: 'Say hello to Sam in English.',
    });
    expect(renderRecipe(recipe, { name: 'Sam', lang: 'French' })).toEqual({
      prompt: 'Say hello to Sam in French.',
    });
  });

  it('errors when a required parameter is missing', () => {
    const recipe = loadRecipes(projectRoot)[0];
    const result = renderRecipe(recipe, {});
    expect('error' in result && result.error).toContain('"name"');
  });

  it('parses key=value assignments', () => {
    expect(parseAssignments(['a=1', 'b=two=2', 'ignored'])).toEqual({
      a: '1',
      b: 'two=2',
    });
  });
});

describe('recipeCommand run with model and extensions', () => {
  let tmp: string;
  let projectRoot: string;
  let setModel: ReturnType<typeof vi.fn>;
  let getMcpServers: ReturnType<typeof vi.fn>;

  const recipePath = (fileName: string) =>
    path.join(projectRoot, '.mr-coder', 'recipes', fileName);

  const runRecipe = async (args: string) => {
    const addItem = vi.fn();
    const context = createMockCommandContext({
      invocation: { raw: `/recipe ${args}`, name: 'recipe', args },
      services: {
        agentContext: {
          config: {
            getProjectRoot: () => projectRoot,
            setModel,
            getMcpServers,
          },
        },
      },
      ui: { addItem },
    });
    const result = await recipeCommand.action!(context, '');
    return { addItem, result };
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrcoder-recipes-run-'));
    projectRoot = path.join(tmp, 'project');
    fs.mkdirSync(path.join(projectRoot, '.mr-coder', 'recipes'), {
      recursive: true,
    });
    fs.writeFileSync(
      recipePath('full.toml'),
      [
        'name = "full"',
        'prompt = "Do the thing."',
        'extensions = ["alpha", "missing-one", "missing-two"]',
        '',
        '[model]',
        'name = "full-model"',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      recipePath('model-only.toml'),
      [
        'name = "model-only"',
        'prompt = "Do the thing."',
        '',
        '[model]',
        'name = "model-only-model"',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      recipePath('extensions-only.toml'),
      [
        'name = "extensions-only"',
        'prompt = "Do the thing."',
        'extensions = ["alpha"]',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      recipePath('plain.toml'),
      ['name = "plain"', 'prompt = "Do the thing."', ''].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      recipePath('needs-param.toml'),
      [
        'name = "needs-param"',
        'prompt = "Do {{thing}}."',
        '',
        '[model]',
        'name = "never-applied-model"',
        '',
        '[parameters.thing]',
        'required = true',
        '',
      ].join('\n'),
      'utf8',
    );
    vi.stubEnv('HOME', tmp);
    setModel = vi.fn();
    getMcpServers = vi.fn().mockReturnValue({ alpha: {} });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('parses [model] and extensions together', () => {
    const recipe = parseRecipeFile(recipePath('full.toml'));
    expect(recipe?.model).toBe('full-model');
    expect(recipe?.extensions).toEqual(['alpha', 'missing-one', 'missing-two']);
  });

  it('parses [model] alone', () => {
    const recipe = parseRecipeFile(recipePath('model-only.toml'));
    expect(recipe?.model).toBe('model-only-model');
    expect(recipe?.extensions).toEqual([]);
  });

  it('parses extensions alone', () => {
    const recipe = parseRecipeFile(recipePath('extensions-only.toml'));
    expect(recipe?.model).toBeUndefined();
    expect(recipe?.extensions).toEqual(['alpha']);
  });

  it('parses a recipe with neither section', () => {
    const recipe = parseRecipeFile(recipePath('plain.toml'));
    expect(recipe?.model).toBeUndefined();
    expect(recipe?.extensions).toEqual([]);
  });

  it('applies the recipe model and reports the switch, then submits the prompt', async () => {
    const { addItem, result } = await runRecipe('run model-only');
    expect(setModel).toHaveBeenCalledWith('model-only-model', true);
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Model switched to model-only-model for this recipe.',
      }),
      expect.any(Number),
    );
    expect(result).toEqual({
      type: 'submit_prompt',
      content: 'Do the thing.',
    });
  });

  it('warns listing exactly the missing extensions and still submits', async () => {
    const { addItem, result } = await runRecipe('run full');
    expect(setModel).toHaveBeenCalledWith('full-model', true);
    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Model switched to full-model for this recipe.\nWarning: recipe extensions not loaded: missing-one, missing-two.',
      }),
      expect.any(Number),
    );
    expect(result).toEqual({
      type: 'submit_prompt',
      content: 'Do the thing.',
    });
  });

  it('does not warn when every declared extension is loaded', async () => {
    const { addItem, result } = await runRecipe('run extensions-only');
    expect(setModel).not.toHaveBeenCalled();
    expect(addItem).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'submit_prompt',
      content: 'Do the thing.',
    });
  });

  it('runs an existing-format recipe byte-identically: no model switch, no message', async () => {
    const { addItem, result } = await runRecipe('run plain');
    expect(setModel).not.toHaveBeenCalled();
    expect(addItem).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'submit_prompt',
      content: 'Do the thing.',
    });
  });

  it('does not apply the model when rendering fails', async () => {
    const { addItem, result } = await runRecipe('run needs-param');
    expect(setModel).not.toHaveBeenCalled();
    expect(addItem).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'Recipe "needs-param" needs a value for parameter "thing". Pass it as thing=value.',
    });
  });
});
