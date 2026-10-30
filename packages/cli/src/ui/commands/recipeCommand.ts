/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// mr-coder fork: recipes, modeled on Goose recipes. A recipe is a TOML
// file packaging a reusable task: a prompt template with typed named
// parameters (defaults + required flags), discovered from
// <project>/.mr-coder/recipes/ and ~/.gemini/recipes/.
//   /recipe            list recipes
//   /recipe show <name>
//   /recipe run <name> [key=value ...]

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import toml from '@iarna/toml';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
import { MessageType } from '../types.js';

export interface RecipeParameter {
  name: string;
  default?: string;
  description?: string;
  required: boolean;
}

export interface Recipe {
  name: string;
  description: string;
  prompt: string;
  parameters: RecipeParameter[];
  // Optional, Goose-style self-contained recipe metadata. model is the
  // model to switch to when the recipe runs; extensions lists MCP server
  // names the recipe expects to be loaded. Both are empty/absent for
  // recipes in the original format, which behave exactly as before.
  model?: string;
  extensions: string[];
  sourcePath: string;
}

interface RawRecipe {
  name?: unknown;
  description?: unknown;
  prompt?: unknown;
  model?: unknown;
  extensions?: unknown;
  parameters?: Record<
    string,
    { default?: unknown; description?: unknown; required?: unknown }
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      names.push(item);
    }
  }
  return names;
}

function parseModelName(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (isRecord(value)) {
    const name = value['name'];
    if (typeof name === 'string' && name.trim()) {
      return name;
    }
  }
  return undefined;
}

function parseExtensionNames(value: unknown): string[] {
  const direct = stringList(value);
  if (direct !== undefined) {
    return direct;
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  if (isRecord(value)) {
    // Table form, e.g. [extensions] with a list under one of these keys.
    for (const key of ['names', 'servers', 'list', 'enabled', 'items']) {
      const list = stringList(value[key]);
      if (list !== undefined) {
        return list;
      }
    }
    // Table form where each server is a key, e.g. [extensions] with one
    // entry per server name.
    return Object.keys(value);
  }
  return [];
}

export function parseRecipeFile(filePath: string): Recipe | null {
  let raw: RawRecipe;
  try {
    raw = toml.parse(fs.readFileSync(filePath, 'utf8')) as RawRecipe;
  } catch {
    return null;
  }
  if (typeof raw.prompt !== 'string' || !raw.prompt.trim()) {
    return null;
  }
  const parameters: RecipeParameter[] = [];
  for (const [name, spec] of Object.entries(raw.parameters ?? {})) {
    parameters.push({
      name,
      default: spec?.default === undefined ? undefined : String(spec.default),
      description:
        typeof spec?.description === 'string' ? spec.description : undefined,
      required: spec?.required === true,
    });
  }
  return {
    name:
      typeof raw.name === 'string' && raw.name
        ? raw.name
        : path.basename(filePath, '.toml'),
    description: typeof raw.description === 'string' ? raw.description : '',
    prompt: raw.prompt,
    parameters,
    model: parseModelName(raw.model),
    extensions: parseExtensionNames(raw.extensions),
    sourcePath: filePath,
  };
}

export function recipeDirs(projectRoot: string): string[] {
  return [
    path.join(projectRoot, '.mr-coder', 'recipes'),
    path.join(os.homedir(), '.gemini', 'recipes'),
  ];
}

export function loadRecipes(projectRoot: string): Recipe[] {
  const recipes: Recipe[] = [];
  const seen = new Set<string>();
  for (const dir of recipeDirs(projectRoot)) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.toml')) {
        continue;
      }
      const recipe = parseRecipeFile(path.join(dir, entry));
      // Project recipes shadow user recipes with the same name.
      if (recipe && !seen.has(recipe.name)) {
        seen.add(recipe.name);
        recipes.push(recipe);
      }
    }
  }
  return recipes;
}

export function renderRecipe(
  recipe: Recipe,
  values: Record<string, string>,
): { prompt: string } | { error: string } {
  const resolved: Record<string, string> = {};
  for (const param of recipe.parameters) {
    const value = values[param.name] ?? param.default;
    if (value === undefined) {
      if (param.required) {
        return {
          error: `Recipe "${recipe.name}" needs a value for parameter "${param.name}"${param.description ? ` (${param.description})` : ''}. Pass it as ${param.name}=value.`,
        };
      }
      resolved[param.name] = '';
    } else {
      resolved[param.name] = value;
    }
  }
  let prompt = recipe.prompt;
  for (const [key, value] of Object.entries({
    ...resolved,
    ...values,
  })) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }
  const leftover = prompt.match(/\{\{(\w+)\}\}/);
  if (leftover) {
    return {
      error: `Recipe "${recipe.name}" references unknown parameter "{{${leftover[1]}}}". Declare it under [parameters] in the recipe file.`,
    };
  }
  return { prompt };
}

export function parseAssignments(args: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq > 0) {
      values[arg.slice(0, eq)] = arg.slice(eq + 1);
    }
  }
  return values;
}

function message(
  content: string,
  messageType: 'info' | 'error' = 'info',
): SlashCommandActionReturn {
  return { type: 'message', messageType, content };
}

async function recipeAction(
  context: Parameters<NonNullable<SlashCommand['action']>>[0],
): Promise<SlashCommandActionReturn | void> {
  const config = context.services.agentContext?.config;
  if (!config) {
    return message('Configuration not available.', 'error');
  }
  const recipes = loadRecipes(config.getProjectRoot());
  const tokens = (context.invocation?.args ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const [sub, name, ...rest] = tokens;

  if (!sub || sub === 'list') {
    if (recipes.length === 0) {
      return message(
        'No recipes found. Add TOML recipe files to .mr-coder/recipes/ in this project or ~/.gemini/recipes/. A recipe needs a prompt and may declare [parameters] with defaults.',
      );
    }
    const lines = ['Recipes:', ''];
    for (const recipe of recipes) {
      lines.push(
        `- ${recipe.name}${recipe.description ? ` — ${recipe.description}` : ''}`,
      );
    }
    lines.push('', 'Run one with /recipe run <name> [key=value ...]');
    context.ui.addItem(
      { type: MessageType.INFO, text: lines.join('\n') },
      Date.now(),
    );
    return;
  }

  const recipe = recipes.find((r) => r.name === name);
  if (!recipe) {
    return message(
      `No recipe named "${name ?? ''}". Run /recipe to list what is available.`,
      'error',
    );
  }

  if (sub === 'show') {
    const paramLines = recipe.parameters.map(
      (p) =>
        `- {{${p.name}}}${p.required ? ' (required)' : ''}${p.default !== undefined ? ` default: ${p.default}` : ''}${p.description ? ` — ${p.description}` : ''}`,
    );
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: [
          `Recipe: ${recipe.name}`,
          recipe.description,
          `File: ${recipe.sourcePath}`,
          '',
          'Parameters:',
          ...(paramLines.length > 0 ? paramLines : ['(none)']),
          '',
          'Prompt:',
          recipe.prompt,
        ].join('\n'),
      },
      Date.now(),
    );
    return;
  }

  if (sub === 'run') {
    const rendered = renderRecipe(recipe, parseAssignments(rest));
    if ('error' in rendered) {
      return message(rendered.error, 'error');
    }
    // Self-contained recipe setup, applied only once the prompt rendered
    // successfully so a failed run has no side effects. The model switch
    // reuses config.setModel exactly as /model set does (temporary, not
    // persisted); missing extensions only warn, they never block the run.
    // Recipes without [model]/[extensions] skip this block entirely and
    // submit exactly as before.
    const notes: string[] = [];
    if (recipe.model) {
      config.setModel(recipe.model, true);
      notes.push(`Model switched to ${recipe.model} for this recipe.`);
    }
    if (recipe.extensions.length > 0) {
      const mcpServers = config.getMcpServers() ?? {};
      const loadedNames = Object.keys(mcpServers);
      const missing = recipe.extensions.filter(
        (name) => !loadedNames.includes(name),
      );
      if (missing.length > 0) {
        notes.push(
          `Warning: recipe extensions not loaded: ${missing.join(', ')}.`,
        );
      }
    }
    if (notes.length > 0) {
      context.ui.addItem(
        { type: MessageType.INFO, text: notes.join('\n') },
        Date.now(),
      );
    }
    return { type: 'submit_prompt', content: rendered.prompt };
  }

  return message(
    `Unknown /recipe subcommand "${sub}". Use /recipe, /recipe show <name>, or /recipe run <name> [key=value ...].`,
    'error',
  );
}

export const recipeCommand: SlashCommand = {
  name: 'recipe',
  description:
    'List, show, or run recipes (parameterized task templates from .mr-coder/recipes or ~/.gemini/recipes)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: recipeAction,
};
