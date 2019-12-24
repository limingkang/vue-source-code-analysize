import { NodeTransform } from '../transform'
import {
  NodeTypes,
  TemplateChildNode,
  TextNode,
  InterpolationNode,
  CompoundExpressionNode
} from '../ast'

const isText = (
  node: TemplateChildNode
): node is TextNode | InterpolationNode =>
  node.type === NodeTypes.INTERPOLATION || node.type === NodeTypes.TEXT

// 合并临近的文本节点和表达式为一个单独表达式
// e.g. <div>abc {{ d }} {{ e }}</div> should have a single expression node as child.
export const optimizeText: NodeTransform = node => {
  if (node.type === NodeTypes.ROOT || node.type === NodeTypes.ELEMENT) {
    // 执行所有节点最终出口，保证所有表达式都已经被处理
    return () => {
      const children = node.children
      let currentContainer: CompoundExpressionNode | undefined = undefined
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child)) {
          for (let j = i + 1; j < children.length; j++) {
            const next = children[j]
            if (isText(next)) {
              if (!currentContainer) {
                currentContainer = children[i] = {
                  type: NodeTypes.COMPOUND_EXPRESSION,
                  loc: child.loc,
                  children: [child]
                }
              }
              // merge adjacent text node into current
              currentContainer.children.push(` + `, next)
              children.splice(j, 1)
              j--
            } else {
              currentContainer = undefined
              break
            }
          }
        }
      }
    }
  }
}
