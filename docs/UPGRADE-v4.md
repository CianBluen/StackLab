# StackLab v4 升级记录：动态栈内存

本轮把左侧参考图区域换成由真实 CPU 状态驱动的动态栈，形成新的默认布局：

```
┌───────────────────────────┬──────────────────────────────┐
│ 动态栈（格子/指针/帧框）    │ 汇编代码 + 指令解释            │
├───────────────────────────┴──────────────────────────────┤
│ 栈内存详细表格                                            │
├──────────────────────────────────────────────────────────┤
│ 寄存器（9 个，一行）                                       │
├──────────────────────────────────────────────────────────┤
│ 执行控制条                                                │
└──────────────────────────────────────────────────────────┘
```

## 1. 复用了什么

| 现有资产 | 用法 |
| --- | --- |
| `engine.buildTimeline` | 每一步的完整快照，动态栈直接读 `timeline[currentStep].state`，不另造状态 |
| `ops.ts` | PUSH/POP/CALL/RET/SUB/ADD 的真实语义（ESP、内存、帧归属） |
| `StackMemory` | 原详细表格整体保留，新增 `compact` 模式放在下方 |
| `InstructionPanel` / `CodePanel` | 原样放在右侧，新增「点击指令查看解释」 |
| `RegisterDock` | 原样复用，在动态布局里变成 9 列一行 |
| `CellInspector` | 从 `StackMemory` 抽成独立组件，动态栈与表格共用 |
| `frameToneMeta` / `memoryTypeMeta` | 颜色语义不变 |

**没有**新增任何模拟状态：动态栈不持有内存副本，也不根据动画进度改数值。

## 2. 新组件

- `src/components/DynamicStack.tsx`
  - 竖排 `.dyn-row`（默认 62px/格，可 70%–145% 缩放）
  - 每格：地址、数值（hex）、用途、类型 / 所属函数 / 4 B / 来源指令、状态标签
  - `.dyn-pointer`：ESP（蓝）/ EBP（绿），`motion` 弹簧跟随 `top`
  - `.dyn-frame`：活动帧半透明框，`motion` 跟随 `top` / `height`，`AnimatePresence` 让返回的帧淡出
  - 已释放帧：虚线 ghost 框 + 「已释放」
  - `.dyn-token`：PUSH/CALL 下滑、POP/RET 上抬的值令牌
  - 状态条：悬停显示用途/来源，选中帧显示范围/EBP/返回地址
- `src/components/CellInspector.tsx`：从表格抽出的单元详情（地址、值、大小、用途、类型、函数、初始化、来源、状态）
- `src/ui/stack.ts`：`frameLabel`、`rowIndexForAddress`、`frameForCell`、`changedAddresses`
- `scripts/ui-check-dyn.mjs`：CDP 验收动态栈
- `scripts/cdp-shot.mjs`：等动画稳定后截图（headless `--screenshot` 会在 smooth scroll / spring 中途截断）

## 3. 布局实现

- `App.tsx` 新增 `layout === 'dynamic'` 分支。
- `.workspace-v2.workspace-dynamic`：`grid-template-columns: minmax(0,1.02fr) minmax(0,1fr)` + `grid-template-rows: minmax(0,1fr)`。
  - **关键点**：不写 `grid-template-rows` 时，隐式行会按内容高度（45 格 × 62px）撑开，动态栈的 `overflow` 容器拿不到高度，滚动失效；显式 `minmax(0, 1fr)` 才能把高度约束到剩余空间。
- 右侧 `.dyn-right`：`CodePanel` 弹性、`InstructionPanel` 固定 234px。
- 下方 `.dynamic-table` 156px（compact 表格隐藏帧带/快照注/图例）。
- 底部 `.dynamic-registers` 72px，寄存器 9 列一行（隐藏标题与 ABI 注）。
- 高度不足时 `@media (max-height: 800px)` 再压缩。

## 4. 动画与状态一致性

原则：**状态先变，动画只是复述变化。**

- 每一步由 `buildTimeline` 生成完整快照；`DynamicStack` 读取当前快照与上一步快照做 diff（`changedAddresses`）。
- PUSH/CALL：`lastEffect.addresses[0]` 对应的行加 `data-entering`（CSS 位移动画）+ 令牌下滑；格子内容已经是新值。
- POP/RET：对应行加 `data-leaving`（抬起动画）+ 令牌上抬；格子已经变为「残留」。
- ESP/EBP：`motion.button` 用 spring 动画 `top`，位置永远等于 `state.esp` / `state.ebp` 的行号 × 行高。
- 帧框：`motion.div` 弹簧跟随 `stackStart/stackEnd`；返回时 `AnimatePresence` 淡出。
- 因此动画未结束就点「上一步」也不会出现数据错位——没有第二套数据流。

## 5. 交互与联动

| 操作 | 结果 |
| --- | --- |
| 点动态栈格子 | `focusVariable({address})` + 打开详情；详细表格滚动并高亮同一地址 |
| 点表格行 | 同一 `focusAddress`；动态栈滚动到该格并高亮 |
| 点 ESP / EBP 指针 | 聚焦 `state.esp` / `state.ebp` |
| 点寄存器卡片 | `focusRegister`；动态栈定位到 ESP/EBP 对应行 |
| 点帧框标签 | 状态条显示该帧范围、EBP、返回地址 |
| 悬停格子 | 状态条显示用途 + 来源指令 |
| 点汇编行 | 右侧切换到那条指令的解释（显示它执行前后的状态），带「返回」按钮，不改变当前步 |
| 滚轮 / −+ / ⌖ / ◉ | 滚动、缩放、适应当前帧、跟随 ESP |

## 6. 验收

```bash
npm run typecheck
npm run verify      # 引擎层 132 项断言
npm run build

# 需先用 --remote-debugging-port 启动 Chrome
node scripts/ui-check-dyn.mjs <port> .tmp-shots
```

`ui-check-dyn.mjs` 的实际输出（节选）：

```
✓ ESP 行与寄存器一致（0x1FD8）
✓ CALL 后栈顶格子是 main 返回地址
✓ 动态栈与表格高亮同一地址
✓ 表格点击后动态栈同步高亮同一地址
✓ 上一步后 ESP 行与寄存器仍然一致
```

截图：`docs/screenshots/dynamic-stack.png`、`dynamic-nested.png`、`dynamic-push.png`、`dynamic-subesp.png`、`dynamic-ret.png`。

## 7. 已知问题

- 动态栈渲染整个栈区间（45–57 行），未做虚拟滚动。
- 动画时长固定 0.3–0.6s，无速度设置。
- 深层嵌套时，多个帧标签都贴在各自框的左上角，可能互相靠近。
- 帧框与指针的 `top` 基于行号计算，行高变化（缩放）时位置会重新计算并触发一次弹簧动画。

## 8. 下一步

- 帧标签避让（内层帧标签放到框内右侧）。
- 动画速度设置 / 减少动效开关。
- 虚拟滚动，支持更大的教学栈。
- 在动态栈上直接显示 C 变量名（从 `scenario.variables` 反查）。
