# `lifecycle-utils`
A set of general utilities for the lifecycle of a JS/TS project/library

[![Build](https://github.com/giladgd/lifecycle-utils/actions/workflows/test.yml/badge.svg)](https://github.com/giladgd/lifecycle-utils/actions/workflows/test.yml)
[![License](https://badgen.net/badge/color/MIT/green?label=license)](https://www.npmjs.com/package/lifecycle-utils)
[![Types](https://badgen.net/badge/color/TypeScript/blue?label=types)](https://www.npmjs.com/package/lifecycle-utils)
[![Version](https://badgen.net/npm/v/lifecycle-utils)](https://www.npmjs.com/package/lifecycle-utils)
[![codecov](https://codecov.io/gh/giladgd/lifecycle-utils/branch/master/graph/badge.svg)](https://codecov.io/gh/giladgd/lifecycle-utils)

* [Documentation](https://giladgd.github.io/lifecycle-utils/)
* [Changelog](https://github.com/giladgd/lifecycle-utils/releases)


## Installation
```bash
npm install --save lifecycle-utils
```

> This is an ESM package, so you can only use `import` to import it, and cannot use `require`

## Documentation
### `withLock`
Calling `withLock` acquires an exclusive lock for the given `scope` values,
ensuring that its callback cannot run in parallel to any other exclusive or shared lock that use the same `scope` values.

The order of the values in the `scope` array is important, and should be consistent across calls to reference the same lock.
You can use as many values as you like, but always ensure that at least one of them is a reference to an object.

```typescript
import {withLock} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like
const startTime = Date.now();

async function doSomething(index: number): number {
    return await withLock([scope, "myKey"], async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("index:", index, "time:", Date.now() - startTime);
        return 42;
    });
}

const res = await Promise.all([
    doSomething(1),
    doSomething(2),
    doSomething(3)
]);

// index: 1 time: 1000
// index: 2 time: 2000
// index: 3 time: 3000

console.log(res); // [42, 42, 42]
```

### `isLockActive`
Check whether a lock is currently active for the given `scope` values.

```typescript
import {isLockActive} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like

const res = isLockActive([scope, "myKey"]);
console.log(res); // false
```

### `acquireLock`
Acquire an exclusive lock for the given `scope` values.

```typescript
import {acquireLock} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like

const activeLock = await acquireLock([scope, "myKey"]);
console.log("lock acquired");

// ... do some work

activeLock.dispose();
```

Using the `using` feature of TypeScript is also supported:
```typescript
import {acquireLock} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like

{
    using lock = await acquireLock([scope, "myKey"]);
    console.log("lock acquired");
    
    // ... do some work
}

console.log("lock released");
```

### `waitForLockRelease`
Wait for all locks to be released for a given `scope` values.

```typescript
import {waitForLockRelease} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like

await waitForLockRelease([scope, "myKey"]);
console.log("lock is released");
```

### `withSharedLock`
Calling `withSharedLock` acquires a shared lock for the given `scope`,
allowing multiple shared locks to run in parallel while preventing an exclusive lock from running at the same time.

Lock requests are acquired in the order they are made, with consecutive shared lock requests acquired together.
A new shared lock joins an active shared lock immediately when no regular lock requests are waiting.

```typescript
import {withLock, withSharedLock} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like
const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

const exclusive1 = withLock([scope, "myKey"], async () => {
    console.log("exclusive 1 started");
    await sleep(1000);
    console.log("exclusive 1 finished");
});

const shared1 = withSharedLock([scope, "myKey"], async () => {
    console.log("shared 1 started");
    await sleep(1000);
    console.log("shared 1 finished");
});
const shared2 = withSharedLock([scope, "myKey"], async () => {
    console.log("shared 2 started");
    await sleep(500);
    console.log("shared 2 finished");
});

const exclusive2 = withLock([scope, "myKey"], async () => {
    console.log("exclusive 2 started");
    await sleep(1000);
    console.log("exclusive 2 finished");
});

await Promise.all([exclusive1, shared1, shared2, exclusive2]);

// exclusive 1 started
// exclusive 1 finished
// shared 1 started
// shared 2 started
// shared 2 finished
// shared 1 finished
// exclusive 2 started
// exclusive 2 finished
```

### `acquireSharedLock`
Acquire a shared lock for the given `scope` values.

Multiple shared locks can be held in parallel,
while an exclusive lock cannot be held until every shared lock is released.

Lock requests are acquired in the order they are made, with consecutive shared lock requests acquired together.
A new shared lock joins an active shared lock immediately when no regular lock requests are waiting.

```typescript
import {acquireSharedLock} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like

const activeLock = await acquireSharedLock([scope, "myKey"]);
console.log("shared lock acquired");

// ... do some work

activeLock.dispose();
```

Using the `using` feature of TypeScript is also supported:
```typescript
import {acquireSharedLock} from "lifecycle-utils";

const scope = {}; // can be a reference to any object you like

{
    using lock = await acquireSharedLock([scope, "myKey"]);
    console.log("shared lock acquired");
    
    // ... do some work
}

console.log("lock released");
```

### `EventRelay`
A simple event relay.

Create a listener with `createListener` and dispatch events with `dispatchEvent`.

For each supported event type, create a new instance of `EventRelay` and expose it as a property.

For example, this code:
```ts
import {EventRelay} from "lifecycle-utils";

class MyClass {
    public readonly onSomethingHappened = new EventRelay<string>();

    public doSomething(whatToDo: string) {
        this.onSomethingHappened.dispatchEvent(whatToDo);
        console.log("Done notifying listeners");
    }
}

const myClass = new MyClass();
myClass.onSomethingHappened.createListener((whatHappened) => {
    console.log(`Something happened: ${whatHappened}`);
});
myClass.doSomething("eat a cookie");
```

Will print this:
```
Something happened: eat a cookie
Done notifying listeners
```

### `ScopedEventRelay`
A scoped event relay.

Create a listener for a given scope with `createListener` and dispatch events for a given scope with `dispatchEvent`.

For each supported event type, create a new instance of `ScopedEventRelay` and expose it as a property,
where the scope identifies the target the event belongs to.

A scope consists of one or more values that identify the target or context of an event, such as a `clientId` string.

```typescript
import {ScopedEventRelay} from "lifecycle-utils";

class Clients {
    public readonly onClientMessage = new ScopedEventRelay<[clientId: string], string>();

    public sendMessage(clientId: string, message: string) {
        this.onClientMessage.dispatchEvent([clientId], message);
        console.log("Done notifying listeners");
    }
}

const clients = new Clients();
clients.onClientMessage.createListener(["client1"], (message) => {
    console.log(`Message from client1: ${message}`);
});
clients.onClientMessage.createListener(["client2"], (message) => {
    console.log(`Message from client2: ${message}`);
});
clients.sendMessage("client1", "eat a cookie");
clients.sendMessage("client2", "eat a sandwich");
```

Will print this:
```
Message from client1: eat a cookie
Done notifying listeners
Message from client2: eat a sandwich
Done notifying listeners
```

### `DisposeAggregator`
`DisposeAggregator` is a utility class that allows you to add multiple items and then dispose them all at once.

You can add a function to call, an object with a `dispose` method, or an object with a `Symbol.dispose` method.

To dispose all the items, call `dispose` or use the `Symbol.dispose` symbol.

```typescript
import {DisposeAggregator, EventRelay} from "lifecycle-utils";

const disposeAggregator = new DisposeAggregator();

const eventRelay = new EventRelay<string>();
disposeAggregator.add(eventRelay);

const eventRelay2 = disposeAggregator.add(new EventRelay<string>());

disposeAggregator.dispose();
console.log(eventRelay.disposed === true); // true
console.log(eventRelay2.disposed === true); // true
```

### `AsyncDisposeAggregator`
`AsyncDisposeAggregator` is a utility class that allows you to add multiple items and then dispose them all at once.
The items are disposed one by one in the order they were added.
When the `parallel` option is enabled, then all the items are disposed in parallel,
triggered by the order in which they were added.

You can add a function to call, an object with a `dispose` method, an object with a `Symbol.dispose` method,
an object with a `Symbol.asyncDispose` method, or a Promise that resolves to one of the previous types.

To dispose all the items, call `dispose` or use the `Symbol.asyncDispose` symbol.

The difference between `AsyncDisposeAggregator` and `DisposeAggregator` is that `AsyncDisposeAggregator` can dispose async targets.

```typescript
import {AsyncDisposeAggregator, EventRelay} from "lifecycle-utils";

const disposeAggregator = new AsyncDisposeAggregator();

const eventRelay = new EventRelay<string>();
disposeAggregator.add(eventRelay);

disposeAggregator.add(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    // do some async work
});

disposeAggregator.dispose();
```

With the `parallel` option enabled:
```typescript
import {AsyncDisposeAggregator, EventRelay} from "lifecycle-utils";

const disposeAggregator = new AsyncDisposeAggregator({parallel: true});

const eventRelay = new EventRelay<string>();
disposeAggregator.add(eventRelay);

disposeAggregator.add(async () => {
    console.log("1");
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log("4");
});
disposeAggregator.add(async () => {
    console.log("2");
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log("3");
});

disposeAggregator.dispose();
// will print:
// 1
// 2
// 3
// 4
```

### `DisposableHandle`
An object that provides a `.dispose()` method that can called only once.

Calling `.dispose()` will call the provided `onDispose` function only once.
Any subsequent calls to `.dispose()` will do nothing.

```typescript
import {DisposableHandle} from "lifecycle-utils";

function createHandle() {
    console.log("allocating resources");
    
    return new DisposableHandle(() => {
        console.log("resources disposed");
    });
}

const handle = createHandle();
handle.dispose();
```

Using the `using` feature of TypeScript is also supported:
```typescript
import {DisposableHandle} from "lifecycle-utils";

function createHandle() {
    console.log("allocating resources");
    
    return new DisposableHandle(() => {
        console.log("resources disposed");
    });
}

function doWork() {
    using handle = createHandle();
}

doWork();
// resources disposed
// the dispose function was called since the scope of the `doWork` function ended
```

### `AsyncDisposableHandle`
An object that provides an async `.dispose()` method that can called only once.

Calling `.dispose()` will call the provided `onDispose` function only once.
Any subsequent calls to `.dispose()` will do nothing.

```typescript
import {AsyncDisposableHandle} from "lifecycle-utils";

function createHandle() {
    console.log("allocating resources");
    
    return new AsyncDisposableHandle(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("resources disposed");
    });
}

const handle = createHandle();
await handle.dispose();
```

Using the `await using` feature of TypeScript is also supported:
```typescript
import {AsyncDisposableHandle} from "lifecycle-utils";

function createHandle() {
    console.log("allocating resources");

    return new AsyncDisposableHandle(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("resources disposed");
    });
}

async function doWork() {
    await using handle = createHandle();
}

await doWork();
// resources disposed
// the dispose function was called since the scope of the `doWork` function ended
```

### `MultiKeyMap`
`MultiKeyMap` is a utility class that works like a `Map`, but accepts multiple values as the key for each value.

`.set(...)`, `.get(...)`, `.has(...)`, `.delete(...)` are in time complexity of O(1), given that the length of the keys is constant.

```typescript
import {MultiKeyMap} from "lifecycle-utils";

type Provider = {name: string};
const provider1: Provider = {name: "1"};
const provider2: Provider = {name: "2"};

const map = new MultiKeyMap<[provider: Provider, name: string], number>();

map.set([provider1, "key1"], 1);
map.set([provider2, "key1"], 2);
map.set([provider1, "key2"], 3);

console.log(map.get([provider1, "key1"])); // 1
console.log(map.get([provider2, "key1"])); // 2
console.log(map.get([provider1, "key2"])); // 3

console.log([...map.keys()]); // [[{name: "1"}, "key1"], [{name: "2"}, "key1"], [{name: "1"}, "key2"]])
```

### `WeakValueMultiKeyMap`
`WeakValueMultiKeyMap` is a utility class that works like a [`MultiKeyMap`](#multikeymap), but doesn't keep strong references to the values.

When a value is garbage collected, it is automatically removed from the map.

```typescript
import {WeakValueMultiKeyMap} from "lifecycle-utils";

type Provider = {name: string};

const map = new WeakValueMultiKeyMap<[type: string, name: string], Provider>();

{
    const provider1: Provider = {name: "1"};
    map.set(["type1", "key1"], provider1);

    console.log(map.has(["type1", "key1"])); // true
    console.log(map.get(["type1", "key1"])); // {name: "1"}
    console.log(map.size); // 1
}

// wait for the runtime to run garbage collection
await new Promise(resolve => setTimeout(resolve, 1000 * 60 * 10));

console.log(map.has(["type1", "key1"])); // false
console.log(map.get(["type1", "key1"])); // undefined
console.log(map.size); // 0
```

### `WeakValueMap`
`WeakValueMap` is a utility class that works like a `Map`, but doesn't keep strong references to the values.

When a value is garbage collected, it is automatically removed from the map.

```typescript
import {WeakValueMap} from "lifecycle-utils";

type Provider = {name: string};

const map = new WeakValueMap<string, Provider>();

{
    const provider1: Provider = {name: "1"};
    map.set("provider1", provider1);

    console.log(map.has("provider1")); // true
    console.log(map.get("provider1")); // {name: "1"}
    console.log(map.size); // 1
}

// wait for the runtime to run garbage collection
await new Promise(resolve => setTimeout(resolve, 1000 * 60 * 10));

console.log(map.has("provider1")); // false
console.log(map.get("provider1")); // undefined
console.log(map.size); // 0
```

### `LongTimeout`
A timeout that can be set to a delay longer than the maximum timeout delay supported by a regular `setTimeout`.

```typescript
import {LongTimeout} from "lifecycle-utils";

const month = 1000 * 60 * 60 * 24 * 7 * 30;

const timeout = new LongTimeout(() => {
    console.log("timeout");
}, month);

// to clear the timeout, call dispose
// timeout.dispose();
```

### `setLongTimeout`
Sets a timeout that can also be set to a delay longer than the maximum timeout delay supported by a regular `setTimeout`.

You can use `clearLongTimeout` to clear the timeout.

```typescript
import {setLongTimeout, clearLongTimeout} from "lifecycle-utils";

const month = 1000 * 60 * 60 * 24 * 7 * 30;

const timeout = setLongTimeout(() => {
    console.log("timeout");
}, month);

// to clear the timeout, call clearLongTimeout
// clearLongTimeout(timeout);
```

### `clearLongTimeout`
Clears a timeout that was set with `setLongTimeout`.

You can also clear a regular timeout with this function.

```typescript
import {setLongTimeout, clearLongTimeout} from "lifecycle-utils";

const month = 1000 * 60 * 60 * 24 * 7 * 30;

const timeout = setLongTimeout(() => {
    console.log("timeout");
}, month);
const timeout2 = setTimeout(() => {
    console.log("timeout2");
}, 1000 * 60);

clearLongTimeout(timeout);
clearLongTimeout(timeout2);
```

### `State`
`State` is a utility class that allows you to hold a value and notify listeners when the value changes.

```typescript
import {State} from "lifecycle-utils";

const valueState = new State<number>(6);

const eventHandle = valueState.createChangeListener((newValue, previousValue) => {
    console.log("new value:", newValue);
    console.log("previous value:", previousValue);
});

valueState.state = 7;

// after a microtask, the listener will be called
// to make event fire immediately upon change, disable the `queueEvents` option on the constructor
await new Promise(resolve => setTimeout(resolve, 0));
// will print:
// new value: 7
// previous value: 6

eventHandle.dispose();
```

### `State.createCombinedChangeListener`
Create a listener that listens to multiple states and calls the callback when any of the states change.

```typescript
import {State} from "lifecycle-utils";

const valueState1 = new State<number>(6);
const valueState2 = new State<string>("hello");
const valueState3 = new State<boolean>(true);

const eventHandle = State.createCombinedChangeListener([valueState1, valueState2, valueState3], (newValues, previousValues) => {
    console.log("new values:", newValues);
    console.log("previous values:", previousValues);
});

valueState1.state = 7;
valueState2.state = "world";
valueState3.state = false;

// after a microtask, the listener will be called
// to make event fire immediately upon change, disable the `queueEvents` option on the constructor
await new Promise(resolve => setTimeout(resolve, 0));
// will print:
// new values: [7, "world", false]
// previous values: [6, "hello", true]

eventHandle.dispose();
```

### `splitText`
Split a text by multiple separators, and return a result of the text and separators.

```typescript
const parts = splitText("Hello <and> world [then] !", ["<and>", "[then]"]);
console.log(parts); // ["Hello ", new Separator("<and>"), " world ", new Separator("[then]"), " !"]
```

### `Queue`
An efficient queue implementation that allows you to enqueue and dequeue items in `O(1)` time complexity.

```typescript
import {Queue} from "lifecycle-utils";

const queue = new Queue([1, 2, 3]);

queue.push(4);
console.log(queue.shift()); // 1

console.log(queue.first); // 2
console.log(queue.last); // 4
console.log(queue.length); // 3
console.log([...queue]); // [2, 3, 4]
```

### `scopeExit`
Create a scope exit handle that will call the provided callback when disposed, to be used with `using` or `await using`.

For example, this code:
```typescript
import {scopeExit} from "lifecycle-utils";

function example() {
    using exitHandle = scopeExit(() => {
        console.log("exiting scope");
    });
    console.log("inside scope");
}

async function asyncExample() {
    await using exitHandle = scopeExit(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        console.log("exiting async scope");
    });
    console.log("inside async scope");
}

example();
console.log("example done");
console.log()

await asyncExample();
console.log("asyncExample done");
```

Will print this:
```
inside scope
exiting scope
example done

inside async scope
exiting async scope
asyncExample done
```

### `registerFinalizer`
Register a finalizer for a given target, so that the finalizer is called after the target is garbage-collected.

A finalizer can be a function to call, an object to dispose, or a promise that resolves to one of the previous types.

```typescript
import {DisposeAggregator, registerFinalizer} from "lifecycle-utils";

const disposeAggregator = new DisposeAggregator();
disposeAggregator.add(() => console.log("disposed"));

let obj: {} | null = {};
registerFinalizer(obj, disposeAggregator);

obj = null; // get rid of a reference to the object
await new Promise((accept) => setTimeout(accept, 1000 * 10)); // wait for the garbage collector

// disposed
```

```typescript
import {registerFinalizer} from "lifecycle-utils";

let disposed1 = false;
let disposed2 = false;

let obj: {} | null = {};
const handle1 = registerFinalizer(obj, () => {
    disposed1 = true;
});
const handle2 = registerFinalizer(obj, () => {
    disposed2 = true;
});

console.log(disposed2.finalized); // false

handle1.dispose(); // remove the finalizer
obj = null; // get rid of a reference to the object

await new Promise((accept) => setTimeout(accept, 1000 * 10)); // wait for the garbage collector

console.log(disposed1); // false, because we removed the finalizer
console.log(disposed2); // true

console.log(disposed2.finalized); // true
```

### `sleep`
Wait for a given duration.
An optional `AbortSignal` can be provided to abort the wait.

```typescript
import {sleep} from "lifecycle-utils";

await sleep(1000);

const controller = new AbortController();

const promise = sleep(1000, controller.signal);
controller.abort();

await promise; // rejected with controller.signal.reason
```

### `AbortablePromise`
A Promise that can be rejected by an optional `AbortSignal`.

The executor can return a cleanup callback that will be called when the promise is resolved, rejected, or aborted.

```typescript
import {AbortablePromise} from "lifecycle-utils";

const controller = new AbortController();

const promise = new AbortablePromise<number>(controller.signal, (resolve) => {
    const timeout = setTimeout(() => resolve(42), 1000);

    return () => {
        clearTimeout(timeout);
    };
});

controller.abort();

await promise; // rejected with controller.signal.reason
```

An existing Promise can be wrapped with an abort signal using `AbortablePromise.withSignal`:
```typescript
const promise = AbortablePromise.withSignal(
    controller.signal,
    doSomething()
);
```

`AbortablePromise` also provides abortable versions of `Promise.all`, `Promise.race`, `Promise.any`, and `Promise.allSettled`:
```typescript
const res = await AbortablePromise.all(controller.signal, [
    promise1,
    promise2
]);
```

### `withSingleFlight`
Calling `withSingleFlight` runs its callback at most once in parallel for the given `scope` values,
with parallel callers sharing the active callback's result.
The result is only shared with other callers while the callback is running; later calls will run the callback again.

The callback holds an exclusive lock for the given `scope` while it runs.
The callback accepts a `signal` argument that indicates when it should abort its execution.
Aborting a caller makes its promise reject immediately,
but only aborts the running callback's `signal` when no other callers are waiting for its result.

```typescript
import {withSingleFlight, sleep} from "lifecycle-utils";

const scope = {};
let callCount = 0;

async function getValue() {
    return await withSingleFlight([scope, "myKey"], async () => {
        const value = ++callCount;
        await sleep(100);
        return value;
    });
}

const first = getValue();
await sleep(10);
const second = getValue();
await sleep(10);
const third = getValue();

console.log(await first); // 1
console.log(await second); // 1
console.log(await third); // 1
console.log(callCount); // 1

console.log(await getValue()); // 2
console.log(callCount); // 2
```

```typescript
import {withSingleFlight, sleep} from "lifecycle-utils";

const scope = {};
let callCount = 0;
let aborted = false;
let done = false;

function getValue(signal?: AbortSignal) {
    return withSingleFlight([scope, "myKey"], signal, async (signal) => {
        signal.addEventListener("abort", () => {
            aborted = true;
        });

        const value = ++callCount;
        await sleep(100);

        done = true;
        return value;
    });
}

const firstController = new AbortController();
const secondController = new AbortController();

const first = getValue(firstController.signal);
await sleep(10);
const second = getValue(secondController.signal);

firstController.abort(new Error("Canceled"));

try {
    await first;
} catch (err) {
    console.log((err as Error).message); // "Canceled"
}

console.log(callCount); // 1
console.log(done); // false
console.log(aborted); // false

console.log(await second); // 1
console.log(callCount); // 1
console.log(done); // true
console.log(aborted); // false
```

### `Retainer`
A utility for retaining a resource while it's being used,
and for draining it by blocking new retain requests and waiting for existing retains to be released.

`tryRetain` acquires a retain handle if no drain is active or pending.
`acquireDrain` prevents new retain handles from being acquired, waits for existing retain handles to be released,
and resolves with a drain handle that keeps the retainer drained until disposed.

Multiple drain handles can be held in parallel.
New retain handles are allowed again when the last drain handle is disposed.
```typescript
import {Retainer, sleep} from "lifecycle-utils";

class MyClass {
    private _retainer = new Retainer();

    async useResource() {
        using handle = this._retainer.tryRetain(() => new Error("Resource is draining"));
        
        console.log("using resource");
        await sleep(1000);
        console.log("done using resource");
    }

    async drain() {
        console.log("awaiting drain");
        using drain = await this._retainer.acquireDrain();

        // no retained usages are active while the drain handle is held
        console.log("drain started");
        await sleep(1000);
    }
}

const myClass = new MyClass();

const usePromise = myClass.useResource();
const drainPromise = myClass.drain();

await myClass.useResource().catch(console.log);
await Promise.all([usePromise, drainPromise]);

// using resource
// awaiting drain
// Error: Resource is draining
// done using resource
// drain started
```

### `ScopedRetainer`
A scoped version of [`Retainer`](#retainer) that coordinates retains and drains independently for each scope.

A scope consists of one or more values that identify a resource or context to retain or drain.
Draining one scope does not affect other scopes.
```typescript
import {ScopedRetainer, sleep} from "lifecycle-utils";

const retainer = new ScopedRetainer<[clientId: string]>();

async function useClient(clientId: string) {
    using handle = retainer.tryRetain([clientId], () => new Error(clientId + " is draining"));

    console.log("using " + clientId);
    await sleep(1000);
    console.log("done using " + clientId);
}

async function drainClient(clientId: string) {
    console.log("awaiting drain for " + clientId);
    using drain = await retainer.acquireDrain([clientId]);

    // no retained usages for this client are active while the drain handle is held
    console.log("drain started for " + clientId);
    await sleep(1000);
}

const usePromise = useClient("client1");
const drainPromise = drainClient("client1");

await useClient("client1").catch(console.log);
await useClient("client2");
await Promise.all([usePromise, drainPromise]);

// using client1
// awaiting drain for client1
// Error: client1 is draining
// using client2
// done using client1
// drain started for client1
// done using client2
```

## Contributing
To contribute to `lifecycle-utils` see [CONTRIBUTING.md](https://github.com/giladgd/lifecycle-utils/blob/master/CONTRIBUTING.md).


<br />

<div align="center" width="360">
    <img alt="Star please" src="https://raw.githubusercontent.com/giladgd/lifecycle-utils/master/assets/star.please.roundEdges.png" width="360" margin="auto" />
    <br/>
    <p align="right">
        <i>If you like this repo, star it ✨</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    </p>
</div>
