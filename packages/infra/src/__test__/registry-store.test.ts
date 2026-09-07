import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openRegistryStore } from '../registry-store/open-registry-store';

function tempStorePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'pai-registry-')), 'registry.sqlite');
}

describe('openRegistryStore', () => {
  test('upsert/list/get/remove 往返；按 updatedAt 倒序', () => {
    const db = openRegistryStore(tempStorePath());
    const base = Date.now();
    db.upsert({ threadId: 't1', sessionPath: '/a.jsonl', cwd: '/w1', title: '一', createdAt: base, updatedAt: base });
    db.upsert({ threadId: 't2', sessionPath: null, cwd: '/w2', title: '二', createdAt: base + 1, updatedAt: base + 10 });
    expect(db.list().map((row) => row.threadId)).toEqual(['t2', 't1']);
    expect(db.get('t1')).toEqual({ threadId: 't1', sessionPath: '/a.jsonl', cwd: '/w1', title: '一', createdAt: base, updatedAt: base });
    expect(db.get('missing')).toBeNull();
    db.remove('t1');
    expect(db.list().map((row) => row.threadId)).toEqual(['t2']);
    db.close();
  });

  test('upsert 同 id 覆盖（sessionPath/title 更新）', () => {
    const db = openRegistryStore(tempStorePath());
    db.upsert({ threadId: 't', sessionPath: null, cwd: '/w', title: '旧', createdAt: 1, updatedAt: 1 });
    db.upsert({ threadId: 't', sessionPath: '/s.jsonl', cwd: '/w', title: '新', createdAt: 1, updatedAt: 2 });
    const row = db.get('t');
    expect(row).toMatchObject({ sessionPath: '/s.jsonl', title: '新', updatedAt: 2 });
    db.close();
  });

  test('remove 不存在的 id 无害；close 后文件可重开（schema 幂等）', () => {
    const path = tempStorePath();
    const db = openRegistryStore(path);
    db.remove('ghost');
    db.upsert({ threadId: 't', sessionPath: null, cwd: '/w', title: '', createdAt: 1, updatedAt: 1 });
    db.close();
    const reopened = openRegistryStore(path);
    expect(reopened.list().length).toBe(1);
    reopened.close();
    rmSync(join(path, '..'), { recursive: true, force: true });
  });
});
