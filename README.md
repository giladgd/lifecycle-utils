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
Calling `withLock` with the same `scope` and `key` will ensure that the callback inside cannot run in parallel to other calls with the same `scope` and `key`.

```typescript
import { withLock } from "lifecycle-utils";

const scope = {}; // can be reference to any object you like
const startTime = Date.now();

async function doSomething(index: number): number {
    return await withLock(scope, "myKey", async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log("index:", index, "time:", Date.now() - startTime);
        return 42;
    });
}

const res = await Promise.all([
    doSomething(1),
    doSomething(2),
    doSomething(3),
]);

// index: 1 time: 1000
// index: 2 time: 2000
// index: 3 time: 3000

console.log(res); // [42, 42, 42]
```

### `isLockActive`
Check whether a lock is currently active for the given `scope` and `key`.

```typescript
import { isLockActive } from "lifecycle-utils";

const scope = {}; // can be reference to any object you like

const res = isLockActive(scope, "myKey");
console.log(res); // false
```

### `acquireLock`
Acquire a lock for the given `scope` and `key`.

```typescript
import { acquireLock } from "lifecycle-utils";

const scope = {}; // can be reference to any object you like

const activeLock = await acquireLock(scope, "myKey");
console.log("lock acquired");

// ... do some work

activeLock.dispose();
```

## Contributing
To contribute to `lifecycle-utils` see [CONTRIBUTING.md](https://github.com/giladgd/lifecycle-utils/blob/master/CONTRIBUTING.md).


<br />

<div align="center" width="360">
    <img alt="Star please" src="https://media.githubusercontent.com/media/giladgd/lifecycle-utils/master/assets/star.please.roundEdges.png" width="360" margin="auto" />
    <br/>
    <p align="right">
        <i>If you like this repo, star it ✨</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    </p>
</div>
