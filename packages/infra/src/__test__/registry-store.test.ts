import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { openRegistryStore } from '../registry-store/open-registry-store';

function tempStorePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'pai-registry-')), 'registry.sqlite');
}

describe('openRegistryStore', () => {
  test('upsert/list/get/remove 往返；按 updatedAt 倒序', () => {
    const db = openRegistryStore(tempStorePath());
    const base = Date.now();
    db.upsert({ threadId: 't1', sessionPath: '/a.jsonl', cwd: '/w1', title: '一', trusted: true, createdAt: base, updatedAt: base, keepalive: false });
    db.upsert({ threadId: 't2', sessionPath: null, cwd: '/w2', title: '二', trusted: false, createdAt: base + 1, updatedAt: base + 10, keepalive: false });
    expect(db.list().map((row) => row.threadId)).toEqual(['t2', 't1']);
    expect(db.get('t1')).toEqual({ threadId: 't1', sessionPath: '/a.jsonl', cwd: '/w1', title: '一', trusted: true, createdAt: base, updatedAt: base, keepalive: false });
    expect(db.get('missing')).toBeNull();
    db.remove('t1');
    expect(db.list().map((row) => row.threadId)).toEqual(['t2']);
    db.close();
  });

  test('upsert 同 id 覆盖（sessionPath/title 更新）', () => {
    const db = openRegistryStore(tempStorePath());
    db.upsert({ threadId: 't', sessionPath: null, cwd: '/w', title: '旧', trusted: false, createdAt: 1, updatedAt: 1, keepalive: false });
    db.upsert({ threadId: 't', sessionPath: '/s.jsonl', cwd: '/w', title: '新', trusted: false, createdAt: 1, updatedAt: 2, keepalive: false });
    const row = db.get('t');
    expect(row).toMatchObject({ sessionPath: '/s.jsonl', title: '新', updatedAt: 2 });
    db.close();
  });

  test('remove 不存在的 id 无害；close 后文件可重开（schema 幂等）', () => {
    const path = tempStorePath();
    const db = openRegistryStore(path);
    db.remove('ghost');
    db.upsert({ threadId: 't', sessionPath: null, cwd: '/w', title: '', trusted: null, createdAt: 1, updatedAt: 1 });
    db.close();
    const reopened = openRegistryStore(path);
    expect(reopened.list().length).toBe(1);
    reopened.close();
    rmSync(join(path, '..'), { recursive: true, force: true });
  });

  test('T13 信任态回放：trusted COALESCE——后续 upsert 传 null 沿用行内记录', () => {
    const db = openRegistryStore(tempStorePath());
    db.upsert({ threadId: 't', sessionPath: '/s.jsonl', cwd: '/w', title: 'x', trusted: true, createdAt: 1, updatedAt: 1 });
    // 同文件重开等场景不指定信任态：不得清掉已记录的 true
    db.upsert({ threadId: 't', sessionPath: '/s.jsonl', cwd: '/w', title: 'x', trusted: null, createdAt: 1, updatedAt: 2 });
    expect(db.get('t')?.trusted).toBe(true);
    // 显式改传 false 时覆盖
    db.upsert({ threadId: 't', sessionPath: '/s.jsonl', cwd: '/w', title: 'x', trusted: false, createdAt: 1, updatedAt: 3 });
    expect(db.get('t')?.trusted).toBe(false);
    db.close();
  });
});


describe('registry keepalive 列（T29 常驻持久真相）', () => {
  test('缺省 false；upsert 保留显式值；行回读 round-trip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pai-registry-ka-'));
    try {
      const store = openRegistryStore(join(dir, 'r.sqlite'));
      store.upsert({ threadId: 't1', sessionPath: '/s.jsonl', cwd: '/w', title: 'T', trusted: null, createdAt: 1, updatedAt: 1, keepalive: false });
      expect(store.get('t1')?.keepalive).toBe(false);
      store.upsert({ threadId: 't1', sessionPath: '/s.jsonl', cwd: '/w', title: 'T', trusted: null, createdAt: 1, updatedAt: 2, keepalive: true });
      expect(store.get('t1')?.keepalive).toBe(true);
      expect(store.list()[0]?.keepalive).toBe(true);
      store.close();
      // 旧库无 keepalive 列的迁移：手工建旧形态表后打开即补列
      const db2 = new DatabaseSync(join(dir, 'old.sqlite'));
      db2.exec('CREATE TABLE sessions (threadId TEXT PRIMARY KEY, sessionPath TEXT, cwd TEXT NOT NULL, title TEXT NOT NULL, trusted INTEGER, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)');
      db2.exec("INSERT INTO sessions VALUES ('legacy', NULL, '/w', 'T', NULL, 1, 1)");
      db2.close();
      const legacy = openRegistryStore(join(dir, 'old.sqlite'));
      expect(legacy.get('legacy')?.keepalive).toBe(false);
      legacy.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
