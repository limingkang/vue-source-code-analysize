import { isString } from '@vue/shared'

type Style = string | Partial<CSSStyleDeclaration> | null

export function patchStyle(el: Element, prev: Style, next: Style) {
  const style = (el as HTMLElement).style
  if (!next) {
    el.removeAttribute('style')
  } else if (isString(next)) {
    style.cssText = next //cssText主要设置字符串样式.cssText="color:red,height:30px"
  } else {
    for (const key in next) {
      style[key] = next[key] as string
    }
    if (prev && !isString(prev)) {
      for (const key in prev) {
        if (!next[key]) {   //彻底清空原有样式
          style[key] = ''
        }
      }
    }
  }
}
