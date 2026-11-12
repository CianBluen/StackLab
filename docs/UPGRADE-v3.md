# StackLab v3 升级记录

本文件记录 v2 → v3 的改造范围、设计决策、验证方式与已知缺口。写给未来的自己：**不要从零重写，先读这里和 README。**

## 1. 起点与保护原则

v2 已经具备：真实状态模拟引擎、预计算快照时间线、6 个案例、C/汇编双面板、栈帧框选、多 ESP/EBP 历史快照、callee-saved 案例、Debug Fill、变量定位。

本次升级只做增量：

- 保留 `engine.ts` 的「预计算时间线 + 快照回滚」架构；
- 保留 `ops.ts` 的真实状态操作语义（push/pop/call/ret/allocate/release）；
- 保留组件与视觉体系，新增能力通过新组件 + 追加样式实现；
- 不更换技术栈（React 18 + Vite 6 + Zustand 5 + Tailwind + framer-motion）。

## 2. 现状分析结论（v2 的问题）

1. **入口错误**：默认案例是「最简单的函数调用」，`createEstablishedMain` 在初始状态就塞入了 main 的返回地址和旧 EBP，初学者看不到这些东西从哪来。
2. **启动案例不完整**：启动案例第 0 步已经写好了 argc/argv/envp/auxv，看不到内核建立初始栈的过程；阶段边界是手写步号，容易和指令数失配。
3. **指令解释缺地址维度**：没有 `[ebp−4]` 的有效地址计算，看不出「目标地址怎么来的」。
4. **内存单元信息不全**：缺大小、初始化状态、来源指令；只有 Debug Fill 单元可点击。
5. **缺少参考图窗口**：完全不存在。
6. **只有一种布局**。
7. **案例不覆盖**：v2 的「局部变量」案例讲的是 `calculate()`，没有 main 自己的 `a/b/c`；也没有 main 调用 add 的完整两帧案例。

## 3. 关键决策（含冲突处理）

| 冲突 | 决策 | 理由 |
| --- | --- | --- |
| 统一环境定为 Linux/GCC，但 `0xCCCCCCCC` 是 MSVC 行为 | 保留 Debug Fill 开关，文案明确「MSVC 调试运行库常见填充，非 GCC/Linux 默认，也不是 CPU/ABI 规则」 | 这是用户指定的教学点；删掉会丢功能，伪装成 GCC 行为会误导 |
| 教学栈地址 `0x1000/0x2000` 与真实 Linux 栈区间不符 | 不改地址，README 与界面标注「教学简化布局」 | 6 个案例的偏移、CALL 目标、断言全部锚定这套布局，改地址收益为负 |
| 无 i686 工具链 | 不接入真实编译器；保留「教学示意 / 真实 GCC 输出」的来源分类与标签 | 不把 手写汇编 伪装成 编译器输出 |
| 「内核建立初始栈」不是 x86 指令 | 新增 `os-init-stack` 操作 + `Instruction.isSystemAction`，CodePanel / InstructionPanel 标注「系统动作 · 非 x86 指令」 | 既要能看到栈被建立，又不能伪造一条 CPU 指令 |
| v2 已有 6 个案例，规格要求 5 个 | 保留全部 6 个，新增 2 个（`main-locals`、`main-add`），默认切换为 startup | 不删已工作功能；新增案例直接对应规格第 5、8 节 |

## 4. 分阶段实现

### 阶段 1：启动过程

- `scenarios.ts` 新增 `loaderSpec`（`kernel: setup_initial_stack`），启动案例初始状态 `cells: []`，第 1 步才写入 argc / argv / envp / auxv。
- 初始栈数据归属「初始栈」帧（`functionId: 'kernel'`，名称 `初始栈`），不是 `_start` 帧；`_start` 在第一次 push 之前 `size = 0`。
- 阶段 A/B/C/D 的 `fromStep/toStep` 改为按指令上的 `phase` 推导，杜绝手写步号失配。
- 启动案例 main 的局部变量扩成 `a/b/c` + `sub esp, 12`，与规格第 5 节一致。
- 默认案例改为 `startup`。

### 阶段 2：执行引擎扩展

- `MemoryCell` 增加 `size`（固定 4）与 `sourceInstruction`；`writeCell` / `freeCell` / 初始种子统一初始化。
- `assembler.executeOp` 执行后按效果类型（push/call/write/fill/allocate/save-register/os）回写来源指令，读取类指令不覆盖来源。
- 新增 `lea-reg-mem` 操作：只计算有效地址、不读内存。
- `Instruction` 增加 `addressing`（base/offset/kind）与 `isSystemAction`。
- `StackFrame` 增加 `createdStep`，指针悬停可显示「记录于第 N 步」。
- `pushEbp` 标签改为「<函数名> 保存的旧 EBP」；`callFunction` 压入的单元标签改为「<被调用者> 返回地址」。

### 阶段 3：栈内存可视化

- 所有单元可点击，弹出 `CellInspector`：地址、数值（hex + dec）、大小、用途、类型、所属函数、初始化、来源指令、帧范围。
- 点击单元同时设置模拟器焦点（供参考图绑定）。
- `CALL` 效果在目标单元上加「CALL 压入」标签与行高亮。
- 帧框/指针的 `ROW_HEIGHT` 改为可变 `rowHeight`，为全屏布局的行密度缩放让路。
- 全屏栈图布局新增「来源指令」列。

### 阶段 4：案例

- 新增 `main-locals`（12 步）：从「main 刚被 CALL、栈顶只有返回地址」开始，逐条建立 main 帧、`sub esp,12`、写 a/b/c。
- 新增 `main-add`（24 步）：main 局部变量 x/y/sum → cdecl 压参 → CALL add → add 建帧/局部变量/返回 → 写回 sum。
- 案例总数 8，顺序按学习路径重排（startup → main-locals → basic-call → main-add → callee-saved → nested → local-variables → optimized）。

### 阶段 5：参考图窗口

- `reference/types.ts`：标注用 0..1 归一化坐标，缩放/平移不漂移。
- `store/referenceStore.ts`：多图、视图（zoom/offset）、工具、标注 CRUD、fitToken。
- `components/ReferenceView.tsx`：上传/拖拽/多图切换、滚轮缩放、拖动平移、适应窗口、CSS 全屏、文字/矩形/箭头、拖动移动、绑定焦点、反向定位。
- 联动复用 `simulatorStore.focusAddress / focusRegister / focusLabel`：双向都是「相等的地址/寄存器值」。

### 阶段 6：布局与验收

- 三种布局由 `simulatorStore.layout` 驱动，`App.tsx` 条件渲染，切换保留步号。
- `ControlBar` 新增「到函数结束」。
- 指令面板新增「有效地址」块与「内存」行（本步访问的地址 + 效果标签）。
- 新增 `scripts/verify.ts`（132 项断言）与 `scripts/ui-check.mjs`（CDP 驱动真实 Chrome 的参考图交互验收）。
- 深链：`?case=&step=&layout=`。

## 5. 文件变更

新增：

- `src/reference/types.ts`
- `src/store/referenceStore.ts`
- `src/components/ReferenceView.tsx`
- `src/components/LayoutSwitcher.tsx`
- `scripts/verify.ts`
- `scripts/ui-check.mjs`
- `scripts/cdp-eval.mjs`
- `docs/UPGRADE-v3.md`（本文件）
- `docs/screenshots/{startup-initial-stack,main-frame-v3,main-add-v3,stack-full-v3,reference-v3}.png`

修改：

- `src/simulator/types.ts`（MemoryCell / Instruction / StackFrame / EffectKind）
- `src/simulator/ops.ts`（标签、createdStep、种子来源）
- `src/simulator/assembler.ts`（lea、os-init-stack、addressing、来源回写、WRITE_EFFECTS）
- `src/simulator/scenarios.ts`（loader、main a/b/c、两个新案例、默认案例、动态阶段）
- `src/simulator/utils.ts`（stampSource、freeCell 字段）
- `src/store/simulatorStore.ts`（layout、runToFunctionEnd、深链、SSR 安全）
- `src/components/StackMemory.tsx`（详情、来源列、行高、焦点、CALL 高亮、帧名格式）
- `src/components/InstructionPanel.tsx`（地址分解、内存行、额外寄存器对比、系统动作徽标）
- `src/components/CodePanel.tsx`（系统动作标记）
- `src/components/RegisterDock.tsx`（点击设为焦点）
- `src/components/ControlBar.tsx`（到函数结束）
- `src/components/Header.tsx`（布局切换）
- `src/App.tsx`（三种布局）
- `src/styles-v2.css`（布局、参考图、详情、来源列、缩放）
- `package.json`（`verify` 脚本）
- `README.md`（v3 重写）

## 6. 验证方式

```bash
npm run typecheck
npm run verify     # 132 项断言
npm run build
node scripts/ui-check.mjs <port> .shots   # 需先用 --remote-debugging-port 启动 Chrome
```

`verify.ts` 直接跑真实时间线（不经 DOM），断言教学不变量，例如：

- `CALL main` 之后栈顶值 === CALL 下一条指令地址，且该单元 `frameId` 属于 main 帧；
- `push ebp` 后 `[ebp]` 是 `saved-ebp`，`[ebp+4]` 才是 `return`；
- `sub esp, 12` 三个槽位 `isInitialized === false`，`mov` 后才为 true；
- `add` 的 `[ebp+8]/[ebp+12]` 等于 main 压入的 10/20；
- 回退后 `JSON.stringify(state)` 与历史快照完全相同。

## 7. 未完成 / 下一步

1. 参考图与标注持久化（IndexedDB / localStorage，注意图片体积）。
2. 标注旋转、自由笔刷、像素级区域映射。
3. 真实编译器接入：`POST /compile` → i686 gcc -O0 -S → 解析成 `FunctionSpec`；需要工具链与沙箱。
4. 同一地址多条标注时的轮换高亮。
5. 全屏栈图缩放同时缩放字号（当前只改行高）。
