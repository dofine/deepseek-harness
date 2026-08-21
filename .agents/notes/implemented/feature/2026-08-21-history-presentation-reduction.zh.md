# Agent Note：长推理会话的 history 展示缩减

Status: implemented

[English](2026-08-21-history-presentation-reduction.md) | 中文

## 问题

`session.history` 按追加来源的消息组返回一页，且该页携带**组内每一个原始事件**——包括全部 `assistant/chunk`。高推理强度下一条助手消息可折叠数万个流式 chunk，于是一个 50 消息的尾页膨胀到 27k 事件 / 5.1 MB JSON，约 99% 是 `assistant/chunk`（[讨论 #2119](https://github.com/deepseek-ai/deepseek-harness/discussions/2119)）；单条极端消息把 9.7 万个 chunk seq 聚合进自己的 `sourceEventSeqs`（单行 86.6 万字符，[讨论 #359](https://github.com/deepseek-ai/deepseek-harness/discussions/359)）。服务端应答只要约 40ms——代价是负载体积而非服务端工作——但客户端要把整个窗口装进主线程并逐个事件重放，于是打开这种会话直接冻结标签页，而冻结的标签页无法渲染 turn 中途到达的 `approval/asked`。

## 决策

`historyPage` 在下发前缩减页面，这一收口点被 `session.history` 与 `subagent.history` 共享：

- 对页面上存在已完成追加来源 `assistant/message` 的 step，其 `assistant/chunk` 事件折叠为**首个非空 token delta**（`isTokenDelta`，与客户端 step 时序所用的同一判定）。消息本身已携带最终 blocks 与 usage，因此内容渲染完全一致；保留的那一个 chunk 让客户端在一次全新窗口加载后仍能算出 TTFT / 解码吞吐（`navigation-panes` 与 `skill-user-invoke` 两个浏览器场景都钉住了这段时序展示）。
- 页面上没有完成态消息的 step（被打断的 step、进行中的尾部 partial）保留**全部** chunk：客户端要靠它们重建内容（`assistantDefinition.fallbackState`、trajectory 的打断路径、turn-tail 的打断锚点）。
- 每个下发事件的 `sourceEventSeqs` 都被剥离。只有服务端的 `paginate` 分组会读它；客户端从不读它，而一条高推理消息的这个索引单独就可能达到约 10^5 个数。

`paginate` 仍在未缩减的页上运行，因此消息边界分组、`hasMore` 截断以及"压缩 summary 与替换同页"的保证都不变。会话日志、实时 mux 帧与 `session.export` 完全不受影响——这只是对 history RPC 的展示级缩减。

## 为什么按"页内完成"判定

`paginate` 绝不从消息中间截断（截断点取该组最早的 chunk seq），因此一条完成态消息与其全部 chunk 必然落在同一页。"页内完成"这一判定对完成态 step 是精确的，页内出现"有 chunk 无消息"的唯一情形正是真正的 partial 或打断 step——而恰好是客户端需要 chunk 的地方。

## 影响

- `session.history` 与 `subagent.history` 的响应不再携带完成态 step 的每一个 `assistant/chunk` 事件，也不再携带任何 `sourceEventSeqs`。完成态的内容与 usage 渲染完全一致——它们由消息事件持有——而 TTFT / tokens/sec 通过保留的那一个 delta chunk 保住，被打断或进行中的 step 仍保留全部 chunk。
- 会话日志、实时 mux 帧与 `session.export` 完全不受影响：缩减只作用于 history RPC，因此重放保真度与持久化导出都不变。
- 在对话中途截断的 `loadOlder` 页仍会对每个下发组做缩减；`hasMore` 边界与"压缩 summary 与替换同页"的保证都不变。
- 未来若有消费者需要 history 窗口的完整 chunk 流或 `sourceEventSeqs`，必须另行选用单独的展示面；展示窗口不再提供它们。

## 备选方案

**在 `replaceWindow` 里做客户端封顶。** 否决：5 MB 仍然要过网线，且客户端的封顶逻辑必须确定且可重放；服务端拥有日志形态，能在源头就把字节省掉。

**丢弃完成态 step 的全部 chunk。** 否决：客户端从首个 token delta 推导 TTFT 与 tokens/sec，且两个浏览器 e2e 场景断言了"从 history 加载的重放"里这段时序仍存在。为每个完成态 step 保留一个 delta chunk，用可忽略的负载代价保住了指标。

**保留 `sourceEventSeqs`。** 否决：它是 86.6 万字符消息的另一半，只有 `paginate` 读它，而且它从来不在展示窗口的需要范围内。
