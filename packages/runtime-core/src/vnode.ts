import {
  isArray,
  isFunction,
  isString,
  isObject,
  EMPTY_ARR,
  extend
} from '@vue/shared'
import {
  ComponentInternalInstance,
  Data,
  SetupProxySymbol,
  Component
} from './component'
import { RawSlots } from './componentSlots'
import { ShapeFlags } from './shapeFlags'
import { isReactive } from '@vue/reactivity'
import { AppContext } from './apiApp'
import { SuspenseBoundary } from './suspense'

export const Fragment = __DEV__ ? Symbol('Fragment') : Symbol()
export const Text = __DEV__ ? Symbol('Text') : Symbol()
export const Comment = __DEV__ ? Symbol('Comment') : Symbol()
export const Portal = __DEV__ ? Symbol('Portal') : Symbol()
export const Suspense = __DEV__ ? Symbol('Suspense') : Symbol()

export type VNodeTypes =
  | string
  | Component
  | typeof Fragment
  | typeof Portal
  | typeof Text
  | typeof Comment
  | typeof Suspense

type VNodeChildAtom<HostNode, HostElement> =
  | VNode<HostNode, HostElement>
  | string
  | number
  | boolean
  | null
  | void

// 这个接口可循环创建空的多维数组vnode
export interface VNodeChildren<HostNode = any, HostElement = any>
  extends Array<
      | VNodeChildren<HostNode, HostElement>
      | VNodeChildAtom<HostNode, HostElement>
    > {}

export type VNodeChild<HostNode = any, HostElement = any> =
  | VNodeChildAtom<HostNode, HostElement>
  | VNodeChildren<HostNode, HostElement>

export type NormalizedChildren<HostNode = any, HostElement = any> =
  | string
  | VNodeChildren<HostNode, HostElement>
  | RawSlots
  | null

export interface VNode<HostNode = any, HostElement = any> {
  _isVNode: true
  type: VNodeTypes
  props: Record<any, any> | null
  key: string | number | null
  ref: string | Function | null
  children: NormalizedChildren<HostNode, HostElement>
  component: ComponentInternalInstance | null
  suspense: SuspenseBoundary<HostNode, HostElement> | null

  // DOM
  el: HostNode | null
  anchor: HostNode | null // fragment anchor
  target: HostElement | null // portal target

  // optimization only
  shapeFlag: number
  patchFlag: number
  dynamicProps: string[] | null
  dynamicChildren: VNode[] | null

  // application root node only
  appContext: AppContext | null
}

// Since v-if and v-for are the two possible ways node structure can dynamically
// change, once we consider v-if branches and each v-for fragment a block, we
// can divide a template into nested blocks, and within each block the node
// structure would be stable. This allows us to skip most children diffing
// and only worry about the dynamic nodes (indicated by patch flags).
const blockStack: (VNode[] | null)[] = []

// Open a block.
// 这个方法必须在createBlock被调用前使用，因为块的子集是在调用createBlock本身之前被计算出来的
// 每次使用compile编译template之后就会生成这个东西
// 假设template是如此：
// <div>
//   <span>{{ state.count + 3 }}<div>ddddd{ { state.count + 1 } } </div></span >
//     <button @click="increment" >
//       Count is: { { state.count } }
//   </button>
// < /div>
// 编译会生成此函数:
// function render() {
//   with (this) {
//     const { toString: _toString, createVNode: _createVNode, createBlock: _createBlock, openBlock: _openBlock } = _Vue

//     return (_openBlock(), _createBlock("div", null, [
//       _createVNode("span", null, [
//         _toString(state.count + 3),
//         _createVNode("div", null, "ddddd" + _toString(state.count + 1), 1 /* TEXT */)
//       ]),
//       _createVNode("button", { onClick: increment }, "\n        Count is: " + _toString(state.count), 9 /* TEXT, PROPS */, ["onClick"])
//     ]))
//   }
// disableTracking is true when creating a fragment block, since a fragment
// always diffs its children.
// 当创建一个碎片块的时候使用，因为碎片块总需要diffs它的子节点
// 碎片快其实就是动态节点块例如使用动态属性的节点使用v-for、v-if或者绑定事件等都需要触发此方法创建代码块
export function openBlock(disableTracking?: boolean) {
  blockStack.push(disableTracking ? null : [])
}

let shouldTrack = true

// 用来创建根vnode，参数和createVNode一样
// A block root keeps track of dynamic nodes within the block in the
// `dynamicChildren` array.
export function createBlock(
  type: VNodeTypes,
  props?: { [key: string]: any } | null,
  children?: any,
  patchFlag?: number,
  dynamicProps?: string[]
): VNode {
  // avoid a block with optFlag tracking itself
  shouldTrack = false
  const vnode = createVNode(type, props, children, patchFlag, dynamicProps)
  shouldTrack = true
  const trackedNodes = blockStack.pop()
  vnode.dynamicChildren =
    trackedNodes && trackedNodes.length ? trackedNodes : EMPTY_ARR
  // a block is always going to be patched
  trackDynamicNode(vnode)
  return vnode
}

export function isVNode(value: any): value is VNode {
  return value ? value._isVNode === true : false
}

export function createVNode(
  type: VNodeTypes,
  props: { [key: string]: any } | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null
): VNode {
  // class & style序列化
  if (props !== null) {
    // 对于reactive和proxy代理对象我们去除代理得到纯对象
    if (isReactive(props) || SetupProxySymbol in props) {
      props = extend({}, props)
    }
    if (props.class != null) {
      props.class = normalizeClass(props.class)
    }
    let { style } = props
    if (style != null) {
      // reactive state objects need to be cloned since they are likely to be
      // mutated
      if (isReactive(style) && !isArray(style)) {
        // 去掉对象的proxy代理
        style = extend({}, style)
      }
      props.style = normalizeStyle(style)
    }
  }
  // encode the vnode type information into a bitmap
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : isObject(type)
      ? ShapeFlags.STATEFUL_COMPONENT
      : isFunction(type)
        ? ShapeFlags.FUNCTIONAL_COMPONENT
        : 0
  const vnode: VNode = {
    _isVNode: true,
    type,
    props,
    key: (props && props.key) || null,
    ref: (props && props.ref) || null,
    children: null,
    component: null,
    suspense: null,
    el: null,
    anchor: null,
    target: null,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null
  }

  normalizeChildren(vnode, children)

  // presence of a patch flag indicates this node needs patching on updates.
  // 存在修补程序标志表示此节点需要在更新时修补
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  // 如果是动态节点块则需要保存动态节点块到blockStack上
  if (
    shouldTrack &&
    (patchFlag ||
      shapeFlag & ShapeFlags.STATEFUL_COMPONENT ||
      shapeFlag & ShapeFlags.FUNCTIONAL_COMPONENT)
  ) {
    trackDynamicNode(vnode)
  }

  return vnode
}
// 在触发此方法之前必然运行openBlock方法插入一个空数组
function trackDynamicNode(vnode: VNode) {
  const currentBlockDynamicNodes = blockStack[blockStack.length - 1]
  if (currentBlockDynamicNodes != null) {
    currentBlockDynamicNodes.push(vnode)
  }
}

export function cloneVNode(vnode: VNode): VNode {
  return {
    _isVNode: true,
    type: vnode.type,
    props: vnode.props,
    key: vnode.key,
    ref: vnode.ref,
    children: vnode.children,
    target: vnode.target,
    shapeFlag: vnode.shapeFlag,
    patchFlag: vnode.patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,

    // these should be set to null since they should only be present on
    // mounted VNodes. If they are somehow not null, this means we have
    // encountered an already-mounted vnode being used again.
    component: null,
    suspense: null,
    el: null,
    anchor: null
  }
}

export function normalizeVNode(child: VNodeChild): VNode {
  if (child == null) {
    // empty placeholder
    return createVNode(Comment)
  } else if (isArray(child)) {
    // fragment
    return createVNode(Fragment, null, child)
  } else if (typeof child === 'object') {
    // already vnode, this should be the most common since compiled templates
    // always produce all-vnode children arrays
    return child.el === null ? child : cloneVNode(child)
  } else {
    // primitive types
    return createVNode(Text, null, child + '')
  }
}

export function normalizeChildren(vnode: VNode, children: unknown) {
  let type = 0
  if (children == null) {
    children = null
  } else if (isArray(children)) {
    type = ShapeFlags.ARRAY_CHILDREN
  } else if (typeof children === 'object') {
    type = ShapeFlags.SLOTS_CHILDREN
  } else if (isFunction(children)) {
    children = { default: children }
    type = ShapeFlags.SLOTS_CHILDREN
  } else {
    children = isString(children) ? children : children + ''
    type = ShapeFlags.TEXT_CHILDREN
  }
  vnode.children = children as NormalizedChildren
  vnode.shapeFlag |= type
}

function normalizeStyle(
  value: unknown
): Record<string, string | number> | void {
  if (isArray(value)) {
    const res: Record<string, string | number> = {}
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeStyle(value[i])
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key]
        }
      }
    }
    return res
  } else if (isObject(value)) {
    return value
  }
}

export function normalizeClass(value: unknown): string {
  let res = ''
  if (isString(value)) {
    res = value
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      res += normalizeClass(value[i]) + ' '
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}

const handlersRE = /^on|^vnode/

export function mergeProps(...args: Data[]) {
  const ret: Data = {}
  extend(ret, args[0])
  for (let i = 1; i < args.length; i++) {
    const toMerge = args[i]
    for (const key in toMerge) {
      if (key === 'class') {
        ret.class = normalizeClass([ret.class, toMerge.class])
      } else if (key === 'style') {
        ret.style = normalizeStyle([ret.style, toMerge.style])
      } else if (handlersRE.test(key)) {
        // on*, vnode*
        const existing = ret[key]
        ret[key] = existing
          ? [].concat(existing as any, toMerge[key] as any)
          : toMerge[key]
      } else {
        ret[key] = toMerge[key]
      }
    }
  }
  return ret
}
