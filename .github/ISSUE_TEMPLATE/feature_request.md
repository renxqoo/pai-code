name: 功能请求
about: 提议一个新功能或改进
labels: ['enhancement']
body:
  - type: textarea
    id: scenario
    attributes:
      label: 场景
      description: 你在什么情境下遇到这个问题（先讲场景，不讲方案）
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: 期望行为
      description: 你期望应用怎么做
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: 已考虑过的替代方案
  - type: textarea
    id: additional
    attributes:
      label: 补充信息
