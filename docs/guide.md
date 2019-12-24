# 源码文件夹结构介绍

### 代码仓库中有个 packages 目录，里面主要是 Vue 3 的主要功能实现

- reactivity 目录：数据响应式系统，这是一个单独的系统，可以与任何框架配合使用

- runtime-core 目录：与平台无关的运行时。其实现的功能有虚拟 DOM 渲染器、Vue 组件和 Vue 的各种API，我们可以利用这个 runtime 实现针对某个具体平台的高阶 runtime，比如自定义渲染器

- runtime-dom 目录: 针对浏览器的 runtime。其功能包括处理原生 DOM API、DOM 事件和 DOM 属性等

- runtime-test 目录: 一个专门为了测试而写的轻量级 runtime。由于这个 rumtime 「渲染」出的 DOM 树其实是一个 JS 对象，所以这个 runtime 可以用在所有 JS 环境里。你可以用它来测试渲染是否正确。它还可以用于序列化 DOM、触发 DOM 事件，以及记录某次更新中的 DOM 操作

- server-renderer 目录: 用于 SSR，尚未实现

- compiler-core 目录: 平台无关的编译器，它既包含可扩展的基础功能，也包含所有平台无关的插件

- compiler-dom 目录: 针对浏览器的编译器

- shared 目录: 没有暴露任何 API，主要包含了一些平台无关的内部帮助方法

- vue 目录: 用于构建「完整」版本，引用了上面提到的 runtime 和 compiler目录





