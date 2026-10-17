#!/usr/bin/env python3
"""mr-coder round 4: Gemini -> Mr Coder display rename (deterministic).

Run from the repo root:  python3 round4-rename.py
Applies the exact string operations that were build/test-verified on the
reference tree. Prints every file it changes; expected total: 144.
"""
import pathlib, re, sys

changed = []

def apply(path, fn):
    p = pathlib.Path(path)
    s = p.read_text()
    s2 = fn(s)
    if s2 != s:
        p.write_text(s2)
        changed.append(str(path))

def rep(s, old, new):
    return s.replace(old, new)

def pass_a(s):
    s = rep(s, 'Gemini CLI', 'Mr Coder')
    s = rep(s, 'This is the Mr Coder', 'This is Mr Coder')
    s = rep(s, 'GEMINI.md', 'MR-CODER.md')
    s = rep(s, 'Gemini API Key', 'Mr Coder API Key')
    s = rep(s, 'Choose a specific Gemini model for conversations',
            'Choose a specific model for conversations')
    s = rep(s, 'Choose your Gemini model with /model', 'Choose your model with /model')
    s = rep(s, 'The Gemini model to use for conversations.',
            'The model to use for conversations.')
    s = rep(s, 'Start Gemini in a new git worktree.', 'Start Mr Coder in a new git worktree.')
    s = rep(s, 'Gemini is talking', 'Mr Coder is talking')
    s = rep(s, 'Use an API key with Gemini Developer API',
            'Use an API key with the Mr Coder API')
    s = rep(s, 'Run: gemini ', 'Run: mr-coder ')
    s = rep(s, 'Usage: gemini ', 'Usage: mr-coder ')
    s = re.sub(r'\bgemini (?=gemma\b|mcp\b|extensions\b|trust\b|--)', 'mr-coder ', s)
    s = rep(s, 'piping data into gemini or', 'piping data into mr-coder or')
    s = rep(s, '$(which gemini)', '$(which mr-coder)')
    s = rep(s, 'installed gemini binary', 'installed mr-coder binary')
    s = rep(s, 'For help on gemini-cli', 'For help on mr-coder')
    return s

def mirror(s):
    s = rep(s, 'Gemini CLI', 'Mr Coder')
    s = rep(s, 'This is the Mr Coder', 'This is Mr Coder')
    s = rep(s, 'GEMINI.md', 'MR-CODER.md')
    return s

def skip_src(p):
    return ('.test.' in p.name or '.spec.' in p.name or '__snapshots__' in str(p)
            or p.suffix not in ('.ts', '.tsx'))

for base in ['packages/cli/src', 'packages/core/src']:
    for p in sorted(pathlib.Path(base).rglob('*')):
        if not skip_src(p):
            apply(p, pass_a)

CORE_TESTS = ['src/agents/browser/inputBlocker.test.ts', 'src/agents/cli-help-agent.test.ts',
    'src/agents/skill-extraction-agent.test.ts', 'src/commands/memory.test.ts',
    'src/core/client.test.ts', 'src/core/prompts.test.ts', 'src/mcp/oauth-provider.test.ts',
    'src/prompts/snippets-memory.test.ts', 'src/services/memoryService.test.ts']
for f in CORE_TESTS:
    apply(pathlib.Path('packages/core') / f, mirror)

CLI_TESTS = ['src/ui/AppContainer.test.tsx', 'src/utils/windowTitle.test.ts',
    'src/utils/userStartupWarnings.test.ts', 'src/ui/hooks/useFolderTrust.test.ts',
    'src/ui/components/FolderTrustDialog.test.tsx', 'src/ui/commands/initCommand.test.ts',
    'src/ui/components/UserIdentity.test.tsx', 'src/ui/components/LogoutConfirmationDialog.test.tsx',
    'src/ui/components/HistoryItemDisplay.test.tsx', 'src/ui/components/AboutBox.test.tsx',
    'src/ui/commands/settingsCommand.test.ts', 'src/ui/IdeIntegrationNudge.test.tsx',
    'src/config/settingsSchema.test.ts', 'src/config/extension.test.ts',
    'src/commands/extensions.test.tsx', 'src/acp/commands/help.test.ts']
for f in CLI_TESTS:
    apply(pathlib.Path('packages/cli') / f, mirror)

def special(path, pairs):
    def fn(s):
        for old, new in pairs:
            assert s.count(old) == 1, f'{path}: expected exactly 1 of {old!r}, found {s.count(old)}'
            s = s.replace(old, new)
        return s
    apply(path, fn)

special('packages/core/src/commands/init.ts', [
    ('brings the power of Gemini directly into the terminal',
     'brings the power of Mr Coder directly into the terminal')])
special('packages/cli/src/acp/acpRpcDispatcher.ts', [
    ("name: 'Gemini API key'", "name: 'Mr Coder API key'")])
special('packages/cli/src/acp/acpSessionManager.ts', [
    ("'Gemini API key is missing or not configured.'",
     "'Mr Coder API key is missing or not configured.'")])
special('packages/cli/src/ui/components/UserIdentity.tsx', [
    ("            `Authenticated with ${authType}`",
     "            `Authenticated with ${\n"
     "              // mr-coder fork: display-only relabel; the stored auth\n"
     "              // type value stays 'gemini-api-key' for settings compat.\n"
     "              authType === AuthType.USE_GEMINI ? 'mr-coder-api-key' : authType\n"
     "            }`")])
special('packages/cli/src/config/config.ts', [
    ("""  if (settings.context?.fileName) {
    setServerGeminiMdFilename(settings.context.fileName);
  } else {
    // Reset to default if not provided in settings.
    resetGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
  }""",
     """  if (settings.context?.fileName) {
    setServerGeminiMdFilename(settings.context.fileName);
  } else {
    // mr-coder fork: MR-CODER.md is the primary context filename;
    // GEMINI.md is still discovered so existing projects keep working.
    setServerGeminiMdFilename(['MR-CODER.md', 'GEMINI.md']);
  }"""),
    ("""  resetGeminiMdFilename,
  DEFAULT_CONTEXT_FILENAME,
""", "")])
special('packages/cli/src/utils/terminalTheme.ts', [
    ("""  config.setTerminalBackground(terminalBackground);
  themeManager.setTerminalBackground(terminalBackground);""",
     """  config.setTerminalBackground(terminalBackground);
  // mr-coder fork: do NOT hand the detected terminal background to the
  // theme manager. Upstream blends panel/message/border colors toward
  // the terminal background, which washes out the active theme; MiMo
  // Code (the fork's look target) renders its theme colors flat, so the
  // fork does the same. Detection above still drives the compatibility
  // warning below.
  themeManager.setTerminalBackground(undefined);""")])
special('packages/cli/src/ui/components/UserIdentity.test.tsx', [
    ("`Authenticated with ${AuthType.USE_GEMINI}`", "'Authenticated with mr-coder-api-key'")])
special('packages/cli/src/ui/commands/initCommand.test.ts', [
    ("brings the power of Gemini'", "brings the power of Mr Coder'")])

print(f'changed {len(changed)} files')
