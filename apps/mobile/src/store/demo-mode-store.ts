import { create } from 'zustand';

/**
 * 离线演示开关：UI 原型时代的 fixtures 数据通道（默认关闭——真连接为常态；
 * 设置页可开，供无桌面端时展示界面形态）。
 */
type DemoModeState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const useDemoModeStore = create<DemoModeState>((set) => ({
  // 跟随系统外观做缺省不适用（演示是数据形态决策）——显式默认关
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
}));
