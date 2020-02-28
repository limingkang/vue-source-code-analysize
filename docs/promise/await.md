# async、await原理

## thunk函数
为了更加方便的处理异步操作问题，现在最新的前端框架生态都开始用上了es6的Generator和yield，有的甚至已经开始使用
es7的async、await语法了，这两样都是基于Generator自动执行的原理，这里就要说到thunk函数了
``` js 
// 首先我们来了解下参数求值策略,给出下面代码
var x = 1;
function f(m){
  return m * 2;
}
f(x + 5);  // x +5 在何时运算？

// 1、传值调用：
var x = 1;
function f(m){
  return m * 2;
}
f(6);  // 将值先计算出来再作为参数传入函数。C 语言采用这种策略

// 2、传名调用
var x = 1;
function f(m){
  return m * 2;  // (x + 5) * 2。参数不求值，传到函数中，在函数中进行运算求值。JS 采用此策略
}
f(x + 5);
```
Thunk 函数的作用是将多参数替换成单参数版本
``` js
var Thunk = function (fileName){
  return function (callback){
    return fs.readFile(fileName, callback);
  };
};
// 正常版本的readFile（多参数版本）
fs.readFile(fileName, callback);
// Thunk版本的readFile（单参数版本）
var readFileThunk = Thunk(fileName);
readFileThunk(callback);


// 任何函数，只要参数有回调函数，就能写成Thunk函数的形式。下面是一个简单的Thunk函数转换器
var Thunk = function(fn) {
  return function (...args) {
    return function (callback) {
      return fn.call(this, ...args, callback);
    }
  };
};
var readFileThunk = Thunk(fs.readFile);
readFileThunk(fileA)(callback);
```

## Generator函数
Generator函数的实例。它具有状态值suspended和closed，suspended代表暂停，closed则为结束。但是这个状态是无法捕获
的，我们只能通过Generator函数的提供的方法获取当前的状态，先简单介绍下Generator函数提供了3个方法，next/return/throw
``` js
//next方式是按步执行，每次返回一个值,同时也可以每次传入新的值作为计算
function* foo(x) {
    let a = yield x + 1;
    let b= yield a + 2;
    return x + 3;
}
const result = foo(5) // foo {<suspended>}
result.next(1);  // {value: 6, done: false}
result.next(2);  // {value: 4, done: false} 决定上一个yield是2即a值为2
result.next(3);  // {value: 8, done: true}
result.next(4);  //{value: undefined, done: true}
```
throw则根据函数中书写try catch返回catch中的内容，如果没有写try，则直接抛出异常
``` js
function* foo(x) {
  try{
    yield x+1
    yield x+2
    yield x+3
    yield x+4
    
  }catch(e){
    console.log('catch it')
  }
}
const result = foo(0) // foo {<suspended>}
result.next();  // {value: 1, done: false}
result.next();  // {value: 2, done: false}
result.throw();  // catch it {value: undefined, done: true}
result.next();  //{value: undefined, done: true}
```
Generator函数返回值是个带有状态的Generator实例。它可被for of 调用，进行遍历且只可被for of 调用此时将返回他所有状态
``` js
function* foo(x) {
console.log('start')
    yield x+1
   console.log('state 1')
    yield x+2
   console.log('end')
}
const result = foo(0) // foo {<suspended>}
for(let i of result){
    console.log(i)
}
//start
//1
//state 1
//2
//end
result.next() //{value: undefined, done: true}
```
在Generator函数中，我们有时需要将多个迭代器的值合在一起，我们可以使用yield *的形式，将执行委托给另外一个Generator函数
``` js
function* foo1() {
    yield 1;
    yield 2;
    return "foo1 end";
}

function* foo2() {
    yield 3;
    yield 4;
}

function* foo() {
    yield* foo1();
    yield* foo2();
      yield 5;
}

const result = foo();

console.log(iterator.next());// "{ value: 1, done: false }"
console.log(iterator.next());// "{ value: 2, done: false }"
console.log(iterator.next());// "{ value: 3, done: false }"
console.log(iterator.next());// "{ value: 4, done: false }"
console.log(iterator.next());// "{ value: 5, done: false }"
console.log(iterator.next());// "{ value: undefined, done: true }"
```
foo在执行的时候，首先委托给了foo1，等foo1执行完毕，再委托给foo2。但是我们发现，”foo1 end” 这一句并没有输出。
在整个Generator中，return只能有一次，在委托的时候，所有的yield*都是以函数表达式的形式出现;return的值是表达
式的结果，在委托结束之前其内部都是暂停的，等待到表达式的结果的时候，将结果直接返回给foo。此时foo内部没有接收的变
量，所以未打印;如果我们希望捕获这个值，可以使用yield *foo()的方式进行获取


## async、await实现
首先我们来编写一个基于thunk函数的Generator
``` js
var readFile = function (fileName) {
    return function (callback) {
        return fs.readFile(fileName, callback)
    }
}
let gen = function* () {
    let r1 = yield readFile('./package.json')
    console.log(r1.toString())
    let r2 = yield readFile('./index.js')
    console.log(r2.toString())
}
// 我们来手动执行一下这个Generator:
let g = gen()
let r1 = g.next()
r1.value(function (err, data) {
    if (err) {
        throw err
    }
    let r2 = g.next(data)
    r2.value(function (err, data) {
        if (err) {
            throw err
        }
        g.next(data)
    })
})
// 可以注意到，在我们手动执行基于thunk函数的Generator时，有很多代码是可以复用的，而所谓的Generator自动执行
// 就是把这些可复用的部分封装成函数，然后让它们递归执行，直到执行完所有的yield

// Generator自动执行器无非就是把可复用的部分封装成next函数，然后让其递归执行，直到执行完所有的yield
function run(fn) {
    let gen = fn()
    function next(err, data) {
        let result = gen.next(data)
        if (result.done) {
            return
        }
        result.value(next)
    }
    next()
}
run(gen)
```
上面的例子是基于thunk函数的，而即将出现的es7的async、await语法是基于Promise的这里再上一个基于Promise
的Generator的自动执行,这个和基于thunk函数的大同小异，只是把函数返回值的获取权以Promise的方式交出
``` js
//包装返回Promise对象的函数
function readFile(fileName) {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, (error, data) => {
            if (error) {
                reject(error)
            } else {
                resolve(data)
            }
        })
    })
}
// 编写Generator
let gen = function* () {
    let r1 = yield readFile('./package.json')
    console.log(r1.toString())
    let r2 = yield readFile('./index.js')
    console.log(r2.toString())
}
// 编写Generator执行器
function run(gen) {
    let g = gen()
    function next(data) {
        let result = g.next(data)
        if (result.done) {
            return result.value
        }
        result.value.then((data) => next(data))
    }
    next()
}
//用Generator执行器自动执行
run(gen)
```










