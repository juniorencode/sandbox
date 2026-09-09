import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import storeModule from '../store.cjs';

// The store takes its directory as a parameter, so no Electron app and no
// module mocking are involved: it is exercised against a real directory
// inside the project.
const ROOT = path.join(process.cwd(), '.test-tmp', 'store');
const store = storeModule.createStore(ROOT);

const workspaceFile = path.join(ROOT, 'workspace.json');
const backupFile = `${workspaceFile}.bak`;

const sample = code => ({
  tabs: [{ id: 1, name: 'Tab 1', code, path: null }],
  activeTab: 1,
  settings: {}
});

describe('workspace store', () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
  });

  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  it('returns null when nothing has been stored', () => {
    expect(store.read()).toBeNull();
  });

  it('round-trips a workspace and stamps a version', () => {
    store.write(sample('one'));
    const read = store.read();
    expect(read.tabs[0].code).toBe('one');
    expect(read.version).toBe(storeModule.CURRENT_VERSION);
  });

  it('keeps the previous version as a backup', () => {
    store.write(sample('first'));
    store.write(sample('second'));
    expect(JSON.parse(fs.readFileSync(backupFile, 'utf8')).tabs[0].code).toBe(
      'first'
    );
    expect(store.read().tabs[0].code).toBe('second');
  });

  it('falls back to the backup when the main file is corrupt', () => {
    // This is the case that made localStorage dangerous as the only copy:
    // one unreadable blob and every snippet was gone.
    store.write(sample('first'));
    store.write(sample('second'));
    fs.writeFileSync(workspaceFile, '{ truncated', 'utf8');
    expect(store.read().tabs[0].code).toBe('first');
  });

  it('rejects a stored file with no tabs rather than rendering nothing', () => {
    fs.writeFileSync(workspaceFile, JSON.stringify({ tabs: [] }), 'utf8');
    expect(store.read()).toBeNull();
  });

  it('leaves no temp file behind after a write', () => {
    store.write(sample('one'));
    expect(fs.existsSync(`${workspaceFile}.tmp`)).toBe(false);
  });

  it('creates the directory when it does not exist yet', () => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    store.write(sample('one'));
    expect(store.read().tabs[0].code).toBe('one');
  });
});
