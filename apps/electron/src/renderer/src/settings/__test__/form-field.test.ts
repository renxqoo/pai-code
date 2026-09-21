import { describe, expect, test } from 'bun:test';

import { SelectField } from '../select-field';
import { TextField } from '../text-field';
import { collectElementProps, findElementProps } from './element-props';

describe('文本字段回调接线', () => {
  test('输入回传原值；hint 与等宽样式按参数生效', () => {
    const values: string[] = [];
    const tree = TextField({ label: '名称', value: 'a', onChange: (value) => values.push(value), hint: 'hint', mono: true });
    (findElementProps(tree, (props) => props['onChange'] !== undefined)['onChange'] as (event: { target: { value: string } }) => void)({
      target: { value: 'glm-4.6' },
    });
    expect(values).toEqual(['glm-4.6']);
    const props = collectElementProps(tree);
    expect(props.some((p) => p['children'] === 'hint')).toBe(true);
    expect(props.find((p) => p['type'] === 'text')?.['className']?.toString()).toContain('font-mono');
  });

  test('无 id 时 input 以 aria-label 兜底可访问名；有 id 时走 label 关联', () => {
    const withoutId = collectElementProps(TextField({ label: '名称', value: '', onChange: () => undefined }));
    expect(withoutId.find((p) => p['type'] === 'text')?.['aria-label']).toBe('名称');

    const withId = collectElementProps(TextField({ label: '名称', value: '', onChange: () => undefined, id: 'provider-name' }));
    expect(withId.find((p) => p['type'] === 'text')?.['aria-label']).toBeUndefined();
    expect(withId.some((p) => p['htmlFor'] === 'provider-name')).toBe(true);
  });

  test('disabled 透传到 input', () => {
    const props = collectElementProps(TextField({ label: '名称', value: '', onChange: () => undefined, disabled: true }));
    expect(props.find((p) => p['type'] === 'text')?.['disabled']).toBe(true);
  });
});

describe('单选字段回调接线', () => {
  const options = [
    { id: 'openai', label: 'OpenAI 兼容' },
    { id: 'anthropic', label: 'Anthropic' },
  ];

  test('选中回调回传选项 id', () => {
    const picked: string[] = [];
    const tree = SelectField({ label: 'API 格式', value: 'openai', options, onChange: (id) => picked.push(id) });
    (findElementProps(tree, (props) => props['onSelect'] !== undefined)['onSelect'] as (id: string) => void)('anthropic');
    expect(picked).toEqual(['anthropic']);
  });

  test('触发器展示当前选项文案；值不在选项表时回退显示原值', () => {
    const triggerTexts = (tree: ReturnType<typeof SelectField>): unknown[] =>
      collectElementProps(findElementProps(tree, (props) => props['trigger'] !== undefined)['trigger'] as React.ReactNode).map((props) => props['children']);

    expect(triggerTexts(SelectField({ label: 'API 格式', value: 'anthropic', options, onChange: () => undefined }))).toContain('Anthropic');
    expect(triggerTexts(SelectField({ label: 'API 格式', value: 'pi-messages', options, onChange: () => undefined }))).toContain('pi-messages');
  });

  test('触发器带可访问名，hint 展示在控件下方', () => {
    const props = collectElementProps(SelectField({ label: 'API 格式', value: 'openai', options, onChange: () => undefined, hint: 'hint' }));
    expect(props.find((p) => p['aria-label'] === 'API 格式')).toBeDefined();
    expect(props.some((p) => p['children'] === 'hint')).toBe(true);
  });
});
