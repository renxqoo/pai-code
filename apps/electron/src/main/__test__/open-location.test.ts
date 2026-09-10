import { describe, expect, test } from 'bun:test';

import { createOpenLocation, editorCandidates, isSafeWindowsCwd, type Run, type RunResult } from '../open-location';

const OK: RunResult = { code: 0, kind: null };

/** 记录调用并按 (file, args 首参) 回放结果的 fake 执行器。 */
function makeRun(script: (file: string, args: readonly string[]) => RunResult | 'next-candidate') {
  const calls: string[] = [];
  const run: Run = (file, args) => {
    calls.push(`${file} ${args.join(' ')}`);
    const result = script(file, args);
    return Promise.resolve(result === 'next-candidate' ? { code: 127, kind: null } : result);
  };
  return { run, calls };
}

describe('editorCandidates', () => {
  test('GUI CLI 优先、env 殿后、去重去空；env 带参数只取首个可执行名', () => {
    expect(editorCandidates({})).toEqual(['code', 'cursor']);
    expect(editorCandidates({ VISUAL: 'vim', EDITOR: 'code' })).toEqual(['code', 'cursor', 'vim']);
    expect(editorCandidates({ EDITOR: 'nano' })).toEqual(['code', 'cursor', 'nano']);
    expect(editorCandidates({ VISUAL: 'code -w' })).toEqual(['code', 'cursor']);
  });
});

describe('isSafeWindowsCwd（cmd 链注入面）', () => {
  test.each([
    ['C:\\proj&calc', false],
    ['C:\\a|b', false],
    ['C:\\a^b', false],
    ['C:\\%USERPROFILE%\\x', false],
    ['C:\\a"b', false],
    ['C:\\Users\\my proj', true],
    ['', false],
  ])('%s → %s', (cwd, expected) => {
    expect(isSafeWindowsCwd(cwd)).toBe(expected);
  });
});

describe('Windows 终端链注入防护', () => {
  test('cwd 含 cmd 元字符 → open_failed:unsupported_cwd（不执行任何命令）', async () => {
    const { run, calls } = makeRun(() => OK);
    const location = createOpenLocation({ run, platform: 'win32' });
    expect(await location.open('C:\\proj&calc', 'terminal')).toEqual({ ok: false, reason: 'open_failed:unsupported_cwd' });
    expect(calls).toEqual([]);
  });

  test('编辑器探测负结果不缓存：装好 CLI 后同实例下一次探测即命中', async () => {
    let codeAvailable = false;
    const { run, calls } = makeRun((file, args) => (args[0] === '--version' ? (file === 'code' && codeAvailable ? OK : { code: 127, kind: null }) : OK));
    const location = createOpenLocation({ run, platform: 'darwin', env: {} });
    expect(await location.open('/tmp/p', 'editor')).toEqual({ ok: false, reason: 'editor_not_found' });
    codeAvailable = true;
    expect(await location.open('/tmp/p', 'editor')).toEqual({ ok: true, data: null });
    // 第二次 open 重新探测了 code --version（负缓存不存在）
    expect(calls.filter((call) => call === 'code --version').length).toBeGreaterThanOrEqual(2);
  });
});

describe('createOpenLocation 平台矩阵（fake run）', () => {
  test('darwin finder：open <cwd>', async () => {
    const { run, calls } = makeRun(() => OK);
    const location = createOpenLocation({ run, platform: 'darwin' });
    expect(await location.open('/tmp/p', 'finder')).toEqual({ ok: true, data: null });
    expect(calls).toEqual(['open /tmp/p']);
  });

  test('darwin terminal：open -a Terminal <cwd>', async () => {
    const { run, calls } = makeRun(() => OK);
    const location = createOpenLocation({ run, platform: 'darwin' });
    expect(await location.open('/tmp/p', 'terminal')).toEqual({ ok: true, data: null });
    expect(calls).toEqual(['open -a Terminal /tmp/p']);
  });

  test('win32 finder：explorer；退出码 1（窗口已开）也算成功', async () => {
    const { run, calls } = makeRun(() => ({ code: 1, kind: null }));
    const location = createOpenLocation({ run, platform: 'win32' });
    expect(await location.open('C:\\p', 'finder')).toEqual({ ok: true, data: null });
    expect(calls).toEqual(['explorer C:\\p']);
  });

  test('win32 terminal：wt 失败回落 cmd；双双失败报 open_failed:exit', async () => {
    const { run, calls } = makeRun(() => ({ code: 1, kind: null }));
    const location = createOpenLocation({ run, platform: 'win32' });
    expect(await location.open('C:\\p', 'terminal')).toEqual({ ok: false, reason: 'open_failed:exit' });
    expect(calls).toEqual(['cmd /c start wt -d C:\\p', 'cmd /c start cmd /K cd /d C:\\p']);
  });

  test('linux terminal：逐候选探测，全失败 terminal_not_found', async () => {
    const { run, calls } = makeRun((_file, args) => (args[0] === '--workdir' ? 'next-candidate' : OK));
    const location = createOpenLocation({ run, platform: 'linux' });
    expect(await location.open('/tmp/p', 'terminal')).toEqual({ ok: false, reason: 'terminal_not_found' });
    expect(calls).toEqual([
      'x-terminal-emulator --workdir /tmp/p',
      'gnome-terminal --workdir /tmp/p',
      'konsole --workdir /tmp/p',
    ]);
  });

  test('editor：code --version 探活后打开 cwd；探测结果缓存（第二次不再探）', async () => {
    const { run, calls } = makeRun((_file, args) => (args[0] === '--version' ? OK : { code: 1, kind: null }));
    const location = createOpenLocation({ run, platform: 'darwin', env: {} });
    expect(await location.open('/tmp/p', 'editor')).toEqual({ ok: false, reason: 'open_failed:exit' });
    expect(await location.open('/tmp/q', 'editor')).toEqual({ ok: false, reason: 'open_failed:exit' });
    expect(calls).toEqual(['code --version', 'code /tmp/p', 'code /tmp/q']);
  });

  test('editor：候选全探活失败 → editor_not_found（不静默换 finder）', async () => {
    const { run, calls } = makeRun((_file, args) => (args[0] === '--version' ? { code: 127, kind: null } : OK));
    const location = createOpenLocation({ run, platform: 'darwin', env: { EDITOR: 'my-editor' } });
    expect(await location.open('/tmp/p', 'editor')).toEqual({ ok: false, reason: 'editor_not_found' });
    expect(calls).toEqual(['code --version', 'cursor --version', 'my-editor --version']);
  });

  test('超时/进程级异常映射 open_failed:timeout / open_failed:spawn', async () => {
    let outcome = 0;
    const { run } = makeRun(() => (outcome === 0 ? { code: null, kind: 'timeout' } : { code: null, kind: 'spawn_failed' }));
    const location = createOpenLocation({ run, platform: 'darwin' });
    expect(await location.open('/tmp/p', 'finder')).toEqual({ ok: false, reason: 'open_failed:timeout' });
    outcome = 1;
    expect(await location.open('/tmp/p', 'finder')).toEqual({ ok: false, reason: 'open_failed:spawn' });
  });
});
