import {describe, expect, expectTypeOf, test, vi} from "vitest";

import {ScopedRetainer, ScopedRetainerDrainHandle, ScopedRetainerHandle} from "../src/index.js";

type TestScope = [root: object, key: string];

describe("ScopedRetainer", () => {
    describe("basic behavior", () => {
        test("retain handles keep a scope retained until each handle is disposed", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle1 = retainer.tryRetain(scope);
            const handle2 = retainer.tryRetain([root, "key"]);

            expect(handle1).toBeInstanceOf(ScopedRetainerHandle);
            expect(handle2).toBeInstanceOf(ScopedRetainerHandle);
            expect(handle1!.disposed).toBe(false);
            expect(handle2!.disposed).toBe(false);
            expect(retainer.getIsDraining(scope)).toBe(false);

            let drainAcquired = false;
            const drainPromise = retainer.acquireDrain(scope).then((drain) => {
                drainAcquired = true;
                return drain;
            });

            expect(retainer.getIsDraining(scope)).toBe(true);

            handle1!.dispose();
            await Promise.resolve();

            expect(handle1!.disposed).toBe(true);
            expect(handle2!.disposed).toBe(false);
            expect(drainAcquired).toBe(false);

            handle2!.dispose();

            const drain = await drainPromise;
            expect(handle2!.disposed).toBe(true);
            expect(drainAcquired).toBe(true);

            drain.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });

        test("a drain waits for existing retains in its scope and blocks new retains immediately", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle = retainer.tryRetain(scope)!;
            let drainAcquired = false;

            const drainPromise = retainer.acquireDrain([root, "key"]).then((drain) => {
                drainAcquired = true;
                return drain;
            });

            expect(drainPromise.constructor).toBe(Promise);
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(drainAcquired).toBe(false);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            await Promise.resolve();
            expect(drainAcquired).toBe(false);

            handle.dispose();

            const drain = await drainPromise;
            expect(drain).toBeInstanceOf(ScopedRetainerDrainHandle);
            expect(drain.disposed).toBe(false);
            expect(drainAcquired).toBe(true);
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            drain.dispose();

            expect(drain.disposed).toBe(true);
            expect(retainer.getIsDraining(scope)).toBe(false);

            const nextHandle = retainer.tryRetain(scope);
            expect(nextHandle).toBeInstanceOf(ScopedRetainerHandle);
            nextHandle!.dispose();
        });

        test("a drain is acquired immediately for a scope without active retains", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];

            const drainPromise = retainer.acquireDrain(scope);

            expect(drainPromise.constructor).toBe(Promise);
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            const drain = await drainPromise;
            expect(drain).toBeInstanceOf(ScopedRetainerDrainHandle);
            expect(drain.disposed).toBe(false);

            drain.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });

        test("multiple drain handles keep a scope drained until the last handle is disposed", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];

            const drain1 = await retainer.acquireDrain(scope);
            const drain2 = await retainer.acquireDrain(scope);
            const drain3 = await retainer.acquireDrain(scope);

            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            drain2.dispose();
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            drain1.dispose();
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            drain3.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);

            const handle = retainer.tryRetain(scope);
            expect(handle).toBeInstanceOf(ScopedRetainerHandle);
            handle!.dispose();
        });

        test("multiple pending drains for one scope are acquired together after the last retain is released", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle1 = retainer.tryRetain(scope)!;
            const handle2 = retainer.tryRetain(scope)!;

            let acquiredDrains = 0;
            const drainPromise1 = retainer.acquireDrain(scope).then((drain) => {
                acquiredDrains++;
                return drain;
            });
            const drainPromise2 = retainer.acquireDrain(scope).then((drain) => {
                acquiredDrains++;
                return drain;
            });

            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(acquiredDrains).toBe(0);

            handle1.dispose();
            await Promise.resolve();
            expect(acquiredDrains).toBe(0);

            handle2.dispose();

            const [drain1, drain2] = await Promise.all([drainPromise1, drainPromise2]);
            expect(acquiredDrains).toBe(2);
            expect(retainer.getIsDraining(scope)).toBe(true);

            drain1.dispose();
            expect(retainer.getIsDraining(scope)).toBe(true);
            drain2.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });
    });

    describe("draining state", () => {
        test("getIsDraining reflects pending and active drains for a scope", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const otherScope: TestScope = [root, "other"];

            expect(retainer.getIsDraining(scope)).toBe(false);
            expect(retainer.getIsDraining(otherScope)).toBe(false);

            const handle = retainer.tryRetain(scope)!;
            expect(retainer.getIsDraining(scope)).toBe(false);

            const drainPromise = retainer.acquireDrain(scope);
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.getIsDraining(otherScope)).toBe(false);

            handle.dispose();
            const drain = await drainPromise;
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.getIsDraining(otherScope)).toBe(false);

            drain.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });

        test("getIsDraining remains true until all drain handles for a scope are disposed", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const drain1 = await retainer.acquireDrain(scope);
            const drain2 = await retainer.acquireDrain(scope);

            expect(retainer.getIsDraining(scope)).toBe(true);

            drain1.dispose();
            expect(retainer.getIsDraining(scope)).toBe(true);

            drain2.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });

        test("getIsDraining returns false when the only pending drain for a scope is aborted", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const controller = new AbortController();
            const error = new TestError("abort");
            const handle = retainer.tryRetain(scope)!;
            const drainPromise = retainer.acquireDrain(scope, controller.signal);

            expect(retainer.getIsDraining(scope)).toBe(true);

            controller.abort(error);
            await expect(drainPromise).rejects.toBe(error);

            expect(retainer.getIsDraining(scope)).toBe(false);

            handle.dispose();
        });
    });

    describe("scope behavior", () => {
        test("different scopes retain and drain independently", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope1: TestScope = [root, "one"];
            const scope2: TestScope = [root, "two"];
            const handle1 = retainer.tryRetain(scope1)!;
            const handle2 = retainer.tryRetain(scope2)!;

            const drainPromise1 = retainer.acquireDrain(scope1);

            expect(retainer.getIsDraining(scope1)).toBe(true);
            expect(retainer.getIsDraining(scope2)).toBe(false);
            expect(retainer.tryRetain(scope1)).toBeUndefined();

            const extraHandle2 = retainer.tryRetain(scope2);
            expect(extraHandle2).toBeInstanceOf(ScopedRetainerHandle);

            handle1.dispose();
            const drain1 = await drainPromise1;

            expect(retainer.getIsDraining(scope1)).toBe(true);
            expect(retainer.getIsDraining(scope2)).toBe(false);
            expect(retainer.tryRetain(scope1)).toBeUndefined();

            const anotherHandle2 = retainer.tryRetain(scope2);
            expect(anotherHandle2).toBeInstanceOf(ScopedRetainerHandle);

            drain1.dispose();
            expect(retainer.getIsDraining(scope1)).toBe(false);

            handle2.dispose();
            extraHandle2!.dispose();
            anotherHandle2!.dispose();
        });

        test("different object identities create different scopes", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root1 = {};
            const root2 = {};
            const handle1 = retainer.tryRetain([root1, "key"])!;
            const handle2 = retainer.tryRetain([root2, "key"])!;

            const drainPromise1 = retainer.acquireDrain([root1, "key"]);

            expect(retainer.getIsDraining([root1, "key"])).toBe(true);
            expect(retainer.getIsDraining([root2, "key"])).toBe(false);
            expect(retainer.tryRetain([root1, "key"])).toBeUndefined();

            const extraHandle2 = retainer.tryRetain([root2, "key"]);
            expect(extraHandle2).toBeInstanceOf(ScopedRetainerHandle);

            handle1.dispose();
            const drain1 = await drainPromise1;

            drain1.dispose();
            handle2.dispose();
            extraHandle2!.dispose();
        });

        test("scope value order matters", async () => {
            const retainer = new ScopedRetainer<[first: object, second: object]>();
            const first = {};
            const second = {};
            const handle = retainer.tryRetain([first, second])!;
            const drainPromise = retainer.acquireDrain([first, second]);

            expect(retainer.getIsDraining([first, second])).toBe(true);
            expect(retainer.getIsDraining([second, first])).toBe(false);

            const reverseHandle = retainer.tryRetain([second, first]);
            expect(reverseHandle).toBeInstanceOf(ScopedRetainerHandle);

            handle.dispose();
            const drain = await drainPromise;

            drain.dispose();
            reverseHandle!.dispose();
        });

        test("supports an empty scope", async () => {
            const retainer = new ScopedRetainer<[]>();
            const handle = retainer.tryRetain([])!;
            const drainPromise = retainer.acquireDrain([]);

            expect(retainer.getIsDraining([])).toBe(true);
            expect(retainer.tryRetain([])).toBeUndefined();

            handle.dispose();
            const drain = await drainPromise;
            drain.dispose();

            expect(retainer.getIsDraining([])).toBe(false);
        });

        test("uses a stable scope snapshot for the lifetime of a state", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle = retainer.tryRetain(scope)!;

            scope[1] = "changed";

            expect(retainer.getIsDraining([root, "key"])).toBe(false);
            expect(retainer.getIsDraining([root, "changed"])).toBe(false);

            const drainPromise = retainer.acquireDrain([root, "key"]);
            expect(retainer.getIsDraining([root, "key"])).toBe(true);
            expect(retainer.getIsDraining([root, "changed"])).toBe(false);
            expect(retainer.tryRetain([root, "key"])).toBeUndefined();

            const changedHandle = retainer.tryRetain([root, "changed"]);
            expect(changedHandle).toBeInstanceOf(ScopedRetainerHandle);

            handle.dispose();
            const drain = await drainPromise;
            drain.dispose();

            expect(retainer.getIsDraining([root, "key"])).toBe(false);
            const originalHandle = retainer.tryRetain([root, "key"]);
            expect(originalHandle).toBeInstanceOf(ScopedRetainerHandle);

            originalHandle!.dispose();
            changedHandle!.dispose();
        });
    });

    describe("errors and overloads", () => {
        test("tryRetain returns undefined for a draining scope when no error is provided", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const drain = await retainer.acquireDrain(scope);

            const handle = retainer.tryRetain(scope);
            expectTypeOf(handle).toEqualTypeOf<ScopedRetainerHandle | undefined>();
            expect(handle).toBeUndefined();

            drain.dispose();
        });

        test("tryRetain throws the provided error for a draining scope", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const error = new TestError("draining");
            const drain = await retainer.acquireDrain(scope);

            expect(() => retainer.tryRetain(scope, error)).toThrow(error);

            drain.dispose();
        });

        test("tryRetain only calls an error factory when retaining the scope fails", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const error = new TestError("draining");
            const createError = vi.fn(() => error);

            const handle = retainer.tryRetain(scope, createError);
            expectTypeOf(handle).toEqualTypeOf<ScopedRetainerHandle>();
            expect(createError).not.toHaveBeenCalled();

            handle.dispose();

            const drain = await retainer.acquireDrain(scope);

            expect(() => retainer.tryRetain(scope, createError)).toThrow(error);
            expect(createError).toHaveBeenCalledOnce();

            drain.dispose();
        });
    });

    describe("cancellation", () => {
        test("an already aborted signal rejects without starting a drain for the scope", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const controller = new AbortController();
            const error = new TestError("already aborted");
            const handle = retainer.tryRetain(scope)!;
            controller.abort(error);

            const drainPromise = retainer.acquireDrain(scope, controller.signal);

            expect(drainPromise.constructor).toBe(Promise);
            await expect(drainPromise).rejects.toBe(error);
            expect(retainer.getIsDraining(scope)).toBe(false);

            const secondHandle = retainer.tryRetain(scope);
            expect(secondHandle).toBeInstanceOf(ScopedRetainerHandle);

            handle.dispose();
            secondHandle!.dispose();
        });

        test("aborting the only pending drain allows new retains in the scope while existing retains remain active", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const controller = new AbortController();
            const error = new TestError("abort");
            const handle1 = retainer.tryRetain(scope)!;
            const drainPromise = retainer.acquireDrain(scope, controller.signal);

            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            controller.abort(error);

            await expect(drainPromise).rejects.toBe(error);
            expect(retainer.getIsDraining(scope)).toBe(false);

            const handle2 = retainer.tryRetain(scope);
            expect(handle2).toBeInstanceOf(ScopedRetainerHandle);

            handle1.dispose();
            handle2!.dispose();
        });

        test("aborting one pending drain keeps other pending drains for the scope active", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const error = new TestError("abort");
            const handle = retainer.tryRetain(scope)!;
            const drainPromise1 = retainer.acquireDrain(scope, controller1.signal);
            const drainPromise2 = retainer.acquireDrain(scope, controller2.signal);

            controller1.abort(error);

            await expect(drainPromise1).rejects.toBe(error);
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            handle.dispose();

            const drain2 = await drainPromise2;
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();
            drain2.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });

        test("aborting every pending drain reopens the scope", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const error1 = new TestError("abort 1");
            const error2 = new TestError("abort 2");
            const handle = retainer.tryRetain(scope)!;
            const drainPromise1 = retainer.acquireDrain(scope, controller1.signal);
            const drainPromise2 = retainer.acquireDrain(scope, controller2.signal);

            controller1.abort(error1);
            await expect(drainPromise1).rejects.toBe(error1);
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            controller2.abort(error2);
            await expect(drainPromise2).rejects.toBe(error2);
            expect(retainer.getIsDraining(scope)).toBe(false);

            const secondHandle = retainer.tryRetain(scope);
            expect(secondHandle).toBeInstanceOf(ScopedRetainerHandle);

            handle.dispose();
            secondHandle!.dispose();
        });

        test("aborting a signal after its pending drain is acquired does not affect the drain handle", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const controller = new AbortController();
            const handle = retainer.tryRetain(scope)!;
            const drainPromise = retainer.acquireDrain(scope, controller.signal);

            handle.dispose();
            const drain = await drainPromise;

            controller.abort(new TestError("ignored"));
            await Promise.resolve();

            expect(drain.disposed).toBe(false);
            expect(retainer.getIsDraining(scope)).toBe(true);
            expect(retainer.tryRetain(scope)).toBeUndefined();

            drain.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });

        test("aborting a signal after an immediate drain is acquired does not affect the drain handle", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const controller = new AbortController();
            const drain = await retainer.acquireDrain(scope, controller.signal);

            controller.abort(new TestError("ignored"));
            await Promise.resolve();

            expect(drain.disposed).toBe(false);
            expect(retainer.getIsDraining(scope)).toBe(true);

            drain.dispose();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });
    });

    describe("handles", () => {
        test("retain handle disposal is idempotent", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle = retainer.tryRetain(scope)!;

            expect(handle.disposed).toBe(false);

            handle.dispose();
            expect(handle.disposed).toBe(true);

            handle.dispose();
            expect(handle.disposed).toBe(true);

            const drain = await retainer.acquireDrain(scope);
            expect(drain).toBeInstanceOf(ScopedRetainerDrainHandle);
            drain.dispose();
        });

        test("retain handle Symbol.dispose works", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle = retainer.tryRetain(scope)!;

            handle[Symbol.dispose]();

            expect(handle.disposed).toBe(true);

            handle[Symbol.dispose]();

            const drain = await retainer.acquireDrain(scope);
            expect(drain).toBeInstanceOf(ScopedRetainerDrainHandle);
            drain.dispose();
        });

        test("retain handle dispose remains bound when detached from the handle", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle = retainer.tryRetain(scope)!;
            const dispose = handle.dispose;

            dispose();

            expect(handle.disposed).toBe(true);

            const drain = await retainer.acquireDrain(scope);
            expect(drain).toBeInstanceOf(ScopedRetainerDrainHandle);
            drain.dispose();
        });

        test("drain handle disposal is idempotent", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const drain = await retainer.acquireDrain(scope);

            expect(drain.disposed).toBe(false);
            expect(retainer.getIsDraining(scope)).toBe(true);

            drain.dispose();
            expect(drain.disposed).toBe(true);
            expect(retainer.getIsDraining(scope)).toBe(false);

            drain.dispose();
            expect(drain.disposed).toBe(true);
            expect(retainer.getIsDraining(scope)).toBe(false);

            const handle = retainer.tryRetain(scope);
            expect(handle).toBeInstanceOf(ScopedRetainerHandle);
            handle!.dispose();
        });

        test("drain handle Symbol.dispose works", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const drain = await retainer.acquireDrain(scope);

            drain[Symbol.dispose]();

            expect(drain.disposed).toBe(true);
            expect(retainer.getIsDraining(scope)).toBe(false);

            drain[Symbol.dispose]();
            expect(retainer.getIsDraining(scope)).toBe(false);
        });

        test("drain handle dispose remains bound when detached from the handle", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const drain = await retainer.acquireDrain(scope);
            const dispose = drain.dispose;

            dispose();

            expect(drain.disposed).toBe(true);
            expect(retainer.getIsDraining(scope)).toBe(false);
        });
    });

    describe("bound methods", () => {
        test("public methods remain bound when detached from the retainer", async () => {
            const retainer = new ScopedRetainer<TestScope>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const tryRetain = retainer.tryRetain;
            const acquireDrain = retainer.acquireDrain;

            const handle = tryRetain(scope);
            expect(handle).toBeInstanceOf(ScopedRetainerHandle);
            handle!.dispose();

            const drain = await acquireDrain(scope);
            expect(drain).toBeInstanceOf(ScopedRetainerDrainHandle);
            drain.dispose();
        });
    });
});

class TestError extends Error {}
