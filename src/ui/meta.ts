import type {
  FrameStatus,
  FrameTone,
  MemoryType,
  RegisterName,
} from '../simulator/types'

export const registerMeta: Record<
  RegisterName,
  { label: string; role: string; color: string; group: 'general' | 'pointer' }
> = {
  eax: { label: 'EAX', role: '累加器 / 返回值', color: '#f4b860', group: 'general' },
  ebx: { label: 'EBX', role: 'callee-saved', color: '#e69a6c', group: 'general' },
  ecx: { label: 'ECX', role: '计数 / caller-saved', color: '#d7c36a', group: 'general' },
  edx: { label: 'EDX', role: '数据 / caller-saved', color: '#b9c870', group: 'general' },
  esi: { label: 'ESI', role: 'callee-saved', color: '#76c7a4', group: 'general' },
  edi: { label: 'EDI', role: 'callee-saved', color: '#75b8d8', group: 'general' },
  esp: { label: 'ESP', role: '当前栈顶指针', color: '#4d9dff', group: 'pointer' },
  ebp: { label: 'EBP', role: '当前帧基准 (可选)', color: '#37d99b', group: 'pointer' },
  eip: { label: 'EIP', role: '下一条指令地址', color: '#b28cff', group: 'pointer' },
}

export const memoryTypeMeta: Record<
  MemoryType,
  { label: string; color: string; legend: boolean }
> = {
  parameter: { label: '参数', color: '#f4b860', legend: true },
  return: { label: '返回地址', color: '#b28cff', legend: true },
  'saved-ebp': { label: '保存 EBP', color: '#37d99b', legend: true },
  local: { label: '局部变量', color: '#4d9dff', legend: true },
  'saved-register': { label: '保存寄存器', color: '#e69a6c', legend: true },
  alignment: { label: '对齐空间', color: '#71849c', legend: true },
  startup: { label: '启动数据', color: '#94a9c4', legend: false },
  argc: { label: 'argc', color: '#f0c674', legend: false },
  argv: { label: 'argv', color: '#86c7a5', legend: false },
  envp: { label: 'envp', color: '#9eb6d0', legend: false },
  auxv: { label: 'auxv', color: '#a6b7cb', legend: false },
  caller: { label: '调用者', color: '#6f839c', legend: true },
  free: { label: '空闲', color: '#3c4c61', legend: true },
}

export const frameToneMeta: Record<
  FrameTone,
  { color: string; soft: string; label: string }
> = {
  blue: { color: '#4d9dff', soft: 'rgba(77,157,255,.12)', label: '蓝' },
  green: { color: '#37d99b', soft: 'rgba(55,217,155,.12)', label: '绿' },
  violet: { color: '#b28cff', soft: 'rgba(178,140,255,.12)', label: '紫' },
  amber: { color: '#f4b860', soft: 'rgba(244,184,96,.12)', label: '琥珀' },
  teal: { color: '#5cd4c6', soft: 'rgba(92,212,198,.12)', label: '青' },
  rose: { color: '#ec8ca8', soft: 'rgba(236,140,168,.12)', label: '玫红' },
  slate: { color: '#8ea4bf', soft: 'rgba(142,164,191,.1)', label: '灰蓝' },
}

export const statusLabel: Record<FrameStatus, string> = {
  active: '执行中',
  waiting: '挂起等待',
  creating: '建立中',
  closing: '拆除中',
  returned: '已返回',
}
