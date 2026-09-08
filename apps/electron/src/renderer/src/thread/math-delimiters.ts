/**
 * 公式定界符探测（纯函数）：math 插件按默认配置只解析 $$ 定界（单 $ 行内公式关闭），
 * 因此 '$$' 是「文本含公式、需要 math 插件」的精确判据，不会误报金额等普通文案。
 */
export function hasMathDelimiter(text: string): boolean {
  return text.includes('$$');
}
