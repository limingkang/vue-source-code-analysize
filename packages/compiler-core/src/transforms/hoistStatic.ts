import {
  RootNode,
  NodeTypes,
  TemplateChildNode,
  SimpleExpressionNode,
  ElementTypes,
  ElementCodegenNode,
  PlainElementNode,
  ComponentNode,
  TemplateNode,
  ElementNode
} from '../ast'
import { TransformContext } from '../transform'
import { APPLY_DIRECTIVES } from '../runtimeHelpers'
import { PatchFlags, isString, isSymbol } from '@vue/shared'
import { isSlotOutlet, findProp } from '../utils'

function hasDynamicKeyOrRef(node: ElementNode) {
  return findProp(node, 'key', true) || findProp(node, 'ref', true)
}

export function hoistStatic(root: RootNode, context: TransformContext) {
  walk(
    root.children,
    context,
    new Map(),
    isSingleElementRoot(root, root.children[0])
  )
}

export function isSingleElementRoot(
  root: RootNode,
  child: TemplateChildNode
): child is PlainElementNode | ComponentNode | TemplateNode {
  const { children } = root
  return (
    children.length === 1 &&
    child.type === NodeTypes.ELEMENT &&
    !isSlotOutlet(child)
  )
}

function walk(
  children: TemplateChildNode[],
  context: TransformContext,
  resultCache: Map<TemplateChildNode, boolean>,
  doNotHoistNode: boolean = false
) {
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    // only plain elements are eligible for hoisting.
    // 只有标签节点才可能是静态的, 这里循环处理动态节点，保存到上下文context的hoist上
    if (
      child.type === NodeTypes.ELEMENT &&
      child.tagType === ElementTypes.ELEMENT
    ) {
      if (
        !doNotHoistNode &&
        isStaticNode(child, resultCache) &&
        !hasDynamicKeyOrRef(child)
      ) {
        // 如果整个节点是静止的，那么将其原始的codegenNode保存在上下文的context上
        child.codegenNode = context.hoist(child.codegenNode!)
        continue
      } else {
        // 节点可能包含动态子节点，但是他的props属性或许可以是静态的
        const flag = getPatchFlag(child)
        if (
          (!flag ||
            flag === PatchFlags.NEED_PATCH ||
            flag === PatchFlags.TEXT) &&
          !hasDynamicKeyOrRef(child)
        ) {
          let codegenNode = child.codegenNode as ElementCodegenNode
          if (codegenNode.callee === APPLY_DIRECTIVES) {
            codegenNode = codegenNode.arguments[0]
          }
          const props = codegenNode.arguments[1]
          if (props && props !== `null`) {
            codegenNode.arguments[1] = context.hoist(props)
          }
        }
      }
    }
    if (child.type === NodeTypes.ELEMENT) {
      walk(child.children, context, resultCache)
    } else if (child.type === NodeTypes.FOR) {
      // Do not hoist v-for single child because it has to be a block
      walk(child.children, context, resultCache, child.children.length === 1)
    } else if (child.type === NodeTypes.IF) {
      for (let i = 0; i < child.branches.length; i++) {
        const branchChildren = child.branches[i].children
        // Do not hoist v-if single child because it has to be a block
        // 有单个子节点的v-if不要做静态标注
        walk(branchChildren, context, resultCache, branchChildren.length === 1)
      }
    }
  }
}

function getPatchFlag(node: PlainElementNode): number | undefined {
  // 例如：<button @click="increment" v -if= "state.show" >
  //   Count is: { { state.count } }
  // </button>
  // 则对应的flag为字符串   9 /* TEXT, PROPS */  parseInt之后为9
  let codegenNode = node.codegenNode as ElementCodegenNode
  if (codegenNode.callee === APPLY_DIRECTIVES) {
    codegenNode = codegenNode.arguments[0]
  }
  const flag = codegenNode.arguments[3]
  return flag ? parseInt(flag, 10) : undefined
}
// 彻底检查一个节点是否是纯静态节点
export function isStaticNode(
  node: TemplateChildNode | SimpleExpressionNode,
  resultCache: Map<TemplateChildNode, boolean> = new Map()
): boolean {
  switch (node.type) {
    case NodeTypes.ELEMENT:
      if (node.tagType !== ElementTypes.ELEMENT) {
        return false
      }
      const cached = resultCache.get(node)
      if (cached !== undefined) {
        return cached
      }
      const flag = getPatchFlag(node)
      if (!flag) {
        // 元素自身是静态的就检查他的子节点是否是静态的
        for (let i = 0; i < node.children.length; i++) {
          if (!isStaticNode(node.children[i], resultCache)) {
            resultCache.set(node, false)
            return false
          }
        }
        resultCache.set(node, true)
        return true
      } else {
        return false
      }
    case NodeTypes.TEXT:
    case NodeTypes.COMMENT:
      return true
    case NodeTypes.IF:
    case NodeTypes.FOR:
      return false
    case NodeTypes.INTERPOLATION:
      return isStaticNode(node.content, resultCache)
    case NodeTypes.SIMPLE_EXPRESSION:
      return node.isConstant
    case NodeTypes.COMPOUND_EXPRESSION:
      return node.children.every(child => {
        return (
          isString(child) || isSymbol(child) || isStaticNode(child, resultCache)
        )
      })
    default:
      if (__DEV__) {
        const exhaustiveCheck: never = node
        exhaustiveCheck
      }
      return false
  }
}
