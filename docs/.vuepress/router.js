module.exports = [
  {
    title: 'vue3源码',
    path: '/',
    collapsable: false,
    children: [
      ['/techAccumulate/vue-rfc', 'vue3和2响应式对比'],
      ['/vueReactive/code-analsize', 'vue3响应式源码讲解'],
      ['/easyInit/init', '核心渲染函数介绍'],
      ['/render/render', '渲染流程介绍'],
      ['/domDiff/dom-diff', 'dom diff'],
      ['/compiler/compiler', '编译函数介绍'],
      ['/webpack/webpack', 'webpack打包原理']
    ]
  },
  {
    title: '源码实现',
    collapsable: false,
    children: [['/promise/promise', 'promise相关']]
  }
]
