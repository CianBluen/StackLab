/**
 * 极简 CDP 求值器：连接已开启 --remote-debugging-port 的 Chrome，
 * 执行一段表达式并打印结果。用于调试与人工验收。
 *
 * 用法：node scripts/cdp-eval.mjs <port> "<expression>"
 */
const port = process.argv[2] ?? '9222'
const expression = process.argv[3] ?? 'document.title'

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
  new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
})
if (result.exceptionDetails) {
  console.error('EXCEPTION', JSON.stringify(result.exceptionDetails, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify(result.result.value, null, 2))
}
socket.close()
