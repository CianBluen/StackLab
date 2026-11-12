# StackLab v6 升级记录：栈帧对齐修复 + 连续栈结构

## 1. 截图里的问题与根因

用户反馈的症状：初始栈外框与内存单元不对齐、边框覆盖不属于它的单元、边框顶/底位置不准、帧标签与边框错位、不同区域框选重叠、滚动/缩放后脱离。

先量了 DOM（v5 版本，main-locals 第 4 步）：

```
cell 0x1000 top = 99     frame top = 121     → 帧框比首格低 22px
cell 0x0FF0 bottom = 433 frame bottom = 463  → 帧框比末格低 30px
```

根因不是几个 margin，而是**两套坐标系**：

- 内存格在正常流里排列，`.dyn-well` 没有 `padding-top`，所以第 0 格从 y = 0 开始；
- 帧框/指针的定位公式却是 `rowTop(i) = PAD_TOP(26) + i × stride(68)`，凭空多出 26px；
- 再叠加帧框的 `-4 / +4` 外扩，于是整体下移 22–30px；
- 相邻帧（例如「初始进程栈」和 `__libc_start_main`）各外扩 2px，边界处重叠 4px。

所以这次没有调 CSS 补丁，而是把布局改成**单一坐标系**。

## 2. 新的布局坐标

```
rowTop(i) = PAD_TOP(24) + i × cellH
cellH = 64（舒适）/ 50（紧凑），格子连续排列，没有 gap
wellHeight = PAD_TOP + n × cellH + PAD_BOTTOM
```

- `.dyn-well` 用同一个 `PAD_TOP / PAD_BOTTOM` 做 `padding`，格子容器 `.dyn-cells` 从 padding 之后开始，因此格子的实际位置与 `rowTop` 完全一致；
- 帧框：`top = rowTop(startRow) + 3`，`height = (endRow - startRow + 1) × cellH - 4`，实测相对首格 `+2px`、相对末格 `-2px`，即**始终落在归属格子内部**，相邻帧之间留 4px 空隙，不重叠；
- 指针：`top = rowTop(row) + 1 + (cellH - 28) / 2`，箭头中心与格子中线误差 0px；
- 滚动锚点：`alignScrollTop = PAD_TOP + round((raw - PAD_TOP) / cellH) × cellH`，顶部永远落在格子边界上；
- 切换密度时 `cellH` 变化，帧框/指针用 `transition: { duration: 0 }` 重排（`snapGeometry`），避免弹簧动画期间短暂错位。

## 3. 视觉重做

- 去掉卡片间距、圆角、阴影：内存单元变成**连续的积木**，只有 1px 分隔线，外层一个圆角容器统一包住。
- 单元高度 64px，内部三行：地址 + hex 数值 / 用途 + 状态 / 类型 · 函数 · 4 Bytes · 来源指令。
- 容器左右各留 72px 作为指针轨道；ESP 蓝、EBP 绿，箭头指向格子中线。
- 帧标签贴在框的上沿（`top:-12px`），半透明底色 + 细描边，不再跨行遮住地址和数值。
- 语义配色：初始进程栈灰蓝、`__libc_start_main` 琥珀、main 蓝、add 绿；顶部帧图例始终显示所有活动帧。
- 「初始栈」改名为「初始进程栈」，明确它只是内核准备的启动数据，不是 main 栈帧。
- EBP 落在模拟栈区间之外时（main 序言前的调用者 EBP = 0x1018），显示「EBP 0x1018 · 栈外」虚线标记，不画指向错误格子的箭头。

## 4. 动画

- PUSH/CALL：目标格 `data-entering` → `dyn-cell-in`（从上方 26px 落下 + 轻微回弹），值令牌 `.dyn-token` 同步下滑；
- POP/RET：目标格 `dyn-cell-out`（抬起），帧框 `AnimatePresence` 淡出；
- `sub esp` / `add esp`：帧框高度弹簧变化，格子本身由真实性决定，不做假位移；
- ESP/EBP：`motion.button` 弹簧跟随 `rowTop`，`mov ebp, esp` 只移动 EBP，`push ebp` 只移动 ESP。

## 5. 验收数据

CDP 实测（startup 第 13 步，三个帧）：

```
初始进程栈    首格 0x2014 topGap 2  末格 0x2000 bottomGap 2
__libc_start_main 首格 0x1FFC topGap 2  末格 0x1FE4 bottomGap 2
main()        首格 0x1FE0 topGap 2  末格 0x1FD8 bottomGap 2
```

滚动 180px 后、切换到紧凑密度后，三组数值不变（仍为 2 / 2）。

场景检查：

- 初始栈：只有「初始进程栈」框，main 不存在；
- CALL main：返回地址格进入，ESP 移动，main 框建立；
- push ebp / mov ebp,esp / sub esp,12：main 框从 8 B 长到 20 B，ESP/EBP 分别移动；
- CALL add：main 与 add 两个框并存，不重叠；
- RET：add 框淡出，残留格保留数值并标「已释放」；
- 滚动 / 缩放：帧框和指针保持 2px 内缩，不脱离。

## 6. 文件

- `src/components/DynamicStack.tsx`：坐标系统一、连续格子、帧框内缩、指针、EBP 栈外处理、密度快照。
- `src/styles-v2.css`：`.dyn-*` 段整体重写（连续柱、分隔线、帧框、指针、栈外标记）。
- `src/simulator/scenarios.ts`：内核帧改名「初始进程栈」。
- `scripts/verify.ts`：初始栈断言改为按名字包含「初始」匹配。
- `README.md`、`docs/screenshots/dynamic-*.png`：更新为 v6 截图与说明。

## 7. 仍存在的限制

- 动态栈一次渲染整个区间（45–57 格），没有虚拟滚动。
- 帧很长且滚到中段时，框上沿的标签会离开视野，需要看顶部帧图例。
- 「原有单元平滑调整位置」在地址轴上是伪命题：格子占的是固定地址，PUSH 只在 ESP 下方新增一格，已有格子的地址不会变；因此用“新格下落 + 帧框长高 + 指针移动”来表达空间变化，而没有移动其它格子。
