// compiler should normalize class + :class bindings on the same element
// into a single binding ['staticClass', dynamic]

export function patchClass(el: Element, value: string, isSVG: boolean) {
  // 直接设置className比使用setAttribute来设置快
  if (isSVG) {
    el.setAttribute('class', value)
  } else {
    el.className = value
  }
}
