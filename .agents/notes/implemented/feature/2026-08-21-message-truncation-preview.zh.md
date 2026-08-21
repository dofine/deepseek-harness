# Agent Note：助手消息截断预览

Status: implemented

[English](2026-08-21-message-truncation-preview.md) | 中文

## 问题

聊天视图把每一条助手 `text` 块都交给 `MarkdownText` 渲染，而已定型消息会对其全部源码执行一次完整 `parseGfmWithMath` 加上语法高亮。一条病态消息——29 万字符、42 个代码块、单行 86.6 万字符 JSON（[讨论 #359](https://github.com/deepseek-ai/deepseek-harness/discussions/359)）——会让这一次渲染占住主线程，成为长会话标签页冻结的一部分。history 剪枝解决的是负载；这条解决的是剩下的单条消息渲染成本。

## 决策

超过可配置边界的已定型助手 `text` 块，改为渲染**按行边界的预览**并带展开开关；读者显式展开后才执行完整 `MarkdownText` 渲染。流式文本永不截断——增量解析器已经按 chunk 限制了每次工作的量，预览反而会跟冻结/累积逻辑打架。

- 边界是 Host settings 支撑的 `ui-conversation.truncateMessageChars` General Settings 偏好（默认 50000，0 表示禁用），像 `busyEnter` 一样存入 `$DSH_HOME/settings.yaml`，并由 `MessageTruncationPolicy` 实时采纳；改变边界无需重启页面即可到达渲染层。
- 该值经聊天节点 inject 面（`ChatNodeTurnDataInjected.hooks.truncateMessageChars`，一个 `HostObservable` → `useTruncateMessageChars`）到达助手渲染器，业务组件保持纯粹，只通过标准工具包消费 props。
- 预览在边界之前（含）的最后一行断行处截断（至少保留边界的一半），从而保持块结构完整；预览会去掉文件提及，因为其目标可能位于截断点之后。完整源码与会话日志都原样保留，因此展开始终能恢复完整消息。
- 预览与开关都放在同一个组件（`TruncatableMarkdownText`）里，展开/折叠是本地状态；展开后的渲染只是一次普通 props 切换，对相同边界/消息的重渲染会保留读者选择。

## 影响

- 超过边界的已定型助手 `text` 块改为渲染按行边界的预览 + 展开开关，而不是一次完整 markdown/高亮；读者展开后恢复完整消息及其文件提及。会话日志与完整源码都原样保留，因此保真度与持久化导出不变。
- 默认边界（50000）高到足以让普通消息的渲染与之前完全一致；只有病态消息才会截断。用户可在 General Settings 文档中调大或设为 0 来禁用；改变边界会实时到达渲染层。
- 流式与打断消息不受影响（流式永不截断；低于边界的打断 partial 照旧渲染）。
- 任何新的聊天节点 inject 面消费者都必须提供 `truncateMessageChars` hook 源（或在手写渲染的测试里给 stub）；当前只有助手渲染器消费它。

## 备选方案

**截断助手节点数据（服务端或客户端封顶）。** 否决：完整消息内容必须保留给展开使用，而会话窗口里本来就持有它——在数据层截断反而要再拉取一次或另开一个面来拿完整源码。

**在 `MarkdownText`（ui-primitives）内部截断。** 否决：边界是对话产品的偏好，共享原语不应吃产品配置；wrapper 让 ui-primitives 保持稳定，开关也紧挨渲染器。

**只硬编码一个 `DEFAULT_*` 常量。** 否决："插件里不许硬编码可调项"——该设置是经过校验、可更改的偏好（常量只是它的默认值）。

**同时统计代码围栏数量。** 延后：实测的病态案例以字符为主（29 万字符）；"字符数低于边界但含很多小代码块"的案例存在但更少见，围栏数量封顶作为后续精化，而不是现在就多加一个维度。
