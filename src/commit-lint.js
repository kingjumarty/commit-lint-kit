#!/usr/bin/env node
/**
 * commit-lint-kit / src/commit-lint.js
 * A configurable commit message linter enforcing Conventional Commit standards.
 *
 * Usage:
 *   node src/commit-lint.js "feat(auth): add login flow"
 *   node src/commit-lint.js --file .git/COMMIT_EDITMSG
 *   node src/commit-lint.js --install-hook
 *   node src/commit-lint.js --help
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  types: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'build', 'ci', 'revert'],
  maxHeaderLength: 100,
  requireScope: false,
  scopeCase: null, // e.g. 'kebab-case' — null means no enforcement
};

function loadConfig() {
  const configPath = path.join(process.cwd(), '.commitlintkitrc.json');
  if (fs.existsSync(configPath)) {
    try {
      const user = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...user };
    } catch (e) {
      console.error(`⚠ Could not parse ${configPath}, using defaults.`);
    }
  }
  return DEFAULT_CONFIG;
}

const HEADER_RE = /^(?<type>[a-z]+)(\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<subject>.+)$/;

function lint(message, config) {
  const errors = [];
  const header = message.split('\n')[0];

  if (header.length > config.maxHeaderLength) {
    errors.push(`Header exceeds ${config.maxHeaderLength} characters (${header.length}).`);
  }

  const match = HEADER_RE.exec(header);
  if (!match) {
    errors.push(`Header does not match Conventional Commits format: "type(scope): subject". Got: "${header}"`);
    return errors;
  }

  const { type, scope, subject } = match.groups;

  if (!config.types.includes(type)) {
    errors.push(`Type "${type}" is not allowed. Allowed types: ${config.types.join(', ')}`);
  }

  if (config.requireScope && !scope) {
    errors.push('A scope is required, e.g. "feat(auth): ...".');
  }

  if (config.scopeCase === 'kebab-case' && scope && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(scope)) {
    errors.push(`Scope "${scope}" must be kebab-case.`);
  }

  if (!subject || subject.trim().length === 0) {
    errors.push('Subject cannot be empty.');
  } else {
    if (subject[0] !== subject[0].toLowerCase()) {
      errors.push('Subject should start with a lowercase letter.');
    }
    if (subject.endsWith('.')) {
      errors.push('Subject should not end with a period.');
    }
  }

  return errors;
}

function installHook() {
  const hookDir = path.join(process.cwd(), '.git', 'hooks');
  if (!fs.existsSync(hookDir)) {
    console.error('✗ No .git/hooks directory found. Run this inside a git repository.');
    process.exit(1);
  }
  const hookPath = path.join(hookDir, 'commit-msg');
  const hookScript = `#!/bin/sh\nnode "${path.join(process.cwd(), 'src', 'commit-lint.js')}" --file "$1" || exit 1\n`;
  fs.writeFileSync(hookPath, hookScript, { mode: 0o755 });
  fs.chmodSync(hookPath, 0o755);
  console.log(`✓ Installed commit-msg hook at ${hookPath}`);
}

function printHelp() {
  console.log(`commit-lint-kit — Conventional Commit linter

Usage:
  commit-lint "<message>"          Lint a message string
  commit-lint --file <path>        Lint a message from a file (e.g. COMMIT_EDITMSG)
  commit-lint --install-hook       Install a git commit-msg hook that runs this linter
  commit-lint --help               Show this help

Config:
  Create a .commitlintkitrc.json in your repo root to override defaults:
  {
    "types": ["feat", "fix", "docs"],
    "maxHeaderLength": 72,
    "requireScope": true,
    "scopeCase": "kebab-case"
  }`);
}

function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();

  if (args.includes('--help') || args.length === 0) {
    printHelp();
    return;
  }

  if (args.includes('--install-hook')) {
    installHook();
    return;
  }

  let message;
  const fileFlagIdx = args.indexOf('--file');
  if (fileFlagIdx !== -1) {
    const filePath = args[fileFlagIdx + 1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`✗ File not found: ${filePath}`);
      process.exit(1);
    }
    message = fs.readFileSync(filePath, 'utf8').trim();
  } else {
    message = args.filter((a) => !a.startsWith('--')).join(' ');
  }

  if (!message) {
    console.error('✗ No commit message provided.');
    process.exit(1);
  }

  const errors = lint(message, config);
  if (errors.length === 0) {
    console.log(`✓ Commit message passes lint: "${message.split('\n')[0]}"`);
    process.exit(0);
  } else {
    console.error(`✗ Commit message failed lint:\n`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

main();
