/**
 * mermaid 围栏探测（纯函数）：```mermaid / ~~~mermaid 围栏是流内需要 mermaid
 * 插件的判据；流式期间只要围栏开起来即命中，插件未就绪前该围栏按普通代码块渲染。
 */
export function hasMermaidFence(text: string): boolean {
  return /(`{3,}|~{3,})[ \t]*mermaid\b/.test(text);
}
