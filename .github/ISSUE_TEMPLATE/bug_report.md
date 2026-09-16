name: Bug 报告
about: 报告一个可复现的问题
labels: ['bug']
body:
  - type: textarea
    id: symptom
    attributes:
      label: 症状
      description: 一句话说清错在哪（是什么行为错了，而非你做了什么）
    validations:
      required: true
  - type: textarea
    id: reproduce
    attributes:
      label: 复现步骤
      placeholder: |
        1. 打开 …
        2. 点击 …
        3. 观察 …
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: 期望行为
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: 实际行为
      description: 含报错信息 / 日志（如有）
    validations:
      required: true
  - type: textarea
    id: environment
    attributes:
      label: 环境
      placeholder: 系统 / Pai 版本或提交 / hub 检出状态
    validations:
      required: true
