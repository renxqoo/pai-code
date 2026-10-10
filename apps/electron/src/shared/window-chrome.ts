/**
 * 窗口 chrome 几何：main（红绿灯定位）与 renderer（顶行布局）共用的单一真相。
 * 顶行高度变化必须同步重算红绿灯 y（居中公式），否则 macOS 灯体压进内容区。
 */

/** 窗口顶部行高：主区头部、侧栏占位、右面板标签行、caption 三键同排等高 */
export const TOPBAR_HEIGHT = 46;

/** macOS 红绿灯单键直径（与 trafficLightPosition 配套的渲染事实） */
export const TRAFFIC_LIGHT_SIZE = 12;

/** macOS 红绿灯垂直位置：顶行内居中。main 进程 BrowserWindow 参数 */
export const TRAFFIC_LIGHT_Y = (TOPBAR_HEIGHT - TRAFFIC_LIGHT_SIZE) / 2;
