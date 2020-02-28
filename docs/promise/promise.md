# promise底层实现原理

## 基础构造
构造函数Promise必须接受一个函数作为参数，我们称该函数为handle，handle又包含resolve和reject两个参数，它们是两个函数
``` js
const isFunction = variable => typeof variable === "function";
// 定义promise的三种状态
const PENDING = 'PENDING'
const FULFILLED = 'FULFILLED'
const REJECTED = 'REJECTED'
Class MyPromise {
  constructor(handle) {
    if(!isFunction) {
      throw new Error('MyPromise must accept a function as a parameter');
    }
    // 定义初始化状态和对应值
    this._status = PENDING;
    this._value = undefined;
    // 执行handle
    try {
       handle(this._resolve.bind(this), this._reject.bind(this));
    } catch(err) {
       this._reject(err);
    }
  }
  // _resolve和_reject首先得能改变状态和改变值
  _resolve(val) {
    if(this._status !== PENDING) return;
    this._status = FULFILLED;
    this._value = val;
  }
  _reject(err) {
    if(this._status !== PENDING) return;
    this._status = REJECTED;
    this._value = err;
  }
}
```
## then方法的分析
上面是基础的例子，我们现在来考虑下then方法的实现逻辑，首先`promise.then(onFulfilled, onRejected)`
我们知道该方法接受两个参数，这两个参数都必须是函数而且只能在相应状态改变之后被调用一次，其值就是对应resolve或reject
出来的值;then方法同时支持链式调用，下面的例子方便理解
``` js
let promise1 = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve()
  }, 1000)
})
promise2 = promise1.then(res => {
  // 返回一个普通值
  return '这里返回一个普通值'
})
promise2.then(res => {
  console.log(res) //1秒后打印出：这里返回一个普通值
})

let promise1 = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve()
  }, 1000)
})
promise2 = promise1.then(res => {
  // 返回一个Promise对象
  return new Promise((resolve, reject) => {
    setTimeout(() => {
     resolve('这里返回一个Promise')
    }, 2000)
  })
})
promise2.then(res => {
  console.log(res) //3秒后打印出：这里返回一个Promise
})
```
如果 onFulfilled 或者onRejected 抛出一个异常 e ，则 promise2 必须变为失败（Rejected），并返回失败的值 e，例如：
``` js
let promise1 = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('success')
  }, 1000)
})
promise2 = promise1.then(res => {
  throw new Error('这里抛出一个异常e')
})
promise2.then(res => {
  console.log(res)
}, err => {
  console.log(err) //1秒后打印出：这里抛出一个异常e
})
```
如果onFulfilled 不是函数且 promise1 状态为成功（Fulfilled）， promise2 必须变为成功（Fulfilled）并返回 promise1 成功的值，例如：
``` js
let promise1 = new Promise((resolve, reject) => {
  setTimeout(() => {
    resolve('success')
  }, 1000)
})
promise2 = promise1.then('这里的onFulfilled本来是一个函数，但现在不是')
promise2.then(res => {
  console.log(res) // 1秒后打印出：success
}, err => {
  console.log(err)
})
```
如果 onRejected 不是函数且 promise1 状态为失败（Rejected），promise2必须变为失败（Rejected） 并返回 promise1 失败的值，例如：
``` js
let promise1 = new Promise((resolve, reject) => {
  setTimeout(() => {
    reject('fail')
  }, 1000)
})
promise2 = promise1.then(res => res, '这里的onRejected本来是一个函数，但现在不是')
promise2.then(res => {
  console.log(res)
}, err => {
  console.log(err)  // 1秒后打印出：fail
})
```
由于 then 方法支持多次调用，我们可以维护两个数组，将每次 then 方法注册时的回调函数添加到数组中，等待执行，只要
在constructor中加入内部初始化数组即可
``` js
// 添加成功回调函数队列
this._fulfilledQueues = []
// 添加失败回调函数队列
this._rejectedQueues = []
```
接下来我们添加then方法
``` js
then(onFulfilled, onRejected) {
   {_status, _value} = this;
   return new MyPromise((onFulfilledNext, onRejectedNext) => {
     let fulfilled = value => {
       try {
        if(!isFunction(onFulfilled)) {
          onFulfilledNext(_value);
        } else {
          // then回调函数返回的是promise
          const res = onFulfilled(_value);
          if (res instanceof MyPromise) {
              res.then(onFulfilledNext, onRejectedNext)
          } else {
              onFulfilledNext(res);
          }
        }
       } catch(err) {
         onRejectedNext(err);
       }
     }
     let rejected = value => {
       try {
        if(!isFunction(onRejected)) {
          onRejectedNext(_value);
        } else {
          const res = onRejected(_value);
          if (res instanceof MyPromise) {
              res.then(onFulfilledNext, onRejectedNext)
          } else {
              onFulfilledNext(res);
          }
        }
       } catch(err) {
         onRejectedNext(err);
       }
     }
     switch _status
      case PENDING
           this._fulfilledQueues.push(fulfilled);
           this._rejectedQueues.push(rejected);
           break;
      case FULFILLED
           fulfilled(_value);
           break;
      case REJECTED
           rejected(_value);
           break;
   })
}
// 相应的上面的 _resolve和_reject方法必须还能运行回调函数
_resolve(val) {
  if(this._status !== PENDING) return;
  this._status = FULFILLED;
  this._value = val;
  while(cb = this._fulfilledQueues.shift()) {
    cb(this._value);
  }
}
_reject(err) {
  if(this._status !== PENDING) return;
  this._status = REJECTED;
  this._value = err;
  while(cb = this._rejectedQueues.shift()) {
    cb(this._value);
  }
}
```
这里还有一种特殊的情况，就是当 resolve 方法传入的参数为一个 Promise 对象时，则该 Promise 对象状态决定当前 Promise 对象的状态
``` js
_resolve(val) {
  if(this._status !== PENDING) return;
  this._status = FULFILLED;
  const runFulfilled = (value) => {  
    while(cb = this._fulfilledQueues.shift()) {
      cb(value);
    }
  }
  const runRejected = (err) => {
    while(cb = this._rejectedQueues.shift()) {
      cb(err);
    }
  } 
  if(val instanceof MyPromise) {
    val.then((value)=> {
      this._value = value;
      runFulfilled(value);
    }, (err) => {
      this._value = err;
      runRejected(err);
    })
  } else {
    this._value = val;
    runFulfilled(val);
  }
}
```

## catch、resolve、reject、all、race、finally方法
catch方法相当于调用 then 方法, 但只传入 Rejected 状态的回调函数
``` js
catch() {
  return this.then(undefined, onRejected);
}
```
完整代码如下
``` js
// 判断变量否为function
const isFunction = variable => typeof variable === 'function'
// 定义Promise的三种状态常量
const PENDING = 'PENDING'
const FULFILLED = 'FULFILLED'
const REJECTED = 'REJECTED'

class MyPromise {
  constructor (handle) {
    if (!isFunction(handle)) {
      throw new Error('MyPromise must accept a function as a parameter')
    }
    // 添加状态
    this._status = PENDING
    // 添加状态
    this._value = undefined
    // 添加成功回调函数队列
    this._fulfilledQueues = []
    // 添加失败回调函数队列
    this._rejectedQueues = []
    // 执行handle
    try {
      handle(this._resolve.bind(this), this._reject.bind(this)) 
    } catch (err) {
      this._reject(err)
    }
  }
  // 添加resovle时执行的函数
  _resolve (val) {
    const run = () => {
      if (this._status !== PENDING) return
      this._status = FULFILLED
      // 依次执行成功队列中的函数，并清空队列
      const runFulfilled = (value) => {
        let cb;
        while (cb = this._fulfilledQueues.shift()) {
          cb(value)
        }
      }
      // 依次执行失败队列中的函数，并清空队列
      const runRejected = (error) => {
        let cb;
        while (cb = this._rejectedQueues.shift()) {
          cb(error)
        }
      }
      /* 如果resolve的参数为Promise对象，则必须等待该Promise对象状态改变后,
        当前Promsie的状态才会改变，且状态取决于参数Promsie对象的状态
      */
      if (val instanceof MyPromise) {
        val.then(value => {
          this._value = value
          runFulfilled(value)
        }, err => {
          this._value = err
          runRejected(err)
        })
      } else {
        this._value = val
        runFulfilled(val)
      }
    }
    // 为了支持同步的Promise，这里采用异步调用
    setTimeout(run, 0)
  }
  // 添加reject时执行的函数
  _reject (err) { 
    if (this._status !== PENDING) return
    // 依次执行失败队列中的函数，并清空队列
    const run = () => {
      this._status = REJECTED
      this._value = err
      let cb;
      while (cb = this._rejectedQueues.shift()) {
        cb(err)
      }
    }
    // 为了支持同步的Promise，这里采用异步调用
    setTimeout(run, 0)
  }
  // 添加then方法
  then (onFulfilled, onRejected) {
    const { _value, _status } = this
    // 返回一个新的Promise对象
    return new MyPromise((onFulfilledNext, onRejectedNext) => {
      // 封装一个成功时执行的函数
      let fulfilled = value => {
        try {
          if (!isFunction(onFulfilled)) {
            onFulfilledNext(value)
          } else {
            let res =  onFulfilled(value);
            if (res instanceof MyPromise) {
              // 如果当前回调函数返回MyPromise对象，必须等待其状态改变后在执行下一个回调
              res.then(onFulfilledNext, onRejectedNext)
            } else {
              //否则会将返回结果直接作为参数，传入下一个then的回调函数，并立即执行下一个then的回调函数
              onFulfilledNext(res)
            }
          }
        } catch (err) {
          // 如果函数执行出错，新的Promise对象的状态为失败
          onRejectedNext(err)
        }
      }
      // 封装一个失败时执行的函数
      let rejected = error => {
        try {
          if (!isFunction(onRejected)) {
            onRejectedNext(error)
          } else {
              let res = onRejected(error);
              if (res instanceof MyPromise) {
                // 如果当前回调函数返回MyPromise对象，必须等待其状态改变后在执行下一个回调
                res.then(onFulfilledNext, onRejectedNext)
              } else {
                //否则会将返回结果直接作为参数，传入下一个then的回调函数，并立即执行下一个then的回调函数
                onFulfilledNext(res)
              }
          }
        } catch (err) {
          // 如果函数执行出错，新的Promise对象的状态为失败
          onRejectedNext(err)
        }
      }
      switch (_status) {
        // 当状态为pending时，将then方法回调函数加入执行队列等待执行
        case PENDING:
          this._fulfilledQueues.push(fulfilled)
          this._rejectedQueues.push(rejected)
          break
        // 当状态已经改变时，立即执行对应的回调函数
        case FULFILLED:
          fulfilled(_value)
          break
        case REJECTED:
          rejected(_value)
          break
      }
    })
  }
  // 添加catch方法
  catch (onRejected) {
    return this.then(undefined, onRejected)
  }
  // 添加静态resolve方法
  static resolve (value) {
    // 如果参数是MyPromise实例，直接返回这个实例
    if (value instanceof MyPromise) return value
    return new MyPromise(resolve => resolve(value))
  }
  // 添加静态reject方法
  static reject (value) {
    return new MyPromise((resolve ,reject) => reject(value))
  }
  // 添加静态all方法
  static all (list) {
    return new MyPromise((resolve, reject) => {
      /**
       * 返回值的集合
       */
      let values = []
      let count = 0
      for (let [i, p] of list.entries()) {
        // 数组参数如果不是MyPromise实例，先调用MyPromise.resolve
        this.resolve(p).then(res => {
          values[i] = res
          count++
          // 所有状态都变成fulfilled时返回的MyPromise状态就变成fulfilled
          if (count === list.length) resolve(values)
        }, err => {
          // 有一个被rejected时返回的MyPromise状态就变成rejected
          reject(err)
        })
      }
    })
  }
  // 添加静态race方法
  static race (list) {
    return new MyPromise((resolve, reject) => {
      for (let p of list) {
        // 只要有一个实例率先改变状态，新的MyPromise的状态就跟着改变
        this.resolve(p).then(res => {
          resolve(res)
        }, err => {
          reject(err)
        })
      }
    })
  }
  finally (cb) {
    return this.then(
      value  => MyPromise.resolve(cb()).then(() => value),
      reason => MyPromise.resolve(cb()).then(() => { throw reason })
    );
  }
}
```
