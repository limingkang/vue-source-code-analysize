# @vue/reactivity

## Usage Note

This package is inlined into Global & Browser ESM builds of user-facing renderers (e.g. `@vue/runtime-dom`), but also published as a package that can be used standalone. The standalone build should not be used alongside a pre-bundled build of a user-facing renderer, as they will have different internal storage for reactivity connections. A user-facing renderer should re-export all APIs from this package.

For full exposed APIs, see `src/index.ts`. You can also run `yarn build reactivity --types` from repo root, which will generate an API report at `temp/reactivity.api.md`.

## Credits

The implementation of this module is inspired by the following prior art in the JavaScript ecosystem:

- [Meteor Tracker](https://docs.meteor.com/api/tracker.html)
- [nx-js/reactivity-util](https://github.com/nx-js/reactivity-util)
- [salesforce/observable-membrane](https://github.com/salesforce/observable-membrane)

## Caveats

- Built-in objects are not observed except for `Map`, `WeakMap`, `Set` and `WeakSet`.

<!-- 在vue 2.x版本中，数据监听的实现核心是defineProperty,defineProperty在处理数组和对象时需要对应不同的方式，而在处理监听的深度时，需要递归处理对象的每一个key,这样在一定程度上存在一些性能问题而proxy
不仅可以代理Object，还能代理Array,但是他存在以下两个问题:
let data = [1,2]
let p = new Proxy(data, {
  get(target, key, receiver) {
    // 读取属性时执行
    console.log('get value:', key)
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    // 设置值时执行
    console.log('set value')
    return Reflect.set(target, key, receiver)
  }
})
p.push(3)
// get value: push
// get value: length
// set value
// set value
因为当我们执行数组的push方法时会获取数组的push属性和length属性,当我们为数组赋值时，我们会为数组下标2设置值3,同时将数组的length设置为3,所以我们执行了两次get和两次set，这就是其中一个问题，他执行某次操作的时候可能会触发多次get或者set

let data = { foo: 'foo', bar: { key: 1 }, ary: ['a', 'b'] }
let p = new Proxy(data, {
  get(target, key, receiver) {
    console.log('get value:', key)
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    console.log('set value:', key, value)
    return Reflect.set(target, key, value, receiver)
  }
})

p.bar.key = 2
// get value: bar
//运行以上代码，可以发现并没有执行set方法，那是因为Proxy只能代理一层 -->


































