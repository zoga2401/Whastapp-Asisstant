import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../../');

test('Stage 12 operational assets are present and restore tools are dry-run only', () => {
  const restoreScripts = [
    'scripts/postgres-restore-dry-run.ps1',
    'scripts/baileys-restore-dry-run.ps1',
  ];
  for (const relative of restoreScripts) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /DRY RUN ONLY/);
    assert.doesNotMatch(source, /DROP\s+DATABASE|Remove-Item/i);
  }
  assert.ok(fs.existsSync(path.join(root, 'ecosystem.config.cjs')));
  assert.ok(fs.existsSync(path.join(root, 'ops/nginx/zoga.conf.example')));
});

test('health probe contract is documented', () => {
  const server = fs.readFileSync(path.join(root, 'apps/backend/src/server.ts'), 'utf8');
  assert.match(server, /\/health\/live/);
  assert.match(server, /\/health\/ready/);
  assert.match(server, /\/metrics/);
  assert.match(server, /\/api\/whatsapp\/status/);
});
