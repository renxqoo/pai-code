import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AreaTimeChart } from '../area-time-chart';
import { AreaTimeChartTooltip } from '../area-time-chart-tooltip';

const SERIES = [
  { dataKey: 'app', label: 'App', color: 'var(--dot-active)' },
  { dataKey: 'system', label: 'System', color: 'var(--chart-3)', axis: 'right' as const },
];

const DATA: ReadonlyArray<Record<string, number | null>> = [
  { at: 60_000, app: 120, system: 8_100 },
  { at: 120_000, app: null, system: null },
  { at: 180_000, app: 180, system: 9_400 },
];

/** 图表静态口径：SSR 不量尺寸，容器壳可渲染、不崩溃；读数卡独立纯渲染。 */
describe('AreaTimeChart', () => {
  test('容器壳渲染（SSR 下 ResponsiveContainer 尚未量尺寸），双轴系列不崩溃', () => {
    const html = renderToStaticMarkup(
      <AreaTimeChart
        series={SERIES}
        data={DATA}
        xDataKey="at"
        formatValue={(value, dataKey) => (dataKey === 'system' ? `${value} GB` : `${value} MB`)}
        formatX={(value) => `${Math.round(value / 1000)}s`}
        aria-label="资源走势"
      />,
    );
    expect(html).toContain('recharts-responsive-container');
    expect(html).toContain('aria-label="资源走势"');
  });

  test('空数据：渲染空壳不崩溃', () => {
    const html = renderToStaticMarkup(
      <AreaTimeChart series={SERIES} data={[]} xDataKey="at" aria-label="资源走势" />,
    );
    expect(html).toContain('recharts-responsive-container');
  });
});

describe('AreaTimeChartTooltip', () => {
  test('非激活态渲染空（不摆空卡）', () => {
    const html = renderToStaticMarkup(
      <AreaTimeChartTooltip active={false} payload={[{ dataKey: 'app', name: 'App', value: 120, color: 'red' }]} />,
    );
    expect(html).toBe('');
  });

  test('激活态：系列色点 + 名称 + 格式化数值 + x 标签', () => {
    const html = renderToStaticMarkup(
      <AreaTimeChartTooltip
        active
        label={120_000}
        formatLabel={(value) => `${Math.round(value / 1000)}s`}
        formatValue={(value, dataKey) => (dataKey === 'system' ? `${value} GB` : `${value} MB`)}
        payload={[
          { dataKey: 'app', name: 'App', value: 120, color: 'red' },
          { dataKey: 'system', name: 'System', value: 9_400, color: 'blue' },
        ]}
      />,
    );
    expect(html).toContain('120s');
    expect(html).toContain('App');
    expect(html).toContain('120 MB');
    expect(html).toContain('9400 GB');
  });

  test('垃圾输入降级：无数值格式化器输出原值，非法值回落 0', () => {
    const html = renderToStaticMarkup(
      <AreaTimeChartTooltip active payload={[{ dataKey: 'app', name: 'App', value: 'bad' }]} />,
    );
    expect(html).toContain('0');
  });
});
