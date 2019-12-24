import { parse, ParserOptions } from './parse'
import { transform, TransformOptions } from './transform'
import { generate, CodegenOptions, CodegenResult } from './codegen'
import { RootNode } from './ast'
import { isString } from '@vue/shared'
import { transformIf } from './transforms/vIf'
import { transformFor } from './transforms/vFor'
import { transformExpression } from './transforms/transformExpression'
import { transformSlotOutlet } from './transforms/transformSlotOutlet'
import { transformElement } from './transforms/transformElement'
import { transformOn } from './transforms/vOn'
import { transformBind } from './transforms/vBind'
import { defaultOnError, createCompilerError, ErrorCodes } from './errors'
import { trackSlotScopes, trackVForSlotScopes } from './transforms/vSlot'
import { optimizeText } from './transforms/optimizeText'
import { transformOnce } from './transforms/vOnce'
import { transformModel } from './transforms/vModel'

export type CompilerOptions = ParserOptions & TransformOptions & CodegenOptions

// vue在运行时候使用的编译函数compile就是这个方法
export function baseCompile(
  template: string | RootNode,
  options: CompilerOptions = {}
): CodegenResult {
  /* istanbul ignore if */
  if (__BROWSER__) {
    const onError = options.onError || defaultOnError
    if (options.prefixIdentifiers === true) {
      onError(createCompilerError(ErrorCodes.X_PREFIX_ID_NOT_SUPPORTED))
    } else if (options.mode === 'module') {
      onError(createCompilerError(ErrorCodes.X_MODULE_MODE_NOT_SUPPORTED))
    }
  }
  // 词法解析
  const ast = isString(template) ? parse(template, options) : template
  const prefixIdentifiers =
    !__BROWSER__ &&
    (options.prefixIdentifiers === true || options.mode === 'module')
  // 对这个抽象语法树进行静态节点的标记，这样就可以优化渲染过程
  // 优化器的目的就是去找出 AST 中纯静态的子树：
  // 把纯静态子树提升为常量，每次重新渲染的时候就不需要创建新的节点了
  // 并且要翻译if on等自定义的指令
  transform(ast, {
    ...options,
    prefixIdentifiers,
    nodeTransforms: [
      transformIf,
      transformFor,
      ...(prefixIdentifiers
        ? [
            // order is important
            trackVForSlotScopes,
            transformExpression
          ]
        : []),
      transformSlotOutlet,
      transformElement,
      trackSlotScopes,
      optimizeText,
      ...(options.nodeTransforms || []) // user transforms
    ],
    directiveTransforms: {
      on: transformOn,
      bind: transformBind,
      once: transformOnce,
      model: transformModel,
      ...(options.directiveTransforms || {}) // user transforms
    }
  })
  // 根据 AST 生成一个 render 函数字符串
  return generate(ast, {
    ...options,
    prefixIdentifiers
  })
}

// Also expose lower level APIs & types
export { parse, ParserOptions, TextModes } from './parse'
export {
  transform,
  createStructuralDirectiveTransform,
  TransformOptions,
  TransformContext,
  NodeTransform,
  StructuralDirectiveTransform,
  DirectiveTransform
} from './transform'
export {
  generate,
  CodegenOptions,
  CodegenContext,
  CodegenResult
} from './codegen'
export {
  ErrorCodes,
  CoreCompilerError,
  CompilerError,
  createCompilerError
} from './errors'
export * from './ast'
export * from './utils'
export * from './codeframe'
export { registerRuntimeHelpers } from './runtimeHelpers'

// expose transforms so higher-order compilers can import and extend them
export { transformModel } from './transforms/vModel'
export { transformOn } from './transforms/vOn'