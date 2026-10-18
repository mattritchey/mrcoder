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
} from './recipeCommand.js';

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
