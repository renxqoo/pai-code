import { describe, expect, test } from 'bun:test';

import { parseDiagnosticEvent } from '../diagnostic-events';

describe('parseDiagnosticEvent（监督字符串 → 事件）', () => {
  test('前缀表逐项（生产形态：pai-runtime 落日志带 host: 前缀）', () => {
    expect(parseDiagnosticEvent('host:restart:cause=hang:attempt=2', 5)).toMatchObject({ at: 5, kind: 'host_restart', level: 'warn', detail: 'cause=hang' });
    expect(parseDiagnosticEvent('restart:cause=manual:providers_changed:attempt=1', 5)).toMatchObject({ kind: 'host_restart', detail: 'cause=manual' });
    expect(parseDiagnosticEvent('host:heartbeat stale >10000ms; restarting host', 5)).toMatchObject({ kind: 'heartbeat_stale', level: 'warn' });
    expect(parseDiagnosticEvent('host:host_exit:code=1:signal=null', 5)).toMatchObject({ kind: 'host_exit', detail: 'code=1:signal=null' });
    expect(parseDiagnosticEvent('host:frame_dropped:line_not_json', 5)).toMatchObject({ kind: 'frame_dropped' });
    expect(parseDiagnosticEvent('host:spawn_error:boom', 5)).toMatchObject({ kind: 'spawn_error', level: 'error' });
    expect(parseDiagnosticEvent('host:spawn_failed:boom', 5)).toMatchObject({ kind: 'spawn_error' });
    expect(parseDiagnosticEvent('host:set_idle_retire_failed:10:timeout', 5)).toMatchObject({ kind: 'policy_sync_failed', level: 'warn', detail: '10:timeout' });
  });

  test('去重与忽略面', () => {
    // host.restart() 的 manual 前置注记与 restart() 的 cause= 注记是同一事件的
    // 两条日志——canonical 是后者，前置注记不入环（否则手动重启时间线双条）
    expect(parseDiagnosticEvent('host:restart:manual:providers_changed', 5)).toBeNull();
    expect(parseDiagnosticEvent('host_phase:ready', 5)).toBeNull();
    expect(parseDiagnosticEvent('随便什么', 5)).toBeNull();
  });
});
