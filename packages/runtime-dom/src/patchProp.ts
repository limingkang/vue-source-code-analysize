import { patchClass } from './modules/class'
import { patchStyle } from './modules/style'
import { patchAttr } from './modules/attrs'
import { patchDOMProp } from './modules/props'
import { patchEvent } from './modules/events'
import { isOn } from '@vue/shared'
import {
  VNode,
  ComponentInternalInstance,
  SuspenseBoundary
} from '@vue/runtime-core'

export function patchProp(
  el: Element,
  key: string,
  nextValue: any,
  prevValue: any,
  isSVG: boolean,
  prevChildren?: VNode[],
  parentComponent?: ComponentInternalInstance,
  parentSuspense?: SuspenseBoundary<Node, Element>,
  unmountChildren?: any
) {
  switch (key) {
    // special
    case 'class':
      patchClass(el, nextValue, isSVG)   //写入calssname
      break
    case 'style':
      patchStyle(el, prevValue, nextValue) //写入style样式
      break
    case 'modelValue':
    case 'onUpdate:modelValue':
      // 这种类型的不做处理，后面使用v-model指令
      break
    default:
      if (isOn(key)) {
        patchEvent(
          el,
          key.slice(2).toLowerCase(),
          prevValue,
          nextValue,
          parentComponent
        )
      } else if (!isSVG && key in el) {
        patchDOMProp(
          el,
          key,
          nextValue,
          prevChildren,
          parentComponent,
          parentSuspense,
          unmountChildren
        )
      } else {
        patchAttr(el, key, nextValue)
      }
      break
  }
}
