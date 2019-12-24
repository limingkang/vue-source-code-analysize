// 全部打包包括runtime和编译器, 支持template option的即时编译
import { compile, CompilerOptions } from '@vue/compiler-dom'
import { registerRuntimeCompiler, RenderFunction } from '@vue/runtime-dom'
import * as runtimeDom from '@vue/runtime-dom'

function compileToFunction(
  template: string,
  options?: CompilerOptions
): RenderFunction {
  const result = compile(template, {
    hoistStatic: true,
    ...options
  })
  console.log(result);
  return new Function('Vue', result.code)(runtimeDom) as RenderFunction
}
// 设置编译函数
registerRuntimeCompiler(compileToFunction)

export { compileToFunction as compile }
export * from '@vue/runtime-dom'

if (__BROWSER__ && __DEV__) {
  console[console.info ? 'info' : 'log'](
    `You are running a development build of Vue.\n` +
      `Make sure to use the production build (*.prod.js) when deploying for production.`
  )
}
// 假设template是如此：
// <div>
//   <span>{{ state.count + 3 }}<div>ddddd{ { state.count + 1 } } </div></span >
//     <button @click="increment" >
//       Count is: { { state.count } }
//   </button>
// < /div>
// compileToFunction编译会生成此函数:
// (function anonymous(Vue
// ) {
//   const _Vue = Vue

//   return function render() {
//     with (this) {
//       const { toString: _toString, createVNode: _createVNode, createBlock: _createBlock, openBlock: _openBlock } = _Vue

//       return (_openBlock(), _createBlock("div", null, [
//         _createVNode("span", null, [
//           _toString(state.count + 3),
//           _createVNode("div", null, "ddddd" + _toString(state.count + 1), 1 /* TEXT */)
//         ]),
//         _createVNode("button", { onClick: increment }, "\n        Count is: " + _toString(state.count), 9 /* TEXT, PROPS */, ["onClick"])
//       ]))
//     }
//   }
// })