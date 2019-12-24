# @vue/compiler-core
目录结构：
tests 测试用例
src/ast ts语法的大佬的类型定义，比如type，enum，interface等
src/codegen 将生成的ast转换成render字符串
src/errors 定义 compiler 错误类型
src/index 入口文件，主要有一个 baseCompile ，用来编译模板文件的
src/parse 将模板字符串转换成 AST
src/runtimeHelper 生成code的时候的定义常量对应关系
src/transform 处理 AST 中的 vue 特有语法，比如 v-if ,v-on 的解析


可以测试一下：
const source = <div id="test" :class="cls">
        <span>{{ name }}</span>
        <MyCom></MyCom>
    </div>.trim()
import { parse } from './compiler-core.cjs'
const result = parse(source)
一个简单的转换结果就呈现出来了，从生成的结构来看，相对于vue2.x有几个比较重要的变化：
  1.新增了 loc 属性 每一个节点都记录了该节点在源码当中的 start 和 end，标识了代码的详细位置，column,line,offset,vu3.0对于开发遇到的问题都要详细的日志输出也基于此，另外支持 source-map
  2.新增了 tagType 属性,tagType 属性标识该节点是什么类型的。我们知道 vue2.x 判断节点类型是运行时才有的，vu3.0将判断提前到编译阶段了，提升了性能;目前tagType有三种类型：0 element,1 component,2 slot,3 template
  3.新增 isStatic 属性将模板提前编译好，标识是否为动态变化的，比如动态指令

新版的 AST 明显比 vue2.x 要复杂些，可以看到vue3.0将很多可以在编译阶段就能确定的就在编译阶段确定，标识编译结果，不需要等到运行时再去判断，节省内存和性能。这个也是尤大大重点说了的，优化编译，提升性能,转换的代码，主要有如下几个方法：
  parse & parseChildren 主入口
  parseTag 处理标签
  parseAttribute 处理标签上的属性
  parseElement 处理起始标签
  parseInterpolation 处理动态文本内容
  parseText 处理静态文本内容












