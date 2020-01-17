const slidebar = require('./router')

module.exports = {
  title: '前端学习',
  port: 7777,
  base: '/vue-source-code-analysize/',
  // dest: '../../../docs/dist/',
  description: '前端技术底层实现',
  themeConfig: {
    nav: [{ text: 'gitHub', link: 'https://github.com/limingkang' }],
    sidebar: slidebar
  }
}
