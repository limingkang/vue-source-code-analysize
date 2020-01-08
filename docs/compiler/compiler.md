# 编译函数

## 相比vue2的优化点
最终生成的编译函数其实就是调用compiler-dom/src/index.ts里面的compile方法
``` js
export function compile(
  template: string,
  options: CompilerOptions = {}
): CodegenResult {
  return baseCompile(template, {
    ...options,
    ...(__BROWSER__ ? parserOptionsMinimal : parserOptionsStandard),
    nodeTransforms: [transformStyle, ...(options.nodeTransforms || [])],
    directiveTransforms: {
      cloak: transformCloak,  // 根据浏览器实现特定的指令编译方法，传给核心编译函数
      html: transformVHtml,
      text: transformVText,
      model: transformModel, // override compiler-core
      on: transformOn,
      ...(options.directiveTransforms || {})
    }
  })
}
```

核心的编译函数compiler-core文件夹下面目录结构：
- tests 测试用例
- src/ast ts语法的大佬的类型定义，比如type，enum，interface等
- src/codegen 将生成的ast转换成render字符串
- src/errors 定义 compiler 错误类型
- src/index 入口文件，主要有一个 baseCompile ，用来编译模板文件的
- src/parse 将模板字符串转换成 AST
- src/runtimeHelper 生成code的时候的定义常量对应关系
- src/transform 处理 AST 中的 vue 特有语法，比如 v-if ,v-on 的解析

``` js
// 可以运行一个简单的例子
const source = <div id="test" :class="cls">
        <span>{{ name }}</span>
        <MyCom></MyCom>
    </div>.trim()
import { parse } from './compiler-core.cjs'
const result = parse(source)
```
一个简单的转换结果就呈现出来了，从生成的结构来看，相对于vue2.x有几个比较重要的变化：
- 新增了 loc 属性 每一个节点都记录了该节点在源码当中的 start 和 end，标识了代码的详细位置，column,line,offset,
vu3.0对于开发遇到的问题都要详细的日志输出也基于此，另外支持 source-map
- 新增了 tagType 属性,tagType 属性标识该节点是什么类型的。我们知道 vue2.x 判断节点类型是运行时才有的，vu3.0将
判断提前到编译阶段了，提升了性能;目前tagType有三种类型：0 element,1 component,2 slot,3 template
- 新增 isStatic 属性将模板提前编译好，标识是否为动态变化的，比如动态指令

新版的 AST 明显比 vue2.x 要复杂些，可以看到vue3.0将很多可以在编译阶段就能确定的就在编译阶段确定，标识编译结果，不
需要等到运行时再去判断，节省内存和性能。这个也是尤大大重点说了的，优化编译，提升性能,转换的代码，主要有如下几个方法：
- parse & parseChildren 主入口
- parseTag 处理标签
- parseAttribute 处理标签上的属性
- parseElement 处理起始标签
- parseInterpolation 处理动态文本内容
- parseText 处理静态文本内容



## 整体编译流程
上面说到最终的编译方法其实就是调用compiler-core/index.ts下的baseCompile方法
``` js
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
```


## transform方法的实现
``` js
// 大概的简化方法
function createTransformContext(
  root: RootNode,
  {
    prefixIdentifiers = false,
    hoistStatic = false,   //标记是否是静态节点
    nodeTransforms = [],
    directiveTransforms = {},
    onError = defaultOnError
  }: TransformOptions
): TransformContext {
  const context: TransformContext = {
    root,
    helpers: new Set(),
    components: new Set(),
    directives: new Set(),
    hoists: [],
    identifiers: {},
    scopes: {
      vFor: 0,
      vSlot: 0,
      vPre: 0,
      vOnce: 0
    },
    prefixIdentifiers,
    hoistStatic,
    nodeTransforms,
    directiveTransforms,
    onError,
    parent: null,
    currentNode: root,
    childIndex: 0,
    helper(name) {   //保存编译时候需要使用的vue的方法的映射
      context.helpers.add(name)
      return name
    },
    // 当有静态节点时候内部保存变量就是_hoisted_1慢慢往后加
    hoist(exp) {
      context.hoists.push(exp)
      return createSimpleExpression(
        `_hoisted_${context.hoists.length}`,
        false,
        exp.loc
      )
    }
  }
}
export function transform(root: RootNode, options: TransformOptions) {
  // 创建总节点上下文
  const context = createTransformContext(root, options)
  // 方法内部编译所有节点
  traverseNode(root, context)
  if (options.hoistStatic) {
    // 静态节点标记
    hoistStatic(root, context)
  }
  finalizeRoot(root, context)
}
export function traverseNode(
  node: RootNode | TemplateChildNode,
  context: TransformContext
) {
  // 该方法循环会触发多次，一层层往下遍历解析编译
  // 获取所有编译指令的方法，如编译if on等指令
  const { nodeTransforms } = context
  const exitFns = []
  for (let i = 0; i < nodeTransforms.length; i++) {
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      if (isArray(onExit)) {
        exitFns.push(...onExit)
      } else {
        exitFns.push(onExit)
      }
    }
    if (!context.currentNode) {
      // node was removed
      return
    } else {
      // 编译解析子children节点，在traverseChildren方法里面会赋值
      node = context.currentNode
    }
  }
  // 文本节点时候就不会走进switch方法，而且上面的exitFns为空
  switch (node.type) {
    case NodeTypes.COMMENT:
      // inject import for the Comment symbol, which is needed for creating
      // comment nodes with `createVNode`
      context.helper(CREATE_VNODE)
      context.helper(COMMENT)
      break
    case NodeTypes.INTERPOLATION:
      // no need to traverse, but we need to inject toString helper
      context.helper(TO_STRING)
      break

    // if容器类型，进一步遍历他的分支
    case NodeTypes.IF:
      for (let i = 0; i < node.branches.length; i++) {
        // 内部还是调用traverseNode方法
        traverseChildren(node.branches[i], context)
      }
      break
    case NodeTypes.FOR:
    case NodeTypes.ELEMENT:
    case NodeTypes.ROOT:
      traverseChildren(node, context)
      break
  }

  // exit transforms
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}
```
静态节点标记的方法hoistStatic.ts
``` js
export function hoistStatic(root: RootNode, context: TransformContext) {
  walk(
    root.children,
    context,
    new Map(),
    isSingleElementRoot(root, root.children[0])
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
        isStaticNode(child, resultCache) &&   //彻底检查一个节点是否是纯静态节点
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
```



## generate方法实现
``` js
export function generate(
  ast: RootNode,
  options: CodegenOptions = {}
): CodegenResult {
  const context = createCodegenContext(ast, options)
  const {
    mode,
    push,
    helper,
    prefixIdentifiers,
    indent,
    deindent,
    newline
  } = context
  const hasHelpers = ast.helpers.length > 0
  const useWithBlock = !prefixIdentifiers && mode !== 'module'

  // 根据最终需要的编译模式倒入不同字符串
  if (mode === 'function') {
    // Generate const declaration for helpers
    // In prefix mode, we place the const declaration at top so it's done
    // only once; But if we not prefixing, we place the declaration inside the
    // with block so it doesn't incur the `in` check cost for every helper access.
    if (hasHelpers) {
      if (prefixIdentifiers) {
        push(`const { ${ast.helpers.map(helper).join(', ')} } = Vue\n`)
      } else {
        // "with" mode.
        // 保存独立的vue映射避免冲突
        push(`const _Vue = Vue\n`)
        // in "with" mode, helpers are declared inside the with block to avoid
        // has check cost, but hoists are lifted out of the function - we need
        // to provide the helper here.
        // 给静态资源提供编译方法createVNode,因为它被从function抽离了出来需要单独提供
        if (ast.hoists.length) {
          push(`const _${helperNameMap[CREATE_VNODE]} = Vue.createVNode\n`)
          if (ast.helpers.includes(COMMENT)) {
            push(`const _${helperNameMap[COMMENT]} = Vue.Comment\n`)
          }
        }
      }
    }
    genHoists(ast.hoists, context)
    newline()
    push(`return `)
  } else {
    // 支持模块化使用的是import export
    if (hasHelpers) {
      push(`import { ${ast.helpers.map(helper).join(', ')} } from "vue"\n`)
    }
    genHoists(ast.hoists, context)
    newline()
    push(`export default `)
  }

  // 打入渲染函数
  push(`function render() {`)
  indent()

  if (useWithBlock) {
    push(`with (this) {`)
    indent()
    // function mode const declarations should be inside with block
    // also they should be renamed to avoid collision with user properties
    if (hasHelpers) {
      push(
        `const { ${ast.helpers
          .map(s => `${helperNameMap[s]}: _${helperNameMap[s]}`)
          .join(', ')} } = _Vue`
      )
      newline()
      newline()
    }
  } else {
    push(`const _ctx = this`)
    newline()
  }
  // generate asset resolution statements
  if (ast.components.length) {
    genAssets(ast.components, 'component', context)
  }
  if (ast.directives.length) {
    genAssets(ast.directives, 'directive', context)
  }
  if (ast.components.length || ast.directives.length) {
    newline()
  }

  // 解析整个vnode树表达式，生成最终的运行方法
  push(`return `)
  if (ast.codegenNode) {
    genNode(ast.codegenNode, context)
  } else {
    push(`null`)
  }

  if (useWithBlock) {
    deindent()
    push(`}`)
  }

  deindent()
  push(`}`)
  return {
    ast,
    code: context.code,
    map: context.map ? context.map.toJSON() : undefined
  }
}
```
















