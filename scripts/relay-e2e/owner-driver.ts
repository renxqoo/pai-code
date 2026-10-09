/**
 * 桌面 owner 面驱动（journey 装置用）：连 gateway owner unix socket，
 * 发 gw/* 命令并等对应 id 的 response——与 Electron 侧 gateway-process 同协议面。
 */
import { connect } from 'node:net';

export interface OwnerResponse {
  id: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface OwnerDriver {
  send(command: string, args: Record<string, unknown>): Promise<OwnerResponse>;
  close(): void;
}

export async function connectOwner(socketPath: string): Promise<OwnerDriver> {
  const socket = connect({ path: socketPath });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const inbox: OwnerResponse[] = [];
  const waiters: Array<{ id: string; resolve: (value: OwnerResponse) => void }> = [];
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.trim().length === 0) continue;
      const frame = JSON.parse(line) as { kind?: string; body?: OwnerResponse };
      if (frame.kind !== 'response' || frame.body === undefined) continue;
      const index = waiters.findIndex((waiter) => waiter.id === frame.body?.id);
      if (index >= 0) {
        const [waiter] = waiters.splice(index, 1);
        waiter?.resolve(frame.body);
        continue;
      }
      inbox.push(frame.body);
    }
  });
  let seq = 1;
  return {
    send(command, args) {
      const id = `own-${seq++}`;
      return new Promise<OwnerResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`owner response timeout: ${command}`));
        }, 15_000);
        waiters.push({
          id,
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
        });
        socket.write(`${JSON.stringify({ kind: 'command', streamId: 'owner', seq: seq, body: { command, id, args } })}\n`);
      });
    },
    close() {
      socket.destroy();
    },
  };
}