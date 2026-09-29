/**
 * WS 拨号（R2 M10）：RN 原生支持第三参 headers（Authorization 头携带 token——
 * URL query 泄露面消除）；web 浏览器 WS 无自定义头——退 query（已知残余，见 R2 申报）。
 */
import { Platform } from 'react-native';

type ThreeArgWebSocket = new (url: string, protocols: string | string[] | undefined, options: { headers: Record<string, string> }) => WebSocket;

export function dialWebSocket(url: string, bearerToken: string): WebSocket {
  if (Platform.OS === 'web') {
    return new WebSocket(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(bearerToken)}`);
  }
  const Ctor = WebSocket as unknown as ThreeArgWebSocket;
  return new Ctor(url, undefined, { headers: { Authorization: `Bearer ${bearerToken}` } });
}
