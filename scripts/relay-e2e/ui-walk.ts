/**
 * 移动端浏览器 UI 走查（headless Chrome + CDP 驱动真 expo web 产物）。
 *
 * 为什么需要它：relay-e2e/journey 驱动的是无头业务链路（runtime/client/store），
 * 全程不挂载任何 React 组件——抽屉、面板、授权卡、用量页这些渲染面从未被验证。
 * 本装置用真实浏览器打开 web 产物，断言实际渲染文本与交互结果。
 *
 * 前置：apps/mobile 已 build:web，且本脚本会自行起 web 静态服务与 PC 侧栈。
 * 用法：bun scripts/relay-e2e/ui-walk.ts [--full]
 *   默认：22 项无后端屏（不连网关，纯渲染与交互）
 *   --full：额外跑真配对 + 有数据屏（需内置 relay 形态）
 */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { connectOwner } from './owner-driver.ts';
import { startPcStack, sleep, type PcStack } from './stack.ts';

const MOBILE_ROOT = new URL('../../apps/mobile', import.meta.url).pathname;
const DIST = join(MOBILE_ROOT, 'dist');
const FULL = process.argv.includes('--full');
const WEB_PORT = 4599;
const CDP_PORT = 9336;

/** 首个非内部 IPv4（与 x-harness relay-bind 的 lanAddresses 同源）——网关 advertise 的就是它。 */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      return item.address;
    }
  }
  return '127.0.0.1';
}

function serveWeb(): () => Promise<void> {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };
  const typeOf = (path: string): string => {
    const dot = path.lastIndexOf('.');
    return dot === -1 ? 'application/octet-stream' : (types[path.slice(dot)] ?? 'application/octet-stream');
  };
  const server = Bun.serve({
    port: WEB_PORT,
    hostname: '0.0.0.0',
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = Bun.file(`${DIST}${path}`);
      const exists = await file.exists();
      const served = exists ? path : '/index.html';
      if (served.endsWith('.html')) {
        let html = await (exists ? file : Bun.file(`${DIST}/index.html`)).text();
        return new Response(html, { headers: { 'content-type': types['.html'] ?? 'text/html' } });
      }
      return new Response(exists ? file : Bun.file(`${DIST}/index.html`), { headers: { 'content-type': typeOf(served) } });
    },
  });
  return async () => {
    await server.stop();
  };
}

let socket: WebSocket | null = null;
let seq = 0;
const pending = new Map<number, (value: unknown) => void>();
const pageErrors: string[] = [];

function send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  seq += 1;
  const id = seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    socket?.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression: string): Promise<unknown> {
  const res = (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })) as { result?: { value?: unknown } };
  return res?.result?.value;
}

async function openBrowser(origin: string): Promise<{ stop(): void }> {
  const chrome =
    process.env['X3CODE_CHROME'] ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const profile = await mkdtemp(join(tmpdir(), 'pai-ui-walk-'));
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=430,932',
      origin,
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl.length > 0);
      if (page !== undefined) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error('cdp ws failed'));
        });
        socket = ws;
        socket.onmessage = (event) => {
          const msg = JSON.parse(String(event.data)) as {
            id?: number;
            result?: unknown;
            error?: unknown;
            method?: string;
            params?: { exceptionDetails?: { exception?: { description?: string } } };
          };
          if (msg.id !== undefined) {
            pending.get(msg.id)?.(msg.result ?? msg.error);
            return;
          }
          if (msg.method === 'Runtime.exceptionThrown') {
            pageErrors.push(String(msg.params?.exceptionDetails?.exception?.description ?? '').slice(0, 160));
          }
        };
        await send('Runtime.enable');
        await send('Page.enable');
        return { stop: () => proc.kill() };
      }
    } catch {
      /* 等待 devtools 就绪 */
    }
    await sleep(250);
  }
  proc.kill();
  throw new Error('chrome devtools not reachable');
}

async function goto(origin: string, path: string): Promise<void> {
  await send('Page.navigate', { url: `${origin}${path}` });
  await sleep(3000);
}

const visibleText = (): Promise<string> =>
  evaluate(`(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (w.nextNode()) { const t = w.currentNode.textContent.trim(); if (t) parts.push(t); }
    return [...new Set(parts)].join(' | ');
  })()`) as Promise<string>;

async function setField(selector: string, value: string): Promise<boolean> {
  return (await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)) as boolean;
}

async function clickText(label: string): Promise<boolean> {
  return (await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
    if (!b) return false; b.click(); return true;
  })()`)) as boolean;
}

async function clickLabel(label: string): Promise<boolean> {
  return (await evaluate(`(() => {
    const b = document.querySelector('button[aria-label="' + ${JSON.stringify(label)} + '"]');
    if (!b) return false; b.click(); return true;
  })()`)) as boolean;
}

async function waitForAsync<T>(label: string, probe: () => Promise<T | null | undefined | false>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = await probe();
    if (hit !== null && hit !== undefined && (hit as unknown) !== false) return hit;
    if (Date.now() > deadline) throw new Error(`wait timeout: ${label}`);
    await sleep(300);
  }
}

let pass = 0;
let fail = 0;
async function step(name: string, fn: () => Promise<string | null>): Promise<void> {
  pageErrors.length = 0;
  try {
    const note = await fn();
    if (pageErrors.length > 0) throw new Error(`未捕获异常：${pageErrors.slice(0, 2).join(' || ')}`);
    pass += 1;
    console.log(`PASS ${name}${note === null ? '' : ` — ${note}`}`);
  } catch (error) {
    fail += 1;
    console.log(`FAIL ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('apps/mobile/dist 不存在——先在 apps/mobile 跑 bun run build:web');
  process.exit(1);
}

const lan = lanAddress();
const origin = `http://${lan}:${WEB_PORT}`;
const stopWeb = serveWeb();
// 发现端点按 window.location.hostname 探测（web 预览与网关同机）——必须走 LAN 地址，
// 否则会打到本机 loopback 上另一个 relay 上（同端口绑 127.0.0.1 更specific）。
const browser = await openBrowser(origin);
let stack: PcStack | null = null;

try {
  await goto(origin, '/');

  await step('首屏：空态 + 输入区 + 演示入口', async () => {
    const t = await visibleText();
    const missing = ['今天想完成什么？', '选择工作空间'].filter((n) => !t.includes(n));
    if (missing.length > 0) throw new Error(`缺文案 ${missing.join(',')}`);
    const placeholder = (await evaluate("document.querySelector('textarea')?.getAttribute('placeholder') ?? ''")) as string;
    if (placeholder !== '尽管问，带图也行') throw new Error(`placeholder 异常: ${placeholder}`);
    return `空态 + placeholder「${placeholder}」`;
  });

  await step('演示 chip 填入输入区并解禁发送', async () => {
    if (!(await clickText('分析当前项目'))) throw new Error('找不到演示 chip');
    await sleep(600);
    const value = (await evaluate("document.querySelector('textarea')?.value ?? ''")) as string;
    if (value.length === 0) throw new Error('点击后输入区仍为空');
    const disabled = (await evaluate("document.querySelector('button[aria-label=\"发送消息\"]')?.disabled === true")) as boolean;
    if (disabled) throw new Error('发送按钮仍禁用');
    return `输入区 ${value.length} 字`;
  });

  await step('对话历史抽屉打开并含导航项', async () => {
    if (!(await clickLabel('打开对话历史'))) throw new Error('找不到抽屉按钮');
    await sleep(900);
    const t = await visibleText();
    const missing = ['新建对话', '连接电脑', '资产', '归档对话', '个人设置'].filter((n) => !t.includes(n));
    if (missing.length > 0) throw new Error(`抽屉缺 ${missing.join(',')}`);
    return '导航项齐全';
  });

  await step('抽屉搜索框可输入', async () => {
    if (!(await setField('input[aria-label="搜索对话"]', '测试'))) throw new Error('搜索框不在');
    await sleep(400);
    const value = (await evaluate("(document.querySelector('input[aria-label=\"搜索对话\"]') ?? {}).value ?? ''")) as string;
    if (value !== '测试') throw new Error(`输入无效: ${value}`);
    return '输入生效';
  });

  await step('抽屉关闭', async () => {
    await evaluate(`(() => { const b = document.querySelector('button[aria-label="关闭"]'); if (b) b.click(); })()`);
    await sleep(700);
    if ((await evaluate("!!document.querySelector('[aria-label=\"对话历史\"]')")) === true) throw new Error('抽屉未关闭');
    return '已关闭';
  });

  await step('任务配置面板打开', async () => {
    if (!(await clickLabel('任务配置'))) throw new Error('找不到任务配置按钮');
    await sleep(900);
    const t = await visibleText();
    const keys = ['权限', '模型', '思考', '模式'].filter((n) => t.includes(n));
    if (keys.length === 0) throw new Error('面板无配置项文案');
    return `可见 ${keys.join('/')}`;
  });

  await step('面板关闭后回到聊天', async () => {
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === '关闭'); if (b) b.click(); })()`);
    await sleep(600);
    if (!(await visibleText()).includes('今天想完成什么？')) throw new Error('未回到首屏');
    return '已回到首屏';
  });

  const routes = ['/devices', '/projects', '/files', '/usage', '/archived', '/settings', '/appearance', '/preferences', '/models', '/profile', '/help', '/about', '/privacy', '/search'];
  for (const route of routes) {
    await step(`路由 ${route} 渲染`, async () => {
      await goto(origin, route);
      const t = await visibleText();
      if (t.trim().length === 0) throw new Error('空白页');
      return t.slice(0, 70);
    });
  }

  await step('配对屏：输码表单出现且无效码不崩溃', async () => {
    await goto(origin, '/devices');
    await clickText('连接');
    await sleep(900);
    if (!(await setField('input[aria-label="配对码"]', '000000'))) throw new Error('未出现配对码输入框');
    await sleep(400);
    await clickText('输入 6 位码配对');
    await sleep(2500);
    if (/Application Error|无法加载/i.test(await visibleText())) throw new Error('输码后崩溃');
    return '无崩溃';
  });

  if (FULL) {
    stack = await startPcStack({ embedded: true });
    const owner = await connectOwner(stack.ownerSocketPath);
    await step('内置 relay 起好且网关已连上', () => Promise.resolve(stack?.relayMode === 'embedded' ? `发现端点 ${stack.relayOrigin}` : null));

    await goto(origin, '/devices');
    const started = await owner.send('gw/pairing/start', { scope: 'interact', mode: 'manual' });
    const data = started.data as { manualCode?: string; pairingId?: string } | undefined;
    if (data?.manualCode === undefined || data.pairingId === undefined) throw new Error(`owner 未拿到配对码: ${JSON.stringify(started)}`);
    const { manualCode, pairingId } = data;

    await step('诊断：浏览器直连发现端点', async () => {
      const port = new URL(stack?.relayOrigin ?? 'http://127.0.0.1').port;
      const probe = (await evaluate(`(async () => {
        const hosts = [${JSON.stringify(lan)}, '127.0.0.1'];
        const out = [];
        for (const h of hosts) {
          try {
            const r = await fetch('http://' + h + ':${port}/api/discover?code=' + ${JSON.stringify(manualCode)});
            out.push(h + '=' + r.status + ':' + (await r.text()).slice(0, 60));
          } catch (e) { out.push(h + '=ERR:' + String(e).slice(0, 60)); }
        }
        return out.join(' || ');
      })()`)) as string;
      return probe;
    });

    await step('浏览器输入 6 位码并发起配对', async () => {
      await clickText('连接');
      await sleep(700);
      if (!(await setField('input[aria-label="配对码"]', manualCode))) throw new Error('未找到配对码输入框');
      await sleep(400);
      if (!(await clickText('输入 6 位码配对'))) throw new Error('未找到配对按钮');
      await sleep(1500);
      return `已提交配对码 ${manualCode}`;
    });

    const sasOf = async (): Promise<string | null> => {
      const hit = (await evaluate(`(() => {
        const raw = document.body.innerText.replace(/\\s+/g, ' ');
        const anchor = raw.indexOf('比对桌面端数字');
        if (anchor < 0) return null;
        const m = /(\\d)\\s*(\\d)\\s*(\\d)\\s*(\\d)\\s*(\\d)\\s*(\\d)/.exec(raw.slice(anchor));
        return m === null ? null : m[0].replace(/\\s+/g, '');
      })()`)) as string | null;
      return hit?.length === 6 ? hit : null;
    };

    await step('设备侧展示 SAS', async () => {
      try {
        return `SAS=${await waitForAsync('SAS 上屏', sasOf, 40_000)}`;
      } catch {
        throw new Error(`40s 未见 SAS。页面文本：${(await visibleText()).slice(0, 300)}`);
      }
    });

    await step('owner 侧凭 SAS 完成确认', async () => {
      const sas = await sasOf();
      if (sas === null) throw new Error('未取到 SAS');
      const confirmed = await owner.send('gw/pairing/confirm', { pairingId, ownerTypedSas: sas, deviceLongTermPub: '' });
      if (confirmed.success !== true) throw new Error(`确认失败: ${JSON.stringify(confirmed)}`);
      return '已确认';
    });

    await step('浏览器显示已连接', async () => {
      await waitForAsync('已连接文案', async () => ((await visibleText()).includes('已连接') ? true : null), 45_000);
      if ((await visibleText()).includes('尚未配对')) throw new Error('仍显示尚未配对');
      return '状态文案显示已连接';
    });

    await step('会话列表无「未命名对话」兜底标题', async () => {
      await goto(origin, '/');
      await sleep(2500);
      await clickLabel('打开对话历史');
      await sleep(1500);
      if ((await visibleText()).includes('未命名对话')) throw new Error('列表仍是默认标题');
      return '抽屉已开';
    });

    await step('输入并发送一条消息', async () => {
      await evaluate(`(() => { const b = document.querySelector('button[aria-label="关闭"]'); if (b) b.click(); })()`);
      await sleep(600);
      await setField('textarea[aria-label="消息输入框"]', '浏览器走查：打个招呼');
      await sleep(500);
      if (!(await clickText('发送'))) await evaluate(`(() => { const b = document.querySelector('button[aria-label="发送消息"]'); if (b) b.click(); })()`);
      await sleep(6000);
      if (!(await visibleText()).includes('浏览器走查')) throw new Error('用户消息未上屏');
      return '用户消息已上屏';
    });

    await step('助手回复上屏（流式 → 终态）', async () => {
      try {
        await waitForAsync('助手回复', async () => ((await visibleText()).includes('hello from scripted llm') ? true : null), 45_000);
        return '脚本 worker 回复已渲染';
      } catch {
        throw new Error(`45s 无回复。页面文本：${(await visibleText()).slice(0, 300)}`);
      }
    });

    owner.close();
  }
} finally {
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  socket?.close();
  browser.stop();
  await stopWeb();
  if (stack !== null) {
    await stack.gatewayShutdown();
    await stack.relayShutdown();
  }
  process.exit(fail === 0 ? 0 : 1);
}