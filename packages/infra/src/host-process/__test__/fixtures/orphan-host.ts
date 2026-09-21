// 红测替身：孤儿 host。启动后把自身 pid 写入 ORPHAN_PID_FILE 指向的文件，
// 然后常驻（stdin resume + 定时器），模拟真实 hub（spawn 后长期运行）。
import { writeFileSync } from 'node:fs';

const target = process.env['ORPHAN_PID_FILE'];
if (target !== undefined && target.length > 0) {
  writeFileSync(target, String(process.pid));
}
process.stdin.resume();
setInterval(() => undefined, 1_000);
export const fixtureHost = true;
