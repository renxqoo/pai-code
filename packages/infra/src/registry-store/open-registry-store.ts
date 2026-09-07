import { DatabaseSync } from 'node:sqlite';

import type { RegistryStorePort, SessionRow } from '@paiapp/contracts';

/**
 * 会话注册表（node:sqlite）：窗口打开的会话真相，崩溃/重启恢复与侧栏的输入。
 * 同步 API（node:sqlite 语义）；进程内单实例，close 后不可再用。
 */
export function openRegistryStore(dbPath: string): RegistryStorePort {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      threadId TEXT PRIMARY KEY,
      sessionPath TEXT,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  const text = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  };

  const int = (value: unknown): number => {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };

  const rowToObject = (row: Record<string, unknown> | undefined): SessionRow | null => {
    if (row === undefined) return null;
    return {
      threadId: text(row['threadId']),
      sessionPath: typeof row['sessionPath'] === 'string' ? row['sessionPath'] : null,
      cwd: text(row['cwd']),
      title: text(row['title']),
      createdAt: int(row['createdAt']),
      updatedAt: int(row['updatedAt']),
    };
  };

  return {
    list(): SessionRow[] {
      const result = db.prepare('SELECT threadId, sessionPath, cwd, title, createdAt, updatedAt FROM sessions ORDER BY updatedAt DESC').all();
      return result
        .map((row) => rowToObject(row as Record<string, unknown>))
        .filter((row): row is SessionRow => row !== null && row.threadId.length > 0);
    },
    upsert(row: SessionRow): void {
      db.prepare(
        `INSERT INTO sessions (threadId, sessionPath, cwd, title, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(threadId) DO UPDATE SET
           sessionPath = excluded.sessionPath,
           cwd = excluded.cwd,
           title = excluded.title,
           updatedAt = excluded.updatedAt`,
      ).run(row.threadId, row.sessionPath, row.cwd, row.title, row.createdAt, row.updatedAt);
    },
    get(threadId: string): SessionRow | null {
      const row = db.prepare('SELECT threadId, sessionPath, cwd, title, createdAt, updatedAt FROM sessions WHERE threadId = ?').get(threadId);
      return rowToObject(row as Record<string, unknown> | undefined);
    },
    remove(threadId: string): void {
      db.prepare('DELETE FROM sessions WHERE threadId = ?').run(threadId);
    },
    close(): void {
      db.close();
    },
  };
}
