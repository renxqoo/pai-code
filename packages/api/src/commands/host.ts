/** host 域命令（宿主观测面：monitor 轮询消费；errorCodes 码表为握手对拍数据）。 */
import type { HubResult } from '../errors';
import type { Transport } from '../transport';
import { TIMEOUTS } from '../timeouts';

export interface HostCommands {
  info(): Promise<HubResult<unknown>>;
}

export function createHostCommands(send: Transport): HostCommands {
  return {
    info: () => send<unknown>({ type: 'get_host_info' }, TIMEOUTS.default),
  };
}
