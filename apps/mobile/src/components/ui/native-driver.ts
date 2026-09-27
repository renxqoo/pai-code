/** Animated 驱动选择（平台坑）：web 没有原生动画驱动，而 Animated.loop 是否走 JS
 * 续跑分支只看配置里的 useNativeDriver 标记、不看实际驱动能力——web 上标 true 会走
 * 「原生循环」分支，回退 JS 后只跑一圈就停在终点（spinner 卡在 360°，视觉上等于静止）。
 * 故 web 强制 JS 驱动；原生端保持原生驱动（动画不占 JS 线程，流式期间不掉帧）。 */
export function nativeDriverFor(platform: string): boolean {
  return platform !== 'web';
}
