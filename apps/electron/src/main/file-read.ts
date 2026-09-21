import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { join as joinPaths, sep as pathSep } from 'node:path';

import { appError, type ApiError } from '@paiapp/api';

/**
 * 项目文件只读面（代码查看器/Markdown 预览数据源）：相对路径 + 点前缀段拒绝
 * （与 file/search 枚举面一致）、realpath 归一后必须仍在 cwd 之下（防符号链接
 * 逃逸）、二进制嗅探（前 8KiB 含 NUL）、读取上限 2MiB（超限按上限限长读取并
 * 标记截断，size 回真实字节数）。全部失败走判别联合 ApiError（原 token 入
 * message 保真），垃圾输入降级不抛异常。
 */

export type FileReadResult = { content: string; truncated: boolean; size: number };
export type FileReadOutcome = { ok: true; data: FileReadResult } | { ok: false; error: ApiError };

/** 读取上限：超出部分不读（内存上界 = 2MiB），渲染层据 truncated 提示。 */
const MAX_READ_BYTES = 2 * 1024 * 1024;
/** 二进制嗅探窗口：源码/文档在前 8KiB 出现 NUL 即按二进制拒绝。 */
const BINARY_SNIFF_BYTES = 8 * 1024;

/** 相对路径合法性：非空段、无 `..`、段不得以 `.` 开头、拒绝绝对路径与控制字符。 */
export function isReadableRelativePath(path: string): boolean {
  if (path.length === 0 || path.includes('\0')) return false;
  // Windows 绝对路径（盘符/反斜杠分隔）与 POSIX 绝对路径都拒绝
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.includes('\\')) return false;
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..') return false;
    if (segment.startsWith('.')) return false;
    for (const char of segment) {
      const code = char.charCodeAt(0);
      if (code <= 0x1f || code === 0x7f) return false;
    }
  }
  return true;
}

/** 字节窗口内是否含 NUL（utf8 多字节序列不产生 0x00，直接按字节判定）。 */
export function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < limit; index += 1) {
    if (bytes[index] === 0) return true;
  }
  return false;
}

export type FileReadFs = {
  realpathSync(path: string): string;
  statSync(path: string): { size: number; isFile(): boolean };
  openSync(path: string, flags: string): number;
  readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number;
  closeSync(fd: number): void;
};

export type FileReadDeps = {
  /** fs 面注入（测试替身）；缺省真实 node:fs。 */
  fs?: FileReadFs;
};

export function createFileRead(deps: FileReadDeps = {}) {
  const fs: FileReadFs = deps.fs ?? { realpathSync, statSync, openSync, readSync, closeSync };

  /** fd 限长读：最多读取 limit 字节（大文件内存上界），短读（EOF）即止。 */
  const readUpTo = (path: string, limit: number): Buffer => {
    const fd = fs.openSync(path, 'r');
    try {
      const buffer = Buffer.alloc(limit);
      let offset = 0;
      while (offset < limit) {
        const read = fs.readSync(fd, buffer, offset, limit - offset, offset);
        if (read === 0) break;
        offset += read;
      }
      return buffer.subarray(0, offset);
    } finally {
      fs.closeSync(fd);
    }
  };

  const read = (cwd: string, path: string): FileReadOutcome => {
    if (!isReadableRelativePath(path)) return { ok: false, error: appError('invalid_params', 'invalid_path') };
    let rootReal: string;
    try {
      rootReal = fs.realpathSync(cwd);
    } catch {
      return { ok: false, error: appError('cwd_not_found') };
    }
    let targetReal: string;
    try {
      targetReal = fs.realpathSync(joinPaths(rootReal, path));
    } catch {
      // 路径中某段不存在（realpath 对缺失段抛错）；目录已归一，缺的就是文件本体
      return { ok: false, error: { kind: 'io_failed', message: 'not_found' } };
    }
    if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}${pathSep}`)) {
      return { ok: false, error: { kind: 'path_forbidden', message: 'path_forbidden' } };
    }
    let size: number;
    let isFile: boolean;
    try {
      const stats = fs.statSync(targetReal);
      size = stats.size;
      isFile = stats.isFile();
    } catch {
      return { ok: false, error: { kind: 'io_failed', message: 'not_found' } };
    }
    if (!isFile) return { ok: false, error: appError('invalid_params', 'invalid_path') };
    let bytes: Buffer;
    try {
      bytes = readUpTo(targetReal, Math.min(size, MAX_READ_BYTES));
    } catch {
      return { ok: false, error: { kind: 'io_failed', message: 'read_failed' } };
    }
    if (looksBinary(bytes)) return { ok: false, error: appError('invalid_params', 'binary_file') };
    return { ok: true, data: { content: bytes.toString('utf8'), truncated: size > MAX_READ_BYTES, size } };
  };

  return { read };
}

export type FileRead = ReturnType<typeof createFileRead>;
