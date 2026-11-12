import type { CVariable } from '../simulator/types'

const KEYWORDS = new Set([
  'int',
  'char',
  'void',
  'return',
  'if',
  'else',
  'for',
  'while',
  'static',
  'const',
  'unsigned',
  'long',
  'short',
  'struct',
])

const tokenPattern =
  /([A-Za-z_]\w*|0x[0-9A-Fa-f]+|\d+|"[^"]*"|\s+|[^\sA-Za-z0-9_]+)/g

interface CodeTextProps {
  text: string
  variables: CVariable[]
  onVariable: (variable: CVariable) => void
}

/** C 源码的极简语法高亮：关键字 / 数字 / 字符串 / 可点击变量。 */
export const CodeText = ({ text, variables, onVariable }: CodeTextProps) => {
  const tokens = text.match(tokenPattern) ?? []
  return (
    <>
      {tokens.map((token, index) => {
        if (/^\s+$/.test(token)) {
          return <span key={`space-${index}`}>{token}</span>
        }
        if (KEYWORDS.has(token)) {
          return (
            <span className="c-keyword" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        if (/^0x[0-9A-Fa-f]+$|^\d+$/.test(token)) {
          return (
            <span className="c-number" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        if (/^"/.test(token)) {
          return (
            <span className="c-string" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        const variable = variables.find((candidate) => candidate.name === token)
        if (variable) {
          return (
            <button
              type="button"
              key={`${token}-${index}`}
              className={`c-variable ${variable.storage === 'register' ? 'is-register' : 'is-stack'}`}
              onClick={() => onVariable(variable)}
              title={`点击定位变量 ${variable.name}`}
            >
              {token}
            </button>
          )
        }
        if (/^[A-Za-z_]\w*$/.test(token)) {
          return (
            <span className="c-ident" key={`${token}-${index}`}>
              {token}
            </span>
          )
        }
        return <span key={`${token}-${index}`}>{token}</span>
      })}
    </>
  )
}
