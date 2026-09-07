// 测试替身 host（bun 运行）。协议子集：
// 心跳 50ms 一帧；thread/start 回 {threadId:"fake-N"}；其余命令回显类型；
// 命令 "die" 停止心跳模拟挂死；"hang-forever" 停心跳且挂起不应答；stdin EOF 退出 0。

export {};

let buf = '';
let heartbeatTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
  process.stdout.write('{"type":"heartbeat"}\n');
}, 50);
let nextId = 1;

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buf += chunk;
  for (;;) {
    const index = buf.indexOf('\n');
    if (index === -1) break;
    const line = buf.slice(0, index);
    buf = buf.slice(index + 1);
    if (line.length === 0) continue;
    handle(line);
  }
});
process.stdin.on('end', () => {
  stopHeartbeat();
  process.exit(0);
});

function handle(line: string): void {
  let cmd: Record<string, unknown>;
  try {
    cmd = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return;
  }
  const rawType = cmd['type'];
  const type = typeof rawType === 'string' ? rawType : '';
  const id = cmd['id'];
  if (type === 'die') {
    stopHeartbeat();
    reply(id, { ok: true });
    return;
  }
  if (type === 'hang-forever') {
    stopHeartbeat();
    return;
  }
  if (type === 'thread/start') {
    reply(id, { threadId: `fake-${nextId++}`, cwd: '/w', sessionPath: `/sessions/fake-${nextId}.jsonl` });
    return;
  }
  reply(id, { echo: type });
}

function reply(id: unknown, data: unknown): void {
  process.stdout.write(`${JSON.stringify({ type: 'response', id, command: 'x', success: true, data })}\n`);
}
