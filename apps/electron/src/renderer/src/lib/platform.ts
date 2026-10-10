/**
 * 渲染层平台事实：只依赖 userAgent 判别（沙箱渲染进程无 process）。
 * 布局常量随平台导出，标题栏/caption 相关组件统一从这里取值。
 */
const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const isMacPlatform = /Macintosh|Mac OS X/.test(userAgent);
export const isWindowsPlatform = /Windows/.test(userAgent);

/**
 * 标题块左内边距：macOS 让位红绿灯，Windows 从边起。
 * macOS 90 = 红绿灯区宽（trafficLightPosition x=14，三键各 12px 直径 + 8px 间距 ≈ 53px）
 * + 开关与其 33px 归组间距 + IconButton 的 -ml-1（4px）补偿，使按钮视觉左缘落在约 86px。
 * 原值 83 使按钮与红绿灯之间空出 26px，图标脱离红绿灯组、显得孤立。
 */
export const TITLEBAR_LEFT_PADDING = isMacPlatform ? 90 : 10;

/** 全屏态标题块左内边距：macOS 全屏时红绿灯隐藏（悬停才现），收窄让侧栏开关贴近左缘 */
export const TITLEBAR_LEFT_PADDING_FULLSCREEN = 12;

/** Windows caption 三键（最小化/最大化/关闭）占位宽，顶行内容右侧需避让 */
export const WINDOWS_CAPTION_WIDTH = isWindowsPlatform ? 3 * 46 : 0;

/** 快捷键修饰键前缀（⌘K/Ctrl+K 徽标等平台化文案的数据源；含与键位的分隔） */
export const MODIFIER_KEY_LABEL = isMacPlatform ? '⌘' : 'Ctrl+';
