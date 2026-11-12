/**
 * 用 CDP 截一张“动画已经稳定”的图（headless 的 --screenshot + virtual time 会在
 * spring / smooth-scroll 中途截断，容易误判布局）。
 *
 * 用法：node scripts/cdp-shot.mjs <port> <outfile> [url]
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const port = process.argv[2] ?? '9222'
const outfile = resolve(process.argv[3] ?? 'shot.png')
const url = process.argv[4]
const delay = Number.parseInt(process.argv[5] ?? '', 10)
const clickNext = process.argv[6] === 'next'

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

await send('Page.enable')
await send('Runtime.enable')
if (url) {
  await send('Page.navigate', { url })
  await sleep(2400)
} else {
  await sleep(2000)
}

if (clickNext) {
  await send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('.ctrl-btn')].find((button) => button.textContent.includes('下一步'))?.click()`,
  })
  await sleep(Number.isFinite(delay) ? delay : 220)
} else if (Number.isFinite(delay)) {
  await sleep(delay)
}

const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(outfile, Buffer.from(data, 'base64'))
console.log(`screenshot → ${outfile}`)
socket.close()
