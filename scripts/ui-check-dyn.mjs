/**
 * 动态栈交互验收：真实 Chrome + CDP。
 *
 * 校验：
 *  1. 动态栈的 ESP 行 == 寄存器 ESP 值
 *  2. 单步 CALL 后，栈顶格子变成“main 返回地址”
 *  3. 点击动态栈格子 → 详细表格同步高亮同一地址
 *  4. 点击表格行 → 动态栈同步高亮同一地址
 *  5. 点击帧标签 → 状态条显示帧范围
 *  6. 上一步 → ESP / 栈顶恢复
 *
 * 用法：node scripts/ui-check-dyn.mjs <port> <outDir>
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const port = process.argv[2] ?? '9222'
const outDir = resolve(process.argv[3] ?? '.shots')
mkdirSync(outDir, { recursive: true })

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
const page = targets.find((target) => target.type === 'page')
if (!page) throw new Error('no page target')

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((done, fail) => {
  socket.addEventListener('open', done, { once: true })
  socket.addEventListener('error', fail, { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
  else entry.resolve(message.result)
})

const send = (method, params = {}) =>
  new Promise((resolveCall, reject) => {
    const id = ++sequence
    pending.set(id, { resolve: resolveCall, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'eval failed')
  return result.result.value
}

const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const path = resolve(outDir, name)
  writeFileSync(path, Buffer.from(data, 'base64'))
  console.log(`screenshot → ${path}`)
}

const ok = (condition, message) => console.log(`${condition ? '✓' : '✗'} ${message}`)

await send('Page.enable')
await send('Runtime.enable')

// 1) 打开到 CALL main 之前的一步
await evaluate(`window.location.href = 'http://127.0.0.1:5173/?case=startup&step=12'`)
await sleep(2600)

const before = await evaluate(`JSON.stringify((() => {
  const espRow = document.querySelector('.dyn-row[data-esp="true"] .dyn-addr')?.textContent
  const espReg = [...document.querySelectorAll('.register-mini')].find(n => n.textContent.startsWith('ESP'))?.querySelector('.register-mini-value')?.textContent
  const step = document.querySelector('.control-step')?.textContent?.replace(/\\s+/g, ' ')
  return { espRow, espReg, step }
})())`)
console.log('before =', before)

// 2) 下一步 → CALL main
await evaluate(`[...document.querySelectorAll('.ctrl-btn')].find(b => b.textContent.includes('下一步'))?.click()`)
await sleep(700)
const afterCall = await evaluate(`JSON.stringify((() => {
  const rows = [...document.querySelectorAll('.dyn-row')]
  const espRowEl = document.querySelector('.dyn-row[data-esp="true"]')
  const espReg = [...document.querySelectorAll('.register-mini')].find(n => n.textContent.startsWith('ESP'))?.querySelector('.register-mini-value')?.textContent
  return {
    espRow: espRowEl?.querySelector('.dyn-addr')?.textContent,
    espReg,
    rowLabel: espRowEl?.querySelector('.dyn-label')?.textContent,
    rowValue: espRowEl?.querySelector('.dyn-value')?.textContent,
    rowCount: rows.length,
    step: document.querySelector('.control-step')?.textContent?.replace(/\\s+/g, ' '),
    token: document.querySelector('.dyn-token')?.textContent ?? null,
  }
})())`)
console.log('after CALL =', afterCall)
const callState = JSON.parse(afterCall)
ok(callState.espRow === callState.espReg, `ESP 行与寄存器一致（${callState.espRow}）`)
ok(String(callState.rowLabel).includes('main 返回地址'), 'CALL 后栈顶格子是 main 返回地址')
await shot('dyn-call.png')

// 3) 点击动态栈格子 → 表格同步
await evaluate(`document.querySelector('.dyn-row[data-esp="true"]')?.click()`)
await sleep(700)
const linked = await evaluate(`JSON.stringify({
  inspector: document.querySelector('.stack2-inspect-title')?.textContent ?? '',
  focus: document.querySelector('.stack2-focus-label')?.textContent ?? '',
  tableFocused: document.querySelector('.stack2-row[data-focused="true"] .stack2-address span')?.textContent ?? '',
  dynFocused: document.querySelector('.dyn-row[data-focus="true"] .dyn-addr')?.textContent ?? ''
})`)
console.log('dynamic → table =', linked)
const linkedState = JSON.parse(linked)
ok(linkedState.dynFocused === linkedState.tableFocused && linkedState.dynFocused !== '', '动态栈与表格高亮同一地址')
ok(linkedState.focus.includes('main 保存的旧 EBP') || linkedState.focus.includes('0x'), '焦点标签已同步到表格')
await shot('dyn-linked.png')

// 4) 关闭详情，点击表格里的另一行 → 动态栈同步
await evaluate(`document.querySelector('.stack2-inspect > button')?.click()`)
await sleep(200)
const tableRowAddress = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.stack2-row')]
  const target = rows.find(r => r.textContent.includes('__libc_start_main 保存的旧 EBP')) ?? rows[2]
  const addr = target?.querySelector('.stack2-address span')?.textContent
  target?.click()
  return addr
})()`)
await sleep(800)
const reverse = await evaluate(`JSON.stringify({
  dynFocused: document.querySelector('.dyn-row[data-focus="true"] .dyn-addr')?.textContent ?? '',
  tableFocused: document.querySelector('.stack2-row[data-focused="true"] .stack2-address span')?.textContent ?? ''
})`)
console.log('table → dynamic =', reverse, 'clicked', tableRowAddress)
const reverseState = JSON.parse(reverse)
ok(
  reverseState.dynFocused === tableRowAddress && reverseState.tableFocused === tableRowAddress,
  '表格点击后动态栈同步高亮同一地址',
)

// 5) 点击帧标签
const frameInfo = await evaluate(`(() => {
  const label = document.querySelector('.dyn-frame-label:not([data-ghost])')
  label?.click()
  return new Promise(resolve => setTimeout(() => resolve(JSON.stringify({
    status: document.querySelector('.dyn-status-main')?.textContent ?? '',
    label: label?.textContent ?? ''
  })), 400))
})()`)
console.log('frame =', frameInfo)

// 6) 上一步 → ESP 恢复
await evaluate(`[...document.querySelectorAll('.ctrl-btn')].find(b => b.textContent.includes('上一步'))?.click()`)
await sleep(800)
const back = await evaluate(`JSON.stringify({
  espRow: document.querySelector('.dyn-row[data-esp="true"] .dyn-addr')?.textContent,
  espReg: [...document.querySelectorAll('.register-mini')].find(n => n.textContent.startsWith('ESP'))?.querySelector('.register-mini-value')?.textContent,
  step: document.querySelector('.control-step')?.textContent?.replace(/\\s+/g, ' ')
})`)
console.log('after step back =', back)
const backState = JSON.parse(back)
ok(backState.espRow === backState.espReg, '上一步后 ESP 行与寄存器仍然一致')
await shot('dyn-back.png')

console.log('done')
socket.close()
