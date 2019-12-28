import {
  VNodeTypes,
  VNode,
  createVNode,
  VNodeChildren,
  Fragment,
  Portal,
  isVNode
} from './vnode'
import { isObject, isArray } from '@vue/shared'
import { Ref } from '@vue/reactivity'
import { RawSlots } from './componentSlots'
import { FunctionalComponent } from './component'
import {
  ComponentOptionsWithoutProps,
  ComponentOptionsWithArrayProps,
  ComponentOptionsWithObjectProps,
  ComponentOptions
} from './apiOptions'
import { ExtractPropTypes } from './componentProps'

// `h` is a more user-friendly version of `createVNode` that allows omitting the
// props when possible. It is intended for manually written render functions.
// 编译器生成代码时候还是使用`createVNode`
// 1. it is monomorphic and avoids the extra call overhead
// 2. it allows specifying patchFlags for optimization

/*
// type only
h('div')

// type + props
h('div', {})

// type + omit props + children
// Omit props does NOT support named slots
h('div', []) // array
h('div', 'foo') // text
h('div', h('br')) // vnode
h(Component, () => {}) // default slot

// type + props + children
h('div', {}, []) // array
h('div', {}, 'foo') // text
h('div', {}, h('br')) // vnode
h(Component, {}, () => {}) // default slot
h(Component, {}, {}) // named slots

// named slots without props requires explicit `null` to avoid ambiguity
h(Component, null, {})
**/

export interface RawProps {
  [key: string]: any // 定义索引只能是字符串
  key?: string | number
  ref?: string | Ref | Function
  // used to differ from a single VNode object as children
  _isVNode?: never
  // used to differ from Array children
  [Symbol.iterator]?: never
}
export type RawChildren =
  | string
  | number
  | boolean
  | VNode
  | VNodeChildren
  | (() => any)

export { RawSlots }

// fake constructor type returned from `createComponent`
interface Constructor<P = any> {
  new (): { $props: P }
}

// The following is a series of overloads for providing props validation of
// manually written render functions.

// element
export function h(type: string, children?: RawChildren): VNode
export function h(
  type: string,
  props?: RawProps | null,
  children?: RawChildren
): VNode

// keyed fragment
export function h(type: typeof Fragment, children?: RawChildren): VNode
export function h(
  type: typeof Fragment,
  props?: (RawProps & { key?: string | number }) | null,
  children?: RawChildren
): VNode

// portal
export function h(type: typeof Portal, children?: RawChildren): VNode
export function h(
  type: typeof Portal,
  props?: (RawProps & { target: any }) | null,
  children?: RawChildren
): VNode

// functional component
export function h(type: FunctionalComponent, children?: RawChildren): VNode
export function h<P>(
  type: FunctionalComponent<P>,
  props?: (RawProps & P) | null,
  children?: RawChildren | RawSlots
): VNode

// stateful component
export function h(type: ComponentOptions, children?: RawChildren): VNode
export function h<P>(
  type: ComponentOptionsWithoutProps<P>,
  props?: (RawProps & P) | null,
  children?: RawChildren | RawSlots
): VNode
export function h<P extends string>(
  type: ComponentOptionsWithArrayProps<P>,
  // TODO for now this doesn't really do anything, but it would become useful
  // if we make props required by default
  props?: (RawProps & { [key in P]?: any }) | null,
  children?: RawChildren | RawSlots
): VNode
export function h<P>(
  type: ComponentOptionsWithObjectProps<P>,
  props?: (RawProps & ExtractPropTypes<P>) | null,
  children?: RawChildren | RawSlots
): VNode

// fake constructor type returned by `createComponent`
export function h(type: Constructor, children?: RawChildren): VNode
export function h<P>(
  type: Constructor<P>,
  props?: (RawProps & P) | null,
  children?: RawChildren | RawSlots
): VNode

// 最终函数实现，前面都是在定义函数传参
export function h(
  type: VNodeTypes,
  propsOrChildren?: any,
  children?: any
): VNode {
  if (arguments.length === 2) {
    if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
      // 没有props只有孩子vnode节点
      if (isVNode(propsOrChildren)) {
        // 如果是vnode节点
        return createVNode(type, null, [propsOrChildren])
      }
      // 没有孩子节点只有props
      return createVNode(type, propsOrChildren)
    } else {
      // 如果是其他类型则忽略props
      return createVNode(type, null, propsOrChildren)
    }
  } else {
    // 三个参数说明属性props和孩子节点都有
    if (isVNode(children)) {
      children = [children]
    }
    return createVNode(type, propsOrChildren, children)
  }
}
