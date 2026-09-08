/**
 * 渲染层平台事实：只依赖 userAgent 判别（沙箱渲染进程无 process）。
 * 布局常量随平台导出，标题栏/caption 相关组件统一从这里取值。
 */
const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const isMacPlatform = /Macintosh|Mac OS X/.test(userAgent);
export const isWindowsPlatform = /Windows/.test(userAgent);

/** 标题块左内边距：macOS 让位红绿灯（trafficLightPosition x=14），Windows 从边起 */
export const TITLEBAR_LEFT_PADDING = isMacPlatform ? 83 : 10;

/** Windows caption 三键（最小化/最大化/关闭）占位宽，顶行内容右侧需避让 */
export const WINDOWS_CAPTION_WIDTH = isWindowsPlatform ? 3 * 46 : 0;

/** 快捷键修饰键符号（⌘K 徽标等平台化文案的数据源） */
export const MODIFIER_KEY_LABEL = isMacPlatform ? '⌘' : 'Ctrl';
