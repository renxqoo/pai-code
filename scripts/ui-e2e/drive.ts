/**
 * UI 端到端驾驶（scripts/ui-e2e 专用）：种子隔离 userData（settings/registry/会话文件）
 * → 启动真 Electron（构建产物 + CDP 9333）+ 假 hub → CDP 驱动真实 UI 完成四场景
 * （打开会话/流式思考与工具/流式中排队/结算消费/刷新衔接）并分阶段截图到 shot/。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dir, '..', '..');
const USER_DATA = resolve(import.meta.dir, '.userdata');
const SHOT_DIR = resolve(import.meta.dir, 'shot');
const CDP_PORT = 9333;

function prepareUserData(): void {
  rmSync(USER_DATA, { recursive: true, force: true });
  // 会话根 = agentDir/sessions（HUB_AGENT_DIR 布局，与 pai-runtime sessionsRoot 同构）；
  // s1/s2 双会话——弹窗隔离验收需要跨会话切换
  for (const id of ['s1', 's2']) {
    mkdirSync(join(USER_DATA, 'agent', 'sessions', id), { recursive: true });
    writeFileSync(join(USER_DATA, 'agent', 'sessions', id, 'events.jsonl'), '');
  }
  writeFileSync(
    join(USER_DATA, 'settings.json'),
    `${JSON.stringify(
      {
        hubDev: { bunPath: null, hubEntry: null },
        providers: [{ name: 'fake', baseUrl: 'http://127.0.0.1:9', api: 'openai', models: [{ id: 'fake-1', reasoning: true, vision: false }] }],
        trustedDefault: true,
        defaultModel: 'fake/fake-1',
        onboarded: true,
        projectModels: {},
        pinnedSessions: [],
        archivedSessions: [],
        hiddenProjects: [],
        idleRecycleMinutes: 5,
      },
      null,
      2,
    )}\n`,
  );
  const db = new DatabaseSync(join(USER_DATA, 'registry.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      threadId TEXT PRIMARY KEY, sessionPath TEXT, cwd TEXT NOT NULL, title TEXT NOT NULL,
      trusted INTEGER, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
      keepalive INTEGER NOT NULL DEFAULT 0)`);
  const insert = db.prepare('INSERT INTO sessions (threadId, sessionPath, cwd, title, trusted, createdAt, updatedAt, keepalive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run('s1', join(USER_DATA, 'agent', 'sessions', 's1', 'events.jsonl'), '/tmp/ui-e2e-ws', 'E2E 会话 s1', 1, Date.now(), Date.now(), 0);
  insert.run('s2', join(USER_DATA, 'agent', 'sessions', 's2', 'events.jsonl'), '/tmp/ui-e2e-ws', 'E2E 会话 s2', 1, Date.now(), Date.now(), 0);
  db.close();
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveStep) => {
    setTimeout(resolveStep, ms);
  });

/** 极简 CDP 客户端（Bun 全局 WebSocket）。 */
class Cdp {
  private ws: WebSocket;
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (message.id === undefined) return;
      const entry = this.pending.get(message.id);
      if (entry === undefined) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      ws.addEventListener('open', () => resolveOpen());
      ws.addEventListener('error', () => rejectOpen(new Error('cdp ws failed')));
    });
    return new Cdp(ws);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<never> {
    this.seq += 1;
    const id = this.seq;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall as (value: unknown) => void, reject: rejectCall });
      this.ws.send(payload);
    }) as Promise<never>;
  }

  async eval<T>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as {
      result: { value?: T; exceptionDetails?: { text: string; exception?: { description?: string } } };
    };
    if (result.result.exceptionDetails !== undefined) {
      throw new Error(`eval failed: ${result.result.exceptionDetails.exception?.description ?? result.result.exceptionDetails.text}\n${expression.slice(0, 200)}`);
    }
    return result.result.value as T;
  }

  async screenshot(path: string): Promise<void> {
    const result = (await this.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await Bun.write(path, Buffer.from(result.data, 'base64'));
    console.log(`[shot] ${path}`);
  }
}

async function findPageTarget(): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const list = (await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((response) => response.json())) as Array<{ type: string; webSocketDebuggerUrl: string; url: string }>;
      const page = list.find((entry) => entry.type === 'page' && entry.url.includes('renderer'));
      if (page !== undefined) return page.webSocketDebuggerUrl;
    } catch {
      // electron 未就绪：重试
    }
    await sleep(500);
  }
  throw new Error('CDP page target not found');
}

/** 轮询直到表达式真值（超时抛错）。 */
async function waitFor(cdp: Cdp, expression: string, timeoutMs: number, label: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await cdp.eval<boolean>(expression)) return;
    if (Date.now() - started > timeoutMs) throw new Error(`waitFor timeout: ${label}`);
    await sleep(250);
  }
}

/** 断言（失败抛错终止驾驶——截图判读之外的可裁决事实）。 */
async function assertEval(cdp: Cdp, expression: string, label: string): Promise<void> {
  if (!(await cdp.eval<boolean>(expression))) throw new Error(`assert failed: ${label}`);
  console.log(`[assert ✓] ${label}`);
}

/** innerText 计数（可见渲染面）。 */
const COUNT_JS = `(needle) => Math.max(document.body.innerText.split(needle).length - 1, 0)`;

/** React 受控 textarea 注入（native setter + input 事件）。目标 = 可见的最后一个
 * textarea（composer 恒在 DOM 尾部；侧栏搜索等其它 textarea 排除）。 */
const TYPE_JS = `(text) => {
  const areas = [...document.querySelectorAll('textarea')].filter((el) => el.offsetParent !== null);
  const ta = areas.at(-1);
  if (ta === undefined) return false;
  ta.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, text);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return ta.value === text;
}`;

const CLICK_TEXT_JS = `(needle) => {
  const candidates = [...document.querySelectorAll('button, [role="button"], a, div, li, section')];
  const hit = candidates.find((el) => el.textContent !== null && el.textContent.includes(needle));
  if (hit === undefined) return false;
  hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}`;

const SEND_JS = `(() => {
  const areas = [...document.querySelectorAll('textarea')].filter((el) => el.offsetParent !== null);
  const ta = areas.at(-1);
  if (ta === undefined) return false;
  ta.focus();
  // 只走 Enter→form requestSubmit 一条提交路径：再补按钮点击会双触发（两条 prompt
  // 落进流式窗口被 hub 排队，污染「无重复消息」验收）
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  return true;
})()`;

async function main(): Promise<void> {
  prepareUserData();
  rmSync(SHOT_DIR, { recursive: true, force: true });
  mkdirSync(SHOT_DIR, { recursive: true });

  const electron = Bun.spawn(
    [join(ROOT, 'apps', 'electron', 'node_modules', '.bin', 'electron'), join(ROOT, 'apps', 'electron', 'out', 'main', 'index.js'), `--remote-debugging-port=${CDP_PORT}`],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PAI_USER_DATA_DIR: USER_DATA,
        PAI_BUN_PATH: process.execPath,
        PAI_HUB_ENTRY: resolve(import.meta.dir, 'fake-hub.ts'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  console.log(`[app] electron pid=${electron.pid}`);

  try {
    const cdp = await Cdp.connect(await findPageTarget());
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // 1) 启动完成：History 侧栏出现预置会话
    await waitFor(cdp, `document.body.innerText.includes('E2E 会话 s1')`, 30_000, 'history item');
    await cdp.screenshot(join(SHOT_DIR, '01-history.png'));

    // 2) 打开会话（History 行点击；空会话 → 空舞台）
    if (!(await cdp.eval<boolean>(`(${CLICK_TEXT_JS})('E2E 会话 s1')`))) throw new Error('history row click failed');
    await waitFor(cdp, `document.querySelector('textarea') !== null`, 10_000, 'composer ready');
    await sleep(1500);
    await cdp.screenshot(join(SHOT_DIR, '02-opened-empty.png'));

    // 3) 首条消息 → 流式（思考 + 正文 + 工具）
    const areaInfo = await cdp.eval<string[]>(`[...document.querySelectorAll('textarea')].map((el) => el.placeholder.slice(0, 20))`);
    console.log('[ui] textareas:', JSON.stringify(areaInfo));
    if (!(await cdp.eval<boolean>(`(${TYPE_JS})('分析一下这个项目的渲染管线')`))) throw new Error('type failed');
    await sleep(300);
    if (!(await cdp.eval<boolean>(SEND_JS))) throw new Error('enter failed');
    await sleep(1_200);
    const diag = await cdp.eval<Record<string, unknown>>(`(() => {
      const areas = [...document.querySelectorAll('textarea')].filter((el) => el.offsetParent !== null);
      const buttons = [...document.querySelectorAll('button')].map((el) => el.getAttribute('aria-label')).filter(Boolean).slice(0, 14);
      return { value: areas.at(-1)?.value ?? null, buttons, notice: document.body.innerText.slice(0, 400) };
    })()`);
    console.log('[diag]', JSON.stringify(diag, null, 1).slice(0, 900));
    await waitFor(cdp, `document.body.innerText.includes('先检查渲染管线') || document.body.innerText.includes('渲染管线')`, 20_000, 'thinking streamed');
    await cdp.screenshot(join(SHOT_DIR, '03-streaming.png'));

    // 4) 流式中排队第二条：思考文本刚出现即发送（必在流式窗口内）→ hub 入队 →
    //    agent/inbox/spliced → queueChanged → 卡片镜像。断言取强形态：发送后
    //    composer 清空，正文仍含该文本即卡片本体（非输入框残留）
    if (!(await cdp.eval<boolean>(`(${TYPE_JS})('顺便确认排队消息的显示')`))) throw new Error('type queued failed');
    await sleep(150);
    if (!(await cdp.eval<boolean>(SEND_JS))) throw new Error('enter queued failed');
    await waitFor(
      cdp,
      `document.body.innerText.includes('顺便确认排队消息的显示') && (([...document.querySelectorAll('textarea')].filter((el) => el.offsetParent !== null).at(-1) ?? { value: 'x' }).value ?? 'x') === ''`,
      10_000,
      'queue card mirrored',
    );
    // 排队卡片本体：GripVertical 手柄 + 文本 span（灰底横条，截断样式下 innerText 仍全文）
    await assertEval(
      cdp,
      `!!document.querySelector('svg.lucide-grip-vertical') && [...document.querySelectorAll('svg.lucide-grip-vertical')].some((icon) => (icon.parentElement?.querySelector('span')?.textContent ?? '') === '顺便确认排队消息的显示')`,
      'queue card rendered with grip handle',
    );
    await cdp.screenshot(join(SHOT_DIR, '04-queued.png'));

    // 5) 结算 + 队列消费（第二轮回显 + 结论 2 号）
    await waitFor(cdp, `document.body.innerText.includes('2 号')`, 40_000, 'second turn drained');
    await sleep(800);
    // 收起态断言：两轮恰好各一次（用户气泡 + 助手 echo=2）；无第三轮；无排队横幅。
    // 思考/工具块收起时不挂 DOM（visibleTurnBlocks 按折叠态过滤——高性能渲染形态），
    // 其数据面在展开断言中验证
    const settled = await cdp.eval<Record<string, number>>(`({
      first: ((${COUNT_JS})('分析一下这个项目的渲染管线')),
      second: ((${COUNT_JS})('顺便确认排队消息的显示')),
      t1: ((${COUNT_JS})('本轮结论 1 号')),
      t2: ((${COUNT_JS})('本轮结论 2 号')),
      t3: ((${COUNT_JS})('本轮结论 3 号')),
      queueBanner: ((${COUNT_JS})('条排队消息')),
    })`);
    console.log('[settled-collapsed]', JSON.stringify(settled));
    if (settled['first'] !== 2 || settled['second'] !== 2 || settled['t1'] !== 1 || settled['t2'] !== 1 || settled['t3'] !== 0 || settled['queueBanner'] !== 0) {
      throw new Error(`settled assertions failed: ${JSON.stringify(settled)}`);
    }
    console.log('[assert ✓] two turns exact, no third turn, no queue banner');
    // 展开两轮折叠：思考文本 + 工具行挂载（收起态按 visibleTurnBlocks 过滤不挂 DOM）；
    // 工具输出详情再点开工具行（ToolCallDetail 仅展开时挂载——长输出不常驻 DOM）
    await cdp.eval<boolean>(`[...document.querySelectorAll('button[aria-expanded="false"]')].filter((el) => (el.textContent ?? '').includes('共工作')).forEach((el) => el.click())`);
    await waitFor(
      cdp,
      `document.body.textContent.includes('ls -la') && document.body.textContent.includes('我先检查渲染管线')`,
      10_000,
      'expanded thinking + tool rows',
    );
    console.log('[assert ✓] expanded turns mount thinking + bash tool rows');
    await cdp.eval<boolean>(`[...document.querySelectorAll('button[aria-expanded="false"]')].filter((el) => (el.textContent ?? '').includes('ls -la')).forEach((el) => el.click())`);
    await waitFor(cdp, `document.body.textContent.includes('total 8')`, 10_000, 'tool output detail');
    console.log('[assert ✓] tool output merged into tool row detail');
    await cdp.screenshot(join(SHOT_DIR, '05-settled-drained.png'));

    // 6) 刷新衔接（重载 → converge 恢复转写与队列镜像）；若未自动选中则点回会话
    await cdp.send('Page.reload');
    await sleep(3_000);
    if (!(await cdp.eval<boolean>(`document.body.innerText.includes('1 号')`))) {
      await cdp.eval<boolean>(`(${CLICK_TEXT_JS})('E2E 会话 s1')`);
    }
    await waitFor(cdp, `document.body.innerText.includes('1 号') && document.body.innerText.includes('2 号')`, 30_000, 'reloaded transcript');
    await sleep(1200);
    // 刷新衔接断言：与刷新前同一组事实（两轮完整、无重复、无第三轮、无排队复活），
    // 展开后思考与工具行经 WAL rebuild 恢复
    const reloaded = await cdp.eval<Record<string, number>>(`({
      first: ((${COUNT_JS})('分析一下这个项目的渲染管线')),
      second: ((${COUNT_JS})('顺便确认排队消息的显示')),
      t1: ((${COUNT_JS})('本轮结论 1 号')),
      t2: ((${COUNT_JS})('本轮结论 2 号')),
      t3: ((${COUNT_JS})('本轮结论 3 号')),
      queueBanner: ((${COUNT_JS})('条排队消息')),
    })`);
    console.log('[reloaded]', JSON.stringify(reloaded));
    if (reloaded['first'] !== 2 || reloaded['second'] !== 2 || reloaded['t1'] !== 1 || reloaded['t2'] !== 1 || reloaded['t3'] !== 0 || reloaded['queueBanner'] !== 0) {
      throw new Error(`reload assertions failed: ${JSON.stringify(reloaded)}`);
    }
    console.log('[assert ✓] reload converges same transcript, no dupes, no queue resurrection');
    await cdp.eval<boolean>(`[...document.querySelectorAll('button[aria-expanded="false"]')].filter((el) => (el.textContent ?? '').includes('共工作')).forEach((el) => el.click())`);
    await waitFor(
      cdp,
      `document.body.textContent.includes('ls -la') && document.body.textContent.includes('我先检查渲染管线')`,
      10_000,
      'reloaded expanded thinking + tool rows',
    );
    await cdp.eval<boolean>(`[...document.querySelectorAll('button[aria-expanded="false"]')].filter((el) => (el.textContent ?? '').includes('ls -la')).forEach((el) => el.click())`);
    await waitFor(cdp, `document.body.textContent.includes('total 8')`, 10_000, 'reloaded tool output detail');
    console.log('[assert ✓] reloaded turns rebuild thinking + tool rows + output from WAL');
    await cdp.screenshot(join(SHOT_DIR, '06-after-reload.png'));

    // 7) 弹窗跨会话隔离：s1 触发 confirm 弹窗 → 切 s2 弹窗不得在场 → 切回 s1 恢复
    //    → 拒绝应答回传 hub。侧栏行点击按行级前缀匹配（容器文本含全部行，会误中）
    const CLICK_ROW_JS = `(needle) => {
      // 最内层含标题的元素（无子元素再含标题）：命中标题 span/行本身，冒泡到行处理器
      const candidates = [...document.querySelectorAll('button, li, div, a, span')]
        .filter((el) => {
          const text = el.textContent ?? '';
          return text.includes(needle) && [...el.children].every((child) => !(child.textContent ?? '').includes(needle));
        });
      const hit = candidates.at(0);
      if (hit === undefined) return 'no-candidate';
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return \`clicked:<\${hit.tagName}>\`;
    }`;
    if (!(await cdp.eval<boolean>(`(${TYPE_JS})('请求确认的删除操作')`))) throw new Error('type dialog probe failed');
    await sleep(150);
    if (!(await cdp.eval<boolean>(SEND_JS))) throw new Error('enter dialog probe failed');
    await waitFor(cdp, `document.body.innerText.includes('需要确认') && document.body.innerText.includes('rm -rf /tmp/ui-e2e-probe')`, 20_000, 'confirm bar visible in s1');
    // 内联条形态：无全局模态遮罩；确认条在输入卡内（textarea 的前邻区域）
    await assertEval(cdp, `[...document.querySelectorAll('.fixed.inset-0')].length === 0`, 'no global modal overlay');
    await cdp.screenshot(join(SHOT_DIR, '07-confirm-bar-in-s1.png'));
    const clickS2 = await cdp.eval<string>(`(${CLICK_ROW_JS})('E2E 会话 s2')`);
    if (typeof clickS2 !== 'string' || !clickS2.startsWith('clicked:')) throw new Error(`click s2 row failed: ${String(clickS2)}`);
    console.log(`[s2] ${clickS2}`);
    await sleep(1_200);
    const switchDiag = await cdp.eval<string>(`JSON.stringify({
      hasConfirm: document.body.innerText.includes('需要确认'),
      overlays: [...document.querySelectorAll('.fixed.inset-0')].length,
      turns: document.querySelectorAll('[data-turn-id]').length,
      stage: (() => { const el = document.querySelector('main, [class*=stage], section'); return el === null ? null : (el.textContent ?? '').slice(0, 100); })(),
      head: document.body.innerText.slice(0, 300),
    })`);
    console.log('[switch-diag]', switchDiag);
    await cdp.screenshot(join(SHOT_DIR, '08-dialog-hidden-in-s2.png'));
    await sleep(600);
    // 核心断言：s2 界面无 s1 的确认条（随输入卡走，切会话自然不在场）
    await assertEval(cdp, `!document.body.innerText.includes('需要确认') && !document.body.innerText.includes('rm -rf /tmp/ui-e2e-probe')`, 's2 view free of s1 confirm bar');
    await cdp.screenshot(join(SHOT_DIR, '08-confirm-hidden-in-s2.png'));
    const clickS1 = await cdp.eval<string>(`(${CLICK_ROW_JS})('E2E 会话 s1')`);
    if (typeof clickS1 !== 'string' || !clickS1.startsWith('clicked:')) throw new Error(`click s1 row failed: ${String(clickS1)}`);
    console.log(`[s1] ${clickS1}`);
    await waitFor(cdp, `document.body.innerText.includes('需要确认') && document.body.innerText.includes('rm -rf /tmp/ui-e2e-probe')`, 10_000, 'confirm bar restored in s1');
    console.log('[assert ✓] confirm bar restored when switching back to owning session');
    // 拒绝应答：弹窗消失 + ui_response 回传 hub
    const denyOk = await cdp.eval<boolean>(`(() => {
      const button = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '拒绝');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`);
    if (!denyOk) throw new Error('deny button click failed');
    await waitFor(cdp, `!document.body.innerText.includes('需要确认')`, 10_000, 'confirm bar closed after deny');
    console.log('[assert ✓] deny closes confirm bar');
    // 应答确实回传 hub（ui_response 命令入 trace）
    await waitFor(
      cdp,
      'true',
      3_000,
      'noop', // trace 是文件侧事实，等一拍后由主进程断言
    ).catch(() => undefined);
    const trace = await Bun.file(resolve(import.meta.dir, 'hub-trace.log')).text();
    if (!trace.includes('"type":"ui_response"')) throw new Error('ui_response not delivered to hub');
    console.log('[assert ✓] deny response delivered to hub (ui_response)');
    await cdp.screenshot(join(SHOT_DIR, '09-confirm-answered.png'));

    console.log('[done] all scenarios captured');
  } finally {
    electron.kill();
    await sleep(500);
    try {
      process.kill(-electron.pid, 'SIGKILL');
    } catch {
      // 已退出
    }
  }
}

await main();
