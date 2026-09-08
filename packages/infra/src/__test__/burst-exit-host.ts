// 测试替身 host（bun 运行）：心跳 50ms；命令 "burst" 回 ack 后写大量事件帧并立即异常退出
// （stdout 积压未排空），用于钉住「旧进程残余帧不得晚于 restarting 相位到达」的代际守卫。

export {};

let buf = '';
let heartbeatTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
  process.stdout.write('{"type":"heartbeat"}\n');
}, 50);

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
    let cmd: Record<string, unknown>;
    try {
      cmd = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (cmd['type'] === 'burst') {
      const id = typeof cmd['id'] === 'string' ? cmd['id'] : '';
      stopHeartbeat();
      process.stdout.write(`{"type":"response","id":${JSON.stringify(id)},"success":true}\n`);
      // 大流量事件帧随后立即 exit(1)：父进程侧必然残留未派发的 data 事件
      let bulk = '';
      for (let i = 0; i < 60_000; i += 1) {
        bulk += `{"type":"event","threadId":"t","event":{"type":"agent_start","seq":${i}}}\n`;
      }
      process.stdout.write(bulk);
      process.exit(1);
      return;
    }
  }
});
process.stdin.on('end', () => {
  stopHeartbeat();
  process.exit(0);
});
