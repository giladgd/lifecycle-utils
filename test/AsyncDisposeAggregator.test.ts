import {describe, expect, test} from "vitest";
import {AsyncDisposeAggregator, DisposedError} from "../src/index.js";

describe("AsyncDisposeAggregator", () => {
    test("events are dispatched", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();

        const stub = new DisposeStub();
        const asyncStub = new AsyncDisposeStub();
        const symbolStub = new DisposeSymbolStub();
        const asyncSymbolStub = new AsyncDisposeSymbolStub();
        const stub2 = new DisposeStub();
        const stub3 = new DisposeStub();
        let functionDisposeCalled = false;

        expect(stub.disposed).toBe(false);
        expect(asyncStub.disposed).toBe(false);
        expect(symbolStub.disposed).toBe(false);
        expect(asyncSymbolStub.disposed).toBe(false);

        disposeAggregator.add(stub);
        disposeAggregator.add(asyncStub);

        expect(disposeAggregator.targetCount).toBe(2);

        disposeAggregator.add(symbolStub);
        disposeAggregator.add(asyncSymbolStub);
        disposeAggregator.add(() => {
            functionDisposeCalled = true;
        });
        disposeAggregator.add(Promise.resolve(stub2));

        expect(disposeAggregator.targetCount).toBe(6);

        await disposeAggregator.dispose();

        expect(disposeAggregator.targetCount).toBe(0);
        expect(stub.disposed).toBe(true);
        expect(asyncStub.disposed).toBe(true);
        expect(symbolStub.disposed).toBe(true);
        expect(asyncSymbolStub.disposed).toBe(true);
        expect(functionDisposeCalled).toBe(true);
        expect(stub2.disposed).toBe(true);
        expect(stub3.disposed).toBe(false);

        await disposeAggregator.dispose(); // shouldn't throw
    });

    test("targets are disposed sequentially by default", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();
        const firstDispose = createDeferredPromise();
        const events: string[] = [];

        disposeAggregator.add(async () => {
            events.push("first start");
            await firstDispose.promise;
            events.push("first end");
        });
        disposeAggregator.add(() => {
            events.push("second");
        });

        const disposePromise = disposeAggregator.dispose();

        await Promise.resolve();

        expect(disposeAggregator.targetCount).toBe(0);
        expect(events).toEqual(["first start"]);

        firstDispose.resolve();
        await disposePromise;

        expect(events).toEqual([
            "first start",
            "first end",
            "second"
        ]);
    });

    test("targets are disposed in parallel", async () => {
        const disposeAggregator = new AsyncDisposeAggregator({parallel: true});
        const firstDispose = createDeferredPromise();
        const secondDispose = createDeferredPromise();
        const events: string[] = [];

        disposeAggregator.add(async () => {
            events.push("first start");
            await firstDispose.promise;
            events.push("first end");
        });
        disposeAggregator.add(async () => {
            events.push("second start");
            await secondDispose.promise;
            events.push("second end");
        });
        disposeAggregator.add(() => {
            events.push("third");
        });

        const disposePromise = disposeAggregator.dispose();

        await Promise.resolve();

        expect(disposeAggregator.targetCount).toBe(0);
        expect(events).toEqual([
            "first start",
            "second start",
            "third"
        ]);

        secondDispose.resolve();
        await Promise.resolve();

        expect(events).toEqual([
            "first start",
            "second start",
            "third",
            "second end"
        ]);

        firstDispose.resolve();
        await disposePromise;

        expect(events).toEqual([
            "first start",
            "second start",
            "third",
            "second end",
            "first end"
        ]);
    });

    test("dispose calls while disposing wait for the same disposal", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();
        const targetDispose = createDeferredPromise();

        disposeAggregator.add(() => targetDispose.promise);

        const disposePromise = disposeAggregator.dispose();

        expect(disposeAggregator.dispose()).toBe(disposePromise);
        expect(disposeAggregator[Symbol.asyncDispose]()).toBe(disposePromise);

        let disposeFinished = false;
        void disposeAggregator.dispose().then(() => {
            disposeFinished = true;
        });

        await Promise.resolve();

        expect(disposeFinished).toBe(false);

        targetDispose.resolve();
        await disposePromise;

        expect(disposeFinished).toBe(true);

        await disposeAggregator.dispose(); // shouldn't throw
        await disposeAggregator[Symbol.asyncDispose](); // shouldn't throw
    });

    test("cannot add targets after disposal starts", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();

        disposeAggregator.add(() => {
            expect(() => disposeAggregator.add(() => {})).toThrow(DisposedError);
        });

        const disposePromise = disposeAggregator.dispose();

        expect(() => disposeAggregator.add(() => {})).toThrow(DisposedError);

        await disposePromise;

        expect(() => disposeAggregator.add(() => {})).toThrow(DisposedError);
    });

    test("sequential disposal continues after errors and throws the first error", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();
        const firstError = new Error("first");
        const secondError = new Error("second");
        const events: string[] = [];

        disposeAggregator.add(() => {
            events.push("first");
            throw firstError;
        });
        disposeAggregator.add(async () => {
            events.push("second start");
            await Promise.resolve();
            events.push("second end");
            throw secondError;
        });
        disposeAggregator.add(() => {
            events.push("third");
        });

        await expect(disposeAggregator.dispose()).rejects.toBe(firstError);

        expect(disposeAggregator.targetCount).toBe(0);
        expect(events).toEqual([
            "first",
            "second start",
            "second end",
            "third"
        ]);

        await disposeAggregator.dispose(); // shouldn't throw again
    });

    test("falsy disposal errors are thrown", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();

        disposeAggregator.add(() => Promise.reject(undefined));

        await expect(disposeAggregator.dispose()).rejects.toBeUndefined();
    });

    test("rejected target promises are thrown", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();
        const error = new Error("target rejected");

        disposeAggregator.add(Promise.reject(error));

        await expect(disposeAggregator.dispose()).rejects.toBe(error);
    });

    test("parallel disposal waits for all targets before throwing", async () => {
        const disposeAggregator = new AsyncDisposeAggregator({parallel: true});
        const firstDispose = createDeferredPromise();
        const lastDispose = createDeferredPromise();
        const firstError = new Error("first");
        const secondError = new Error("second");
        let lastDisposed = false;

        disposeAggregator.add(async () => {
            await firstDispose.promise;
            throw firstError;
        });
        disposeAggregator.add(() => {
            throw secondError;
        });
        disposeAggregator.add(async () => {
            await lastDispose.promise;
            lastDisposed = true;
        });

        const disposePromise = disposeAggregator.dispose();
        let disposeFinished = false;

        void disposePromise.then(() => {
            disposeFinished = true;
        }, () => {
            disposeFinished = true;
        });

        await Promise.resolve();

        firstDispose.resolve();
        await Promise.resolve();

        expect(disposeFinished).toBe(false);
        expect(lastDisposed).toBe(false);

        lastDispose.resolve();

        await expect(disposePromise).rejects.toBe(firstError);

        expect(lastDisposed).toBe(true);
        expect(disposeFinished).toBe(true);
    });

    test("parallel disposal throws synchronous errors in target order", async () => {
        const disposeAggregator = new AsyncDisposeAggregator({parallel: true});
        const firstError = new Error("first");
        const secondError = new Error("second");
        const thirdError = new Error("third");
        let lastTargetCalled = false;

        disposeAggregator.add(async () => {
            await Promise.resolve();
        });
        disposeAggregator.add(() => {
            throw firstError;
        });
        disposeAggregator.add(() => {
            throw secondError;
        });
        disposeAggregator.add(async () => {
            lastTargetCalled = true;
            throw thirdError;
        });

        await expect(disposeAggregator.dispose()).rejects.toBe(firstError);

        expect(lastTargetCalled).toBe(true);
    });

    test("parallel disposal throws asynchronous errors in target order", async () => {
        const disposeAggregator = new AsyncDisposeAggregator({parallel: true});
        const firstDispose = createDeferredPromise();
        const secondDispose = createDeferredPromise();
        const firstError = new Error("first");
        const secondError = new Error("second");

        disposeAggregator.add(async () => {
            await firstDispose.promise;
            throw firstError;
        });
        disposeAggregator.add(async () => {
            await secondDispose.promise;
            throw secondError;
        });

        const disposePromise = disposeAggregator.dispose();

        await Promise.resolve();

        secondDispose.resolve();
        await Promise.resolve();

        firstDispose.resolve();

        await expect(disposePromise).rejects.toBe(firstError);
    });

    test("self targets are ignored", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();

        disposeAggregator.add(disposeAggregator);
        disposeAggregator.add(disposeAggregator.dispose);
        disposeAggregator.add(disposeAggregator[Symbol.asyncDispose]);
        disposeAggregator.add(Promise.resolve(disposeAggregator));
        disposeAggregator.add(new WeakRef(disposeAggregator));

        expect(disposeAggregator.targetCount).toBe(5);

        await disposeAggregator.dispose();

        expect(disposeAggregator.targetCount).toBe(0);
    });

    test("WeakRef, Symbol.asyncDispose", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();

        const stub = new DisposeStub();
        expect(stub.disposed).toBe(false);

        disposeAggregator.add(new WeakRef(stub));
        expect(disposeAggregator.targetCount).toBe(1);

        await disposeAggregator[Symbol.asyncDispose]();

        expect(stub.disposed).toBe(true);
    });
});

class DisposeStub {
    public disposed: boolean = false;

    public dispose() {
        this.disposed = true;
    }
}

class AsyncDisposeStub {
    public disposed: boolean = false;

    public async dispose() {
        await new Promise((resolve) => setTimeout(resolve, 0));
        this.disposed = true;
    }
}

class DisposeSymbolStub {
    public disposed: boolean = false;

    public [Symbol.dispose]() {
        this.disposed = true;
    }
}

class AsyncDisposeSymbolStub {
    public disposed: boolean = false;

    public async [Symbol.asyncDispose]() {
        await new Promise((resolve) => setTimeout(resolve, 0));
        this.disposed = true;
    }
}

function createDeferredPromise() {
    let resolvePromise: (() => void) | undefined;
    const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
    });

    return {
        promise,
        resolve() {
            resolvePromise?.();
        }
    };
}
