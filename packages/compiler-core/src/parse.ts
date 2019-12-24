import { NO } from '@vue/shared'
import {
  ErrorCodes,
  createCompilerError,
  defaultOnError,
  CompilerError
} from './errors'
import {
  assert,
  advancePositionWithMutation,
  advancePositionWithClone
} from './utils'
import {
  Namespace,
  Namespaces,
  AttributeNode,
  CommentNode,
  DirectiveNode,
  ElementNode,
  ElementTypes,
  ExpressionNode,
  NodeTypes,
  Position,
  RootNode,
  SourceLocation,
  TextNode,
  TemplateChildNode,
  InterpolationNode
} from './ast'
import { extend } from '@vue/shared'

export interface ParserOptions {
  isVoidTag?: (tag: string) => boolean // e.g. img, br, hr
  isNativeTag?: (tag: string) => boolean // e.g. loading-indicator in weex
  isCustomElement?: (tag: string) => boolean
  getNamespace?: (tag: string, parent: ElementNode | undefined) => Namespace
  getTextMode?: (tag: string, ns: Namespace) => TextModes
  delimiters?: [string, string] // ['{{', '}}']
  ignoreSpaces?: boolean

  // Map to HTML entities. E.g., `{ "amp;": "&" }`
  // The full set is https://html.spec.whatwg.org/multipage/named-characters.html#named-character-references
  namedCharacterReferences?: { [name: string]: string | undefined }

  onError?: (error: CompilerError) => void
}

// `isNativeTag` is optional, others are required
type MergedParserOptions = Omit<Required<ParserOptions>, 'isNativeTag'> &
  Pick<ParserOptions, 'isNativeTag'>

export const defaultParserOptions: MergedParserOptions = {
  delimiters: [`{{`, `}}`],
  ignoreSpaces: true,
  getNamespace: () => Namespaces.HTML,
  getTextMode: () => TextModes.DATA,
  isVoidTag: NO,
  isCustomElement: NO,
  namedCharacterReferences: {
    'gt;': '>',
    'lt;': '<',
    'amp;': '&',
    'apos;': "'",
    'quot;': '"'
  },
  onError: defaultOnError
}

export const enum TextModes {
  //          | Elements | Entities | End sign              | Inside of
  DATA, //    | ✔       | ✔       | End tags of ancestors |
  RCDATA, //  | ✘       | ✔       | End tag of the parent | <textarea>
  RAWTEXT, // | ✘       | ✘       | End tag of the parent | <style>,<script>
  CDATA,
  ATTRIBUTE_VALUE
}

interface ParserContext {
  options: MergedParserOptions
  readonly originalSource: string
  source: string
  offset: number
  line: number
  column: number
  maxCRNameLength: number
  inPre: boolean
}
// parse 的主入口，这里创建了一个 parseContext，有利于后续直接从 context 上拿到 content，options 等。
// getCursor 获取当前处理的指针位置，用户生成 loc, 初始都是1
export function parse(content: string, options: ParserOptions = {}): RootNode {
  const context = createParserContext(content, options)
  const start = getCursor(context)

  return {
    type: NodeTypes.ROOT,
    children: parseChildren(context, TextModes.DATA, []),
    helpers: [],
    components: [],
    directives: [],
    hoists: [],
    codegenNode: undefined,
    loc: getSelection(context, start)
  }
}

function createParserContext(
  content: string,
  options: ParserOptions
): ParserContext {
  return {
    options: {
      ...defaultParserOptions,
      ...options
    },
    column: 1,
    line: 1,
    offset: 0,
    originalSource: content,
    source: content,
    maxCRNameLength: Object.keys(
      options.namedCharacterReferences ||
        defaultParserOptions.namedCharacterReferences
    ).reduce((max, name) => Math.max(max, name.length), 0),
    inPre: false
  }
}

function parseChildren(
  context: ParserContext,
  mode: TextModes,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  //ancestors 用来存储未匹配的起始节点，为后进先出的stack
  const parent = last(ancestors)
  const ns = parent ? parent.ns : Namespaces.HTML
  const nodes: TemplateChildNode[] = []
  // 循环处理 source，循环截止条件是 isEnd 方法返回true，即是处理完成了，结束有两个条件：
  // 1.context.source为空，即整个模板都处理完成
  // 2.碰到截止节点标签(</)，且能在未匹配的起始标签（ancestors）里面找到对对应的tag。这个对应 parseChildren 的子节点处理完成。
  while (!isEnd(context, mode, ancestors)) {
    __DEV__ && assert(context.source.length > 0)
    const s = context.source
    let node: TemplateChildNode | TemplateChildNode[] | undefined = undefined

    if (!context.inPre && startsWith(s, context.options.delimiters[0])) {
      //delimiters 是分割符合，vue 是 {{ 和 }} 。开始匹配到vue的文本输出内容 {{ ，则意味着需要处理 文本内容插入
      // '{{'
      node = parseInterpolation(context, mode)
    } else if (mode === TextModes.DATA && s[0] === '<') {
      //内容是已 < 开头，即 html 标签的标识符号，则开始处理起始标签和截止标签两种情况
      // https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state
      if (s.length === 1) {
        emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 1)
      } else if (s[1] === '!') {
        // https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state
        if (startsWith(s, '<!--')) {
          node = parseComment(context)
        } else if (startsWith(s, '<!DOCTYPE')) {
          // Ignore DOCTYPE by a limitation.
          node = parseBogusComment(context)
        } else if (startsWith(s, '<![CDATA[')) {
          if (ns !== Namespaces.HTML) {
            node = parseCDATA(context, ancestors)
          } else {
            emitError(context, ErrorCodes.CDATA_IN_HTML_CONTENT)
            node = parseBogusComment(context)
          }
        } else {
          emitError(context, ErrorCodes.INCORRECTLY_OPENED_COMMENT)
          node = parseBogusComment(context)
        }
      } else if (s[1] === '/') {
        // 第二个字符是 "/"
        // 对应的就是 </
        // 如果是 </> ，那么认为是一个无效标签，直接 advanceBy 后移 3 个字符即可。
        // 如果是 </a，那么认为是一个截止标签，执行 parseTag 方法处理
        // https://html.spec.whatwg.org/multipage/parsing.html#end-tag-open-state
        if (s.length === 2) {
          emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 2)
        } else if (s[2] === '>') {
          emitError(context, ErrorCodes.MISSING_END_TAG_NAME, 2)
          advanceBy(context, 3)
          continue
        } else if (/[a-z]/i.test(s[2])) {
          emitError(context, ErrorCodes.X_INVALID_END_TAG)
          parseTag(context, TagType.End, parent)
          continue
        } else {
          emitError(context, ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME, 2)
          node = parseBogusComment(context)
        }
      } else if (/[a-z]/i.test(s[1])) {
        // 第二个字符是字母
        // 对应就是标签的起始文字了，如 <\div，执行 parseElement 方法处理起始标签
        node = parseElement(context, ancestors)
      } else if (s[1] === '?') {
        emitError(
          context,
          ErrorCodes.UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME,
          1
        )
        node = parseBogusComment(context)
      } else {
        emitError(context, ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME, 1)
      }
    }
    //以上条件都不是，或者匹配未成功那么就是动态文本内容了
    if (!node) {
      node = parseText(context, mode)
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        pushNode(context, nodes, node[i])
      }
    } else {
      pushNode(context, nodes, node)
    }
  }

  return nodes
}

function pushNode(
  context: ParserContext,
  nodes: TemplateChildNode[],
  node: TemplateChildNode
): void {
  // ignore comments in production
  /* istanbul ignore next */
  if (!__DEV__ && node.type === NodeTypes.COMMENT) {
    return
  }
  if (
    context.options.ignoreSpaces &&
    node.type === NodeTypes.TEXT &&
    node.isEmpty
  ) {
    return
  }

  // Merge if both this and the previous node are text and those are consecutive.
  // This happens on "a < b" or something like.
  const prev = last(nodes)
  if (
    prev &&
    prev.type === NodeTypes.TEXT &&
    node.type === NodeTypes.TEXT &&
    prev.loc.end.offset === node.loc.start.offset
  ) {
    prev.content += node.content
    prev.isEmpty = prev.content.trim().length === 0
    prev.loc.end = node.loc.end
    prev.loc.source += node.loc.source
  } else {
    nodes.push(node)
  }
}

function parseCDATA(
  context: ParserContext,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  __DEV__ &&
    assert(last(ancestors) == null || last(ancestors)!.ns !== Namespaces.HTML)
  __DEV__ && assert(startsWith(context.source, '<![CDATA['))

  advanceBy(context, 9)
  const nodes = parseChildren(context, TextModes.CDATA, ancestors)
  if (context.source.length === 0) {
    emitError(context, ErrorCodes.EOF_IN_CDATA)
  } else {
    __DEV__ && assert(startsWith(context.source, ']]>'))
    advanceBy(context, 3)
  }

  return nodes
}

function parseComment(context: ParserContext): CommentNode {
  __DEV__ && assert(startsWith(context.source, '<!--'))

  const start = getCursor(context)
  let content: string

  // Regular comment.
  const match = /--(\!)?>/.exec(context.source)
  if (!match) {
    content = context.source.slice(4)
    advanceBy(context, context.source.length)
    emitError(context, ErrorCodes.EOF_IN_COMMENT)
  } else {
    if (match.index <= 3) {
      emitError(context, ErrorCodes.ABRUPT_CLOSING_OF_EMPTY_COMMENT)
    }
    if (match[1]) {
      emitError(context, ErrorCodes.INCORRECTLY_CLOSED_COMMENT)
    }
    content = context.source.slice(4, match.index)

    // Advancing with reporting nested comments.
    const s = context.source.slice(0, match.index)
    let prevIndex = 1,
      nestedIndex = 0
    while ((nestedIndex = s.indexOf('<!--', prevIndex)) !== -1) {
      advanceBy(context, nestedIndex - prevIndex + 1)
      if (nestedIndex + 4 < s.length) {
        emitError(context, ErrorCodes.NESTED_COMMENT)
      }
      prevIndex = nestedIndex + 1
    }
    advanceBy(context, match.index + match[0].length - prevIndex + 1)
  }

  return {
    type: NodeTypes.COMMENT,
    content,
    loc: getSelection(context, start)
  }
}

function parseBogusComment(context: ParserContext): CommentNode | undefined {
  __DEV__ && assert(/^<(?:[\!\?]|\/[^a-z>])/i.test(context.source))

  const start = getCursor(context)
  const contentStart = context.source[1] === '?' ? 1 : 2
  let content: string

  const closeIndex = context.source.indexOf('>')
  if (closeIndex === -1) {
    content = context.source.slice(contentStart)
    advanceBy(context, context.source.length)
  } else {
    content = context.source.slice(contentStart, closeIndex)
    advanceBy(context, closeIndex + 1)
  }

  return {
    type: NodeTypes.COMMENT,
    content,
    loc: getSelection(context, start)
  }
}

function parseElement(
  context: ParserContext,
  ancestors: ElementNode[]
): ElementNode | undefined {
  __DEV__ && assert(/^<[a-z]/i.test(context.source))

  // Start tag.
  const wasInPre = context.inPre
  const parent = last(ancestors)
  //parseElement 处理起始标签，我们先执行 parseTag 解析标签，获取到起始节点的 标签元素和属性
  const element = parseTag(context, TagType.Start, parent)
  const isPreBoundary = context.inPre && !wasInPre
  //如果当前也是截止标签，则直接返回该标签
  if (element.isSelfClosing || context.options.isVoidTag(element.tag)) {
    return element
  }

  // 将起始标签 push 到未匹配的起始 ancestors栈里面
  ancestors.push(element)
  const mode = context.options.getTextMode(element.tag, element.ns)
  //然后继续去处理子元素 parseChildren ,注意，将未匹配的 ancestors 传进去了
  const children = parseChildren(context, mode, ancestors)
  ancestors.pop()

  element.children = children

  // End tag.
  if (startsWithEndTagOpen(context.source, element.tag)) {
    parseTag(context, TagType.End, parent)
  } else {
    emitError(context, ErrorCodes.X_MISSING_END_TAG)
    if (context.source.length === 0 && element.tag.toLowerCase() === 'script') {
      const first = children[0]
      if (first && startsWith(first.loc.source, '<!--')) {
        emitError(context, ErrorCodes.EOF_IN_SCRIPT_HTML_COMMENT_LIKE_TEXT)
      }
    }
  }

  element.loc = getSelection(context, element.loc.start)

  if (isPreBoundary) {
    context.inPre = false
  }
  return element
}

const enum TagType {
  Start,
  End
}

/**
 * Parse a tag (E.g. `<div id=a>`) with that type (start tag or end tag).
 */
function parseTag(
  context: ParserContext,
  type: TagType,
  parent: ElementNode | undefined
): ElementNode {
  __DEV__ && assert(/^<\/?[a-z]/i.test(context.source))
  __DEV__ &&
    assert(
      type === (startsWith(context.source, '</') ? TagType.End : TagType.Start)
    )

  // Tag open.
  const start = getCursor(context)
  //匹配 <\div>
  //执行方法后面的！，是ts语法，相当于告诉ts，这里一定会有值，无需做空判断
  const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source)!
  const tag = match[1]  //mathch[1] 即匹配到的标签元素
  const ns = context.options.getNamespace(tag, parent)
  //去掉起始 < 和标签名之后
  advanceBy(context, match[0].length)
  advanceSpaces(context)

  // save current state in case we need to re-parse attributes with v-pre
  const cursor = getCursor(context)
  const currentSource = context.source

  // Attributes.
  let props = parseAttributes(context, type)

  // check v-pre
  if (
    !context.inPre &&
    props.some(p => p.type === NodeTypes.DIRECTIVE && p.name === 'pre')
  ) {
    context.inPre = true
    // reset context
    extend(context, cursor)
    context.source = currentSource
    // re-parse attrs and filter out v-pre itself
    props = parseAttributes(context, type).filter(p => p.name !== 'v-pre')
  }

  // Tag close.
  let isSelfClosing = false
  if (context.source.length === 0) {
    emitError(context, ErrorCodes.EOF_IN_TAG)
  } else {
    isSelfClosing = startsWith(context.source, '/>')
    if (type === TagType.End && isSelfClosing) {
      emitError(context, ErrorCodes.END_TAG_WITH_TRAILING_SOLIDUS)
    }
    advanceBy(context, isSelfClosing ? 2 : 1)
  }
  //tagType有四种类型，在这里定义了，分别是: 0 element,1 component,2 slot,3 template
  let tagType = ElementTypes.ELEMENT
  if (!context.inPre && !context.options.isCustomElement(tag)) {
    if (context.options.isNativeTag) {
      if (!context.options.isNativeTag(tag)) tagType = ElementTypes.COMPONENT
    } else {
      if (/^[A-Z]/.test(tag)) tagType = ElementTypes.COMPONENT
    }

    if (tag === 'slot') tagType = ElementTypes.SLOT
    else if (tag === 'template') tagType = ElementTypes.TEMPLATE
    else if (tag === 'portal' || tag === 'Portal') tagType = ElementTypes.PORTAL
    else if (tag === 'suspense' || tag === 'Suspense')
      tagType = ElementTypes.SUSPENSE
  }

  return {
    type: NodeTypes.ELEMENT,
    ns,
    tag,
    tagType,
    props,
    isSelfClosing,
    children: [],
    loc: getSelection(context, start),
    codegenNode: undefined // to be created during transform phase
  }
}

function parseAttributes(
  context: ParserContext,
  type: TagType
): (AttributeNode | DirectiveNode)[] {
  const props = []
  const attributeNames = new Set<string>()
  //如果跟着是 > 或者 /> ，那么标签处理结束，退出循环
  while (
    context.source.length > 0 &&
    !startsWith(context.source, '>') &&
    !startsWith(context.source, '/>')
  ) {
    if (startsWith(context.source, '/')) {
      emitError(context, ErrorCodes.UNEXPECTED_SOLIDUS_IN_TAG)
      advanceBy(context, 1)
      advanceSpaces(context)
      continue
    }
    if (type === TagType.End) {
      emitError(context, ErrorCodes.END_TAG_WITH_ATTRIBUTES)
    }
    //否则是标签的元素，我们执行 parseAttribute 来处理标签属性，该节点上增加props，保存 该起始节点的 attributes
    const attr = parseAttribute(context, attributeNames)
    if (type === TagType.Start) {
      props.push(attr)
    }

    if (/^[^\t\r\n\f />]/.test(context.source)) {
      emitError(context, ErrorCodes.MISSING_WHITESPACE_BETWEEN_ATTRIBUTES)
    }
    advanceSpaces(context)
  }
  return props
}

function parseAttribute(
  context: ParserContext,
  nameSet: Set<string>
): AttributeNode | DirectiveNode {
  __DEV__ && assert(/^[^\t\r\n\f />]/.test(context.source))

  // Name.
  const start = getCursor(context)
  // /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec('class='abc'>')
  // ["class", index: 0, input: "class='abc'>", groups: undefined]
  const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)!
  const name = match[0]

  if (nameSet.has(name)) {
    emitError(context, ErrorCodes.DUPLICATE_ATTRIBUTE)
  }
  nameSet.add(name)

  if (name[0] === '=') {
    emitError(context, ErrorCodes.UNEXPECTED_EQUALS_SIGN_BEFORE_ATTRIBUTE_NAME)
  }
  {
    const pattern = /["'<]/g
    let m: RegExpExecArray | null
    while ((m = pattern.exec(name)) !== null) {
      emitError(
        context,
        ErrorCodes.UNEXPECTED_CHARACTER_IN_ATTRIBUTE_NAME,
        m.index
      )
    }
  }

  advanceBy(context, name.length)

  // Value
  let value:
    | {
        content: string
        isQuoted: boolean
        loc: SourceLocation
      }
    | undefined = undefined

  if (/^[\t\r\n\f ]*=/.test(context.source)) {
    advanceSpaces(context)
    advanceBy(context, 1)
    advanceSpaces(context)
    // 获取属性值的方法
    value = parseAttributeValue(context)
    if (!value) {
      emitError(context, ErrorCodes.MISSING_ATTRIBUTE_VALUE)
    }
  }
  const loc = getSelection(context, start)
  //如果属性名称是v-,:,@,#开头的，需要特殊处理
  //  /(?:^v-([a-z0-9-]+))?(?:(?::|^@|^#)([^.]+))?(.+)?$/i.exec(":name")
  //  [":name", undefined, "name", undefined, index: 0, input: ":name", groups: undefined]
  //  /(?:^v-([a-z0-9-]+))?(?:(?::|^@|^#)([^.]+))?(.+)?$/i.exec("v-name")
  //  ["v-name", "name", undefined, undefined, index: 0, input: "v-name", groups: undefined]
  if (!context.inPre && /^(v-|:|@|#)/.test(name)) {
    const match = /(?:^v-([a-z0-9-]+))?(?:(?::|^@|^#)([^\.]+))?(.+)?$/i.exec(
      name
    )!

    let arg: ExpressionNode | undefined

    if (match[2]) {
      //mathch[2]如果有值，即匹配到了，说明是非 v-name
      const startOffset = name.split(match[2], 2)!.shift()!.length
      const loc = getSelection(
        context,
        getNewPosition(context, start, startOffset),
        getNewPosition(context, start, startOffset + match[2].length)
      )
      let content = match[2]
      let isStatic = true
      // 如果是名称是[]包裹的则是 动态指令， 将 isStatic 置为 false
      if (content.startsWith('[')) {
        isStatic = false

        if (!content.endsWith(']')) {
          emitError(
            context,
            ErrorCodes.X_MISSING_DYNAMIC_DIRECTIVE_ARGUMENT_END
          )
        }

        content = content.substr(1, content.length - 2)
      }

      arg = {
        type: NodeTypes.SIMPLE_EXPRESSION,
        content,
        isStatic,
        isConstant: isStatic,
        loc
      }
    }

    if (value && value.isQuoted) {
      const valueLoc = value.loc
      valueLoc.start.offset++
      valueLoc.start.column++
      valueLoc.end = advancePositionWithClone(valueLoc.start, value.content)
      valueLoc.source = valueLoc.source.slice(1, -1)
    }

    return {
      type: NodeTypes.DIRECTIVE,
      name:
        match[1] ||
        (startsWith(name, ':')
          ? 'bind'
          : startsWith(name, '@')
            ? 'on'
            : 'slot'),
      exp: value && {
        type: NodeTypes.SIMPLE_EXPRESSION,
        content: value.content,
        isStatic: false,
        // Treat as non-constant by default. This can be potentially set to
        // true by `transformExpression` to make it eligible for hoisting.
        isConstant: false,
        loc: value.loc
      },
      arg,
      modifiers: match[3] ? match[3].substr(1).split('.') : [],
      loc
    }
  }

  return {
    type: NodeTypes.ATTRIBUTE,
    name,
    value: value && {
      type: NodeTypes.TEXT,
      content: value.content,
      isEmpty: value.content.trim().length === 0,
      loc: value.loc
    },
    loc
  }
}

function parseAttributeValue(
  context: ParserContext
):
  | {
      content: string
      isQuoted: boolean
      loc: SourceLocation
    }
  | undefined {
  const start = getCursor(context)
  let content: string

  const quote = context.source[0]
  const isQuoted = quote === `"` || quote === `'`
  if (isQuoted) {
    // 如果value值有引号开始，那么就找到下一个引号未value值结束 （class="aaa" class='aaa'）
    advanceBy(context, 1)

    const endIndex = context.source.indexOf(quote)
    if (endIndex === -1) {
      content = parseTextData(
        context,
        context.source.length,
        TextModes.ATTRIBUTE_VALUE
      )
    } else {
      content = parseTextData(context, endIndex, TextModes.ATTRIBUTE_VALUE)
      advanceBy(context, 1)
    }
  } else {
    // 如果value没有引号，那么就找到下一个空格为value值结束 （class=aaa）
    const match = /^[^\t\r\n\f >]+/.exec(context.source)
    if (!match) {
      return undefined
    }
    let unexpectedChars = /["'<=`]/g
    let m: RegExpExecArray | null
    while ((m = unexpectedChars.exec(match[0])) !== null) {
      emitError(
        context,
        ErrorCodes.UNEXPECTED_CHARACTER_IN_UNQUOTED_ATTRIBUTE_VALUE,
        m.index
      )
    }
    content = parseTextData(context, match[0].length, TextModes.ATTRIBUTE_VALUE)
  }

  return { content, isQuoted, loc: getSelection(context, start) }
}

function parseInterpolation(
  context: ParserContext,
  mode: TextModes
): InterpolationNode | undefined {
  const [open, close] = context.options.delimiters
  __DEV__ && assert(startsWith(context.source, open))

  const closeIndex = context.source.indexOf(close, open.length)
  if (closeIndex === -1) {
    emitError(context, ErrorCodes.X_MISSING_INTERPOLATION_END)
    return undefined
  }

  const start = getCursor(context)
  advanceBy(context, open.length)
  const innerStart = getCursor(context)
  const innerEnd = getCursor(context)
  const rawContentLength = closeIndex - open.length
  const rawContent = context.source.slice(0, rawContentLength)
  const preTrimContent = parseTextData(context, rawContentLength, mode)
  const content = preTrimContent.trim()
  const startOffset = preTrimContent.indexOf(content)
  if (startOffset > 0) {
    advancePositionWithMutation(innerStart, rawContent, startOffset)
  }
  const endOffset =
    rawContentLength - (preTrimContent.length - content.length - startOffset)
  advancePositionWithMutation(innerEnd, rawContent, endOffset)
  advanceBy(context, close.length)

  return {
    type: NodeTypes.INTERPOLATION,
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION,
      isStatic: false,
      // Set `isConstant` to false by default and will decide in transformExpression
      isConstant: false,
      content,
      loc: getSelection(context, innerStart, innerEnd)
    },
    loc: getSelection(context, start)
  }
}

function parseText(context: ParserContext, mode: TextModes): TextNode {
  __DEV__ && assert(context.source.length > 0)

  const [open] = context.options.delimiters
  const endIndex = Math.min(
    ...[
      context.source.indexOf('<', 1),
      context.source.indexOf(open, 1),
      mode === TextModes.CDATA ? context.source.indexOf(']]>') : -1,
      context.source.length
    ].filter(n => n !== -1)
  )
  __DEV__ && assert(endIndex > 0)

  const start = getCursor(context)
  const content = parseTextData(context, endIndex, mode)

  return {
    type: NodeTypes.TEXT,
    content,
    loc: getSelection(context, start),
    isEmpty: !content.trim()
  }
}

/**
 * Get text data with a given length from the current location.
 * This translates HTML entities in the text data.
 */
function parseTextData(
  context: ParserContext,
  length: number,
  mode: TextModes
): string {
  if (mode === TextModes.RAWTEXT || mode === TextModes.CDATA) {
    const text = context.source.slice(0, length)
    advanceBy(context, length)
    return text
  }

  // DATA or RCDATA. Entity decoding required.
  const end = context.offset + length
  let text: string = ''

  while (context.offset < end) {
    const head = /&(?:#x?)?/i.exec(context.source)
    if (!head || context.offset + head.index >= end) {
      const remaining = end - context.offset
      text += context.source.slice(0, remaining)
      advanceBy(context, remaining)
      break
    }

    // Advance to the "&".
    text += context.source.slice(0, head.index)
    advanceBy(context, head.index)

    if (head[0] === '&') {
      // Named character reference.
      let name = '',
        value: string | undefined = undefined
      if (/[0-9a-z]/i.test(context.source[1])) {
        for (
          let length = context.maxCRNameLength;
          !value && length > 0;
          --length
        ) {
          name = context.source.substr(1, length)
          value = context.options.namedCharacterReferences[name]
        }
        if (value) {
          const semi = name.endsWith(';')
          if (
            mode === TextModes.ATTRIBUTE_VALUE &&
            !semi &&
            /[=a-z0-9]/i.test(context.source[1 + name.length] || '')
          ) {
            text += '&'
            text += name
            advanceBy(context, 1 + name.length)
          } else {
            text += value
            advanceBy(context, 1 + name.length)
            if (!semi) {
              emitError(
                context,
                ErrorCodes.MISSING_SEMICOLON_AFTER_CHARACTER_REFERENCE
              )
            }
          }
        } else {
          emitError(context, ErrorCodes.UNKNOWN_NAMED_CHARACTER_REFERENCE)
          text += '&'
          text += name
          advanceBy(context, 1 + name.length)
        }
      } else {
        text += '&'
        advanceBy(context, 1)
      }
    } else {
      // Numeric character reference.
      const hex = head[0] === '&#x'
      const pattern = hex ? /^&#x([0-9a-f]+);?/i : /^&#([0-9]+);?/
      const body = pattern.exec(context.source)
      if (!body) {
        text += head[0]
        emitError(
          context,
          ErrorCodes.ABSENCE_OF_DIGITS_IN_NUMERIC_CHARACTER_REFERENCE
        )
        advanceBy(context, head[0].length)
      } else {
        // https://html.spec.whatwg.org/multipage/parsing.html#numeric-character-reference-end-state
        let cp = Number.parseInt(body[1], hex ? 16 : 10)
        if (cp === 0) {
          emitError(context, ErrorCodes.NULL_CHARACTER_REFERENCE)
          cp = 0xfffd
        } else if (cp > 0x10ffff) {
          emitError(
            context,
            ErrorCodes.CHARACTER_REFERENCE_OUTSIDE_UNICODE_RANGE
          )
          cp = 0xfffd
        } else if (cp >= 0xd800 && cp <= 0xdfff) {
          emitError(context, ErrorCodes.SURROGATE_CHARACTER_REFERENCE)
          cp = 0xfffd
        } else if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) {
          emitError(context, ErrorCodes.NONCHARACTER_CHARACTER_REFERENCE)
        } else if (
          (cp >= 0x01 && cp <= 0x08) ||
          cp === 0x0b ||
          (cp >= 0x0d && cp <= 0x1f) ||
          (cp >= 0x7f && cp <= 0x9f)
        ) {
          emitError(context, ErrorCodes.CONTROL_CHARACTER_REFERENCE)
          cp = CCR_REPLACEMENTS[cp] || cp
        }
        text += String.fromCodePoint(cp)
        advanceBy(context, body[0].length)
        if (!body![0].endsWith(';')) {
          emitError(
            context,
            ErrorCodes.MISSING_SEMICOLON_AFTER_CHARACTER_REFERENCE
          )
        }
      }
    }
  }
  return text
}

function getCursor(context: ParserContext): Position {
  const { column, line, offset } = context
  return { column, line, offset }
}

function getSelection(
  context: ParserContext,
  start: Position,
  end?: Position
): SourceLocation {
  end = end || getCursor(context)
  return {
    start,
    end,
    source: context.originalSource.slice(start.offset, end.offset)
  }
}

function last<T>(xs: T[]): T | undefined {
  return xs[xs.length - 1]
}

function startsWith(source: string, searchString: string): boolean {
  return source.startsWith(searchString)
}
//将需要处理的模板source ，后移 number 个字符重新记录loc
function advanceBy(context: ParserContext, numberOfCharacters: number): void {
  const { source } = context
  __DEV__ && assert(numberOfCharacters <= source.length)
  advancePositionWithMutation(context, source, numberOfCharacters)
  context.source = source.slice(numberOfCharacters)
}
//后移存在的连续的空格
function advanceSpaces(context: ParserContext): void {
  const match = /^[\t\r\n\f ]+/.exec(context.source)
  if (match) {
    advanceBy(context, match[0].length)
  }
}

function getNewPosition(
  context: ParserContext,
  start: Position,
  numberOfCharacters: number
): Position {
  return advancePositionWithClone(
    start,
    context.originalSource.slice(start.offset, numberOfCharacters),
    numberOfCharacters
  )
}

function emitError(
  context: ParserContext,
  code: ErrorCodes,
  offset?: number
): void {
  const loc = getCursor(context)
  if (offset) {
    loc.offset += offset
    loc.column += offset
  }
  context.options.onError(
    createCompilerError(code, {
      start: loc,
      end: loc,
      source: ''
    })
  )
}

function isEnd(
  context: ParserContext,
  mode: TextModes,
  ancestors: ElementNode[]
): boolean {
  const s = context.source

  switch (mode) {
    case TextModes.DATA:
      if (startsWith(s, '</')) {
        //TODO: probably bad performance
        for (let i = ancestors.length - 1; i >= 0; --i) {
          if (startsWithEndTagOpen(s, ancestors[i].tag)) {
            return true
          }
        }
      }
      break

    case TextModes.RCDATA:
    case TextModes.RAWTEXT: {
      const parent = last(ancestors)
      if (parent && startsWithEndTagOpen(s, parent.tag)) {
        return true
      }
      break
    }

    case TextModes.CDATA:
      if (startsWith(s, ']]>')) {
        return true
      }
      break
  }

  return !s
}

function startsWithEndTagOpen(source: string, tag: string): boolean {
  return (
    startsWith(source, '</') &&
    source.substr(2, tag.length).toLowerCase() === tag.toLowerCase() &&
    /[\t\n\f />]/.test(source[2 + tag.length] || '>')
  )
}

// https://html.spec.whatwg.org/multipage/parsing.html#numeric-character-reference-end-state
const CCR_REPLACEMENTS: { [key: number]: number | undefined } = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178
}
