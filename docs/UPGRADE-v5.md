# StackLab v5 升级记录：界面精简 + 动态栈重构 + C 源码联动

## 1. 这次做了什么

1. 顶部只保留「动态」「学习」两个入口，删除「对照」「栈图」。
2. 删除动态页下方重复的「栈内存」面板。
3. 重写左侧动态栈：从“带帧色的表格”改成真正的竖直栈容器。
4. 动态页右侧新增 C 源码，形成 **C 行 → 汇编指令 → 栈格/指针/帧框** 的联动。
5. 底部保留 9 个寄存器与执行控制。

## 2. 删除清单

| 对象 | 处理 |
| --- | --- |
| `src/components/ReferenceView.tsx` | 删除（参考图窗口） |
| `src/store/referenceStore.ts` | 删除 |
| `src/reference/types.ts` | 删除（目录一并移除） |
| `scripts/ui-check.mjs` | 删除（参考图交互验收脚本） |
| `WorkspaceLayout` 的 `'reference' \| 'stack'` | 从类型、URL 参数、LayoutSwitcher、App 分支中移除 |
| `.ref-*` / `.reference-panel` / `[data-layout='reference']` / `[data-layout='stack']` 样式 | 从 `styles-v2.css` 删除（约 550 行） |
| `StackMemory` 的 `compact` 模式、行密度缩放、`来源指令` 列 | 删除（这些只为已废弃的「栈图」布局服务） |
| `docs/screenshots` 中旧的 reference / stack-full / v2 截图 | 删除，换成 v5 动态页截图 |

保留：模拟器 `Memory` 数据模型、`CellInspector` 单元详情、学习页的完整表格、8 个案例、快照时间线、Debug Fill、到函数结束、深链。

## 3. 新布局

```
Header
┌───────────────────────────┬───────────────────────────────┐
│ 动态栈（卡片/指针/帧框）    │ C 源码                         │
│                           ├───────────────────────────────┤
│                           │ x86 汇编                       │
│                           ├───────────────────────────────┤
│                           │ 指令解释                       │
├───────────────────────────┴───────────────────────────────┤
│ 寄存器（9 个一行）                                          │
├───────────────────────────────────────────────────────────┤
│ 执行控制                                                    │
└───────────────────────────────────────────────────────────┘
```

- `.workspace-v2.workspace-dynamic`：两列 `1.05fr / 1fr`，`grid-template-rows: minmax(0,1fr)`（不写会让隐式行被内容撑高，滚动容器失效）。
- 右列：C 源码 200px、汇编弹性、指令解释 204px；面板标题压到 33px 腾空间；矮屏（≤820px）再压缩。
- 底部寄存器条 72px（矮屏 66px），9 列一行，隐藏面板标题与 ABI 注。
- 动态页不再渲染 `StackMemory`。

## 4. 动态栈重构

**几何模型**：单格高度 `CARD_HEIGHT[density]`（舒适 62 / 紧凑 48）+ 间距 6；第 i 格顶部 = `PAD_TOP + i × stride`；容器顶部预留 26px 给最上面那个帧标签。

- **栈容器**：居中的 `.dyn-well`（`min(430px, 100% - 150px)`），`::before` 画出圆角“管壁”和底部阴影；上下各一个 `.dyn-cap` 标出栈顶/栈底地址。
- **内存格**：每格独立卡片，左侧 2.5px 类型色条；三行信息（地址 + hex 值 / 用途 + 状态 / 类型 · 函数 · 大小 · 来源指令）。未分配格是虚线暗格，已释放格保留旧值、降透明度并标「已释放」，Debug Fill 格用粉色边和 `CC` 徽标。
- **指针**：`.dyn-lane` 在容器左右负偏移处，ESP 蓝 / EBP 绿，`motion.button` 弹簧跟随 `rowTop + (cardH - 28) / 2`；箭头指向卡片，点击定位。
- **帧框**：绝对定位在容器内，`top = rowTop(startRow) - 4`，`height = count × stride - gap + 8`；`motion.div` 弹簧跟随，返回时 `AnimatePresence` 淡出。标签浮在框上沿（`top:-13px`），背景不透明，保证压在前一张卡上也能读。
- **帧图例**：帧框上方新增 `.dyn-frames-strip`，列出所有活动帧的名字/范围/大小；帧很长、标签滚出视野时仍然可见。
- **动画**：PUSH/CALL 时目标格 `data-entering` 触发 `dyn-card-in`（从上方落下 + 轻微回弹），POP/RET 触发 `dyn-card-out`（抬起）；值令牌 `.dyn-token` 下滑/上浮；写入/填充用 `dyn-cell-flash` 闪一下。
- **滚动**：跟随 ESP 时把滚动位置对齐到 `PAD_TOP + k × stride`，避免顶部出现半张卡片；双击空白处「适应活动帧」。
- **密度**：标题栏 `☰ / ↕` 在舒适与紧凑之间切换，几何常数随之变化，指针与帧框同步重算。

所有位置来自 `state.esp / state.ebp / frame.stackStart / frame.stackEnd`，没有第二套数据。

## 5. C 源码窗口与映射

- 新组件 `CSourceView`：只读、行号、语法高亮（复用抽出的 `CodeText`），当前行高亮 + 左侧橙色标记，当前函数整体淡染。
- 映射来源：`Instruction.cLine`（由 `scenarios.ts` 的 `makeSource` 与 `cLine` 字段维护）。
- 当前指令判定与学习页一致：优先「刚执行的指令」，第 0 步显示「下一条」。
- 序言：新增 `Instruction.isPrologue`（`push-ebp` / `mov-ebp-esp`），C 面板顶部提示“编译器生成的函数序言：为 X 建立栈帧，不直接对应某一条 C 语句”。
- 函数标签：右上角显示 `add()` / `C 3` / `教学示意`。
- 变量定位：点击 C 代码里的变量名 → `focusVariable` → 动态栈对应格子高亮并滚动；寄存器变量则高亮寄存器。

## 6. 联动验收（CDP 实测）

```
✓ ESP 行与寄存器一致（0x1FD8）
✓ CALL 后栈顶格子是 main 返回地址
✓ 点 C 变量 a → 动态栈 0x0FF8 / 0x0000000A / 定位：main()::a
✓ 下一步：C 行 03 → 04，汇编 → mov dword ptr [ebp-8], 20
✓ 动态/学习布局切换正常，学习页三栏与表格保留
✓ 上一步后 ESP 行与寄存器仍一致
```

截图：`docs/screenshots/dynamic-stack.png`、`dynamic-push.png`、`dynamic-subesp.png`、`dynamic-ret.png`、`dynamic-nested.png`、`dynamic-call.png`。

## 7. 已知限制

- 动态栈渲染整个区间（45–57 格），未做虚拟滚动。
- 帧很长且滚到中段时，帧标签（框上沿）会离开视野，需要看顶部帧图例。
- 右列高度是固定比例，暂不支持拖拽调整。
- C 面板固定高度、内部滚动，小窗口一次只能看到 5–7 行。
- 没有动画速度设置。
