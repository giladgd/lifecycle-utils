import {describe, expect, test} from "vitest";

import {acquireLock, isLockActive, withLock, withSingleFlight} from "../src/index.js";

describe("withSingleFlight", () => {
    describe("basic behavior", () => {
        test("concurrent calls with the same scope share one execution and result", async () => {
            const scope = {};
            const gate = createGate();

            let callbackCalls = 0;
            let callbackSignal: AbortSignal | undefined;

            const promise1 = withSingleFlight([scope], async (signal) => {
                callbackCalls++;
                callbackSignal = signal;

                await gate.promise;
                return 42;
            });
            const promise2 = withSingleFlight([scope], () => {
                callbackCalls++;
                return 84;
            });

            expect(callbackCalls).toBe(1);
            expect(callbackSignal).toBeDefined();
            expect(callbackSignal!.aborted).toBe(false);
            expect(promise2).toBe(promise1);
            expect(isLockActive([scope])).toBe(true);

            gate.release();

            await expect(promise1).resolves.toBe(42);
            await expect(promise2).resolves.toBe(42);
            expect(callbackCalls).toBe(1);

            await flushMicrotasks();
            expect(isLockActive([scope])).toBe(false);
        });

        test("different scopes run independently", async () => {
            const scope1 = {};
            const scope2 = {};
            const gate1 = createGate();
            const gate2 = createGate();

            const started: number[] = [];

            const promise1 = withSingleFlight([scope1], async () => {
                started.push(1);
                await gate1.promise;
                return 1;
            });
            const promise2 = withSingleFlight([scope2], async () => {
                started.push(2);
                await gate2.promise;
                return 2;
            });

            expect(started).toEqual([1, 2]);

            gate1.release();
            gate2.release();

            await expect(promise1).resolves.toBe(1);
            await expect(promise2).resolves.toBe(2);
        });

        test("a new flight starts after the previous flight settles", async () => {
            const scope = {};
            let callbackCalls = 0;

            await expect(
                withSingleFlight([scope], () => ++callbackCalls)
            ).resolves.toBe(1);

            await expect(
                withSingleFlight([scope], () => ++callbackCalls)
            ).resolves.toBe(2);

            expect(callbackCalls).toBe(2);
        });
    });

    describe("return values and overloads", () => {
        test("supports an explicit undefined signal", async () => {
            const scope = {};

            let callbackSignal: AbortSignal | undefined;
            const promise = withSingleFlight([scope], undefined, (signal) => {
                callbackSignal = signal;
                return 42;
            });

            expect(promise.constructor).toBe(Promise);
            await expect(promise).resolves.toBe(42);
            expect(callbackSignal).toBeDefined();
            expect(callbackSignal!.aborted).toBe(false);
        });

        test("signaled calls return a native Promise", async () => {
            const scope = {};
            const controller = new AbortController();

            const promise = withSingleFlight([scope], controller.signal, () => 42);

            expect(promise.constructor).toBe(Promise);
            await expect(promise).resolves.toBe(42);
        });

        test("requires a callback at runtime", async () => {
            const scope = {};

            await expect(
                (withSingleFlight as any)([scope], undefined)
            ).rejects.toThrow("callback is required");

            expect(isLockActive([scope])).toBe(false);
        });
    });

    describe("errors", () => {
        test("concurrent callers share a synchronous callback error", async () => {
            const scope = {};
            const error = new TestError("callback");
            let callbackCalls = 0;

            const promise1 = withSingleFlight([scope], () => {
                callbackCalls++;
                throw error;
            });
            const promise2 = withSingleFlight([scope], () => {
                callbackCalls++;
                return 42;
            });

            expect(callbackCalls).toBe(1);
            expect(promise2).toBe(promise1);

            await expect(promise1).rejects.toBe(error);
            await expect(promise2).rejects.toBe(error);

            await flushMicrotasks();
            expect(isLockActive([scope])).toBe(false);
        });

        test("an ordinary callback rejection does not abort the flight signal", async () => {
            const scope = {};
            const controller = new AbortController();
            const gate = createGate();
            const error = new TestError("callback");

            let callbackSignal: AbortSignal | undefined;

            const promise = withSingleFlight([scope], controller.signal, async (signal) => {
                callbackSignal = signal;
                await gate.promise;
                throw error;
            });

            expect(callbackSignal).toBeDefined();
            expect(callbackSignal!.aborted).toBe(false);

            gate.release();

            await expect(promise).rejects.toBe(error);
            expect(controller.signal.aborted).toBe(false);
            expect(callbackSignal!.aborted).toBe(false);
        });
    });

    describe("cancellation", () => {
        test("aborting one caller does not abort a flight still needed by another caller", async () => {
            const scope = {};
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const error1 = new TestError("caller 1");
            const gate = createGate();

            let callbackCalls = 0;
            let callbackSignal: AbortSignal | undefined;

            const promise1 = withSingleFlight([scope], controller1.signal, async (signal) => {
                callbackCalls++;
                callbackSignal = signal;

                await gate.promise;
                return 42;
            });
            const promise2 = withSingleFlight([scope], controller2.signal, () => {
                callbackCalls++;
                return 84;
            });

            controller1.abort(error1);

            await expect(promise1).rejects.toBe(error1);
            expect(callbackCalls).toBe(1);
            expect(callbackSignal!.aborted).toBe(false);

            gate.release();

            await expect(promise2).resolves.toBe(42);
            expect(callbackSignal!.aborted).toBe(false);
        });

        test("the flight signal aborts only after every signaled caller aborts", async () => {
            const scope = {};
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const error1 = new TestError("caller 1");
            const error2 = new TestError("caller 2");
            const gate = createGate();

            let callbackSignal: AbortSignal | undefined;

            const promise1 = withSingleFlight([scope], controller1.signal, async (signal) => {
                callbackSignal = signal;
                await gate.promise;
                return 42;
            });
            const promise2 = withSingleFlight([scope], controller2.signal, () => 84);

            controller1.abort(error1);

            expect(callbackSignal!.aborted).toBe(false);

            controller2.abort(error2);

            expect(callbackSignal!.aborted).toBe(true);
            expect(callbackSignal!.reason).toBe(error2);

            await expect(promise1).rejects.toBe(error1);
            await expect(promise2).rejects.toBe(error2);

            /*
             * The callers have abandoned the flight, but the callback is still running and therefore still owns the lock.
             */
            expect(isLockActive([scope])).toBe(true);

            gate.release();
            await flushMicrotasks();

            expect(isLockActive([scope])).toBe(false);
        });

        test("an unsignaled caller prevents the shared flight from being aborted", async () => {
            const scope = {};
            const controller = new AbortController();
            const error = new TestError("caller");
            const gate = createGate();

            let callbackSignal: AbortSignal | undefined;

            const promise1 = withSingleFlight([scope], async (signal) => {
                callbackSignal = signal;
                await gate.promise;
                return 42;
            });
            const promise2 = withSingleFlight([scope], controller.signal, () => 84);

            controller.abort(error);

            await expect(promise2).rejects.toBe(error);
            expect(callbackSignal!.aborted).toBe(false);

            gate.release();

            await expect(promise1).resolves.toBe(42);
            expect(callbackSignal!.aborted).toBe(false);
        });

        test("an already aborted signal rejects without starting a flight", async () => {
            const scope = {};
            const controller = new AbortController();
            const error = new TestError("already aborted");

            controller.abort(error);

            let callbackCalled = false;
            const promise = withSingleFlight([scope], controller.signal, () => {
                callbackCalled = true;
            });

            await expect(promise).rejects.toBe(error);
            expect(callbackCalled).toBe(false);
            expect(isLockActive([scope])).toBe(false);
        });

        test("an already aborted signal does not join or affect an existing flight", async () => {
            const scope = {};
            const gate = createGate();

            let callbackSignal: AbortSignal | undefined;
            const promise1 = withSingleFlight([scope], async (signal) => {
                callbackSignal = signal;
                await gate.promise;
                return 42;
            });

            const controller = new AbortController();
            const error = new TestError("already aborted");
            controller.abort(error);

            let secondCallbackCalled = false;
            const promise2 = withSingleFlight([scope], controller.signal, () => {
                secondCallbackCalled = true;
                return 84;
            });

            await expect(promise2).rejects.toBe(error);
            expect(secondCallbackCalled).toBe(false);
            expect(callbackSignal!.aborted).toBe(false);

            gate.release();
            await expect(promise1).resolves.toBe(42);
        });

        test("handles a caller signal aborted synchronously by the callback", async () => {
            const scope = {};
            const controller = new AbortController();
            const error = new TestError("synchronous abort");

            let callbackSignal: AbortSignal | undefined;

            const promise = withSingleFlight([scope], controller.signal, (signal) => {
                callbackSignal = signal;

                controller.abort(error);
                expect(signal.aborted).toBe(false);

                return 42;
            });

            expect(callbackSignal).toBeDefined();
            expect(callbackSignal!.aborted).toBe(true);
            expect(callbackSignal!.reason).toBe(error);

            await expect(promise).rejects.toBe(error);

            await flushMicrotasks();
            expect(isLockActive([scope])).toBe(false);
        });

        test("aborting a caller after it resolves does not abort the completed flight signal", async () => {
            const scope = {};
            const controller = new AbortController();

            let callbackSignal: AbortSignal | undefined;
            const promise = withSingleFlight([scope], controller.signal, (signal) => {
                callbackSignal = signal;
                return 42;
            });

            await expect(promise).resolves.toBe(42);
            expect(callbackSignal!.aborted).toBe(false);

            controller.abort(new TestError("too late"));

            expect(callbackSignal!.aborted).toBe(false);
        });
    });

    describe("lock interaction", () => {
        test("aborting the only caller while queued behind a lock cancels the queued flight", async () => {
            const scope = {};
            const lock = await acquireLock([scope]);
            const controller = new AbortController();
            const error = new TestError("caller");

            let callbackCalled = false;
            const promise = withSingleFlight([scope], controller.signal, () => {
                callbackCalled = true;
                return 42;
            });

            await flushMicrotasks();
            expect(callbackCalled).toBe(false);

            controller.abort(error);

            await expect(promise).rejects.toBe(error);
            await flushMicrotasks();

            expect(callbackCalled).toBe(false);
            expect(isLockActive([scope])).toBe(true);

            lock.dispose();
            await flushMicrotasks();

            expect(callbackCalled).toBe(false);
            expect(isLockActive([scope])).toBe(false);
        });

        test("one caller aborting while a flight is queued does not cancel it for another caller", async () => {
            const scope = {};
            const lock = await acquireLock([scope]);
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const error1 = new TestError("caller 1");

            let callbackCalls = 0;
            const promise1 = withSingleFlight([scope], controller1.signal, () => {
                callbackCalls++;
                return 42;
            });
            const promise2 = withSingleFlight([scope], controller2.signal, () => {
                callbackCalls++;
                return 84;
            });

            controller1.abort(error1);

            await expect(promise1).rejects.toBe(error1);
            expect(callbackCalls).toBe(0);

            lock.dispose();
            await flushMicrotasks();

            await expect(promise2).resolves.toBe(42);
            expect(callbackCalls).toBe(1);
            expect(isLockActive([scope])).toBe(false);
        });

        test("uses the same exclusive lock queue as withLock", async () => {
            const scope = {};
            const initialLock = await acquireLock([scope]);
            const flightGate = createGate();

            const started: string[] = [];

            const flightPromise = withSingleFlight([scope], async () => {
                started.push("flight");
                await flightGate.promise;
                return 1;
            });
            const regularPromise = withLock([scope], () => {
                started.push("regular");
                return 2;
            });

            await flushMicrotasks();
            expect(started).toEqual([]);

            initialLock.dispose();
            await flushMicrotasks();

            expect(started).toEqual(["flight"]);
            expect(isLockActive([scope])).toBe(true);

            flightGate.release();

            await expect(flightPromise).resolves.toBe(1);
            await expect(regularPromise).resolves.toBe(2);

            expect(started).toEqual(["flight", "regular"]);
            expect(isLockActive([scope])).toBe(false);
        });

        test("a replacement flight waits for an abandoned callback to actually settle", async () => {
            const scope = {};
            const controller = new AbortController();
            const error = new TestError("abandoned");
            const firstGate = createGate();

            let firstSignal: AbortSignal | undefined;
            let firstCallbackCalls = 0;

            const firstPromise = withSingleFlight([scope], controller.signal, async (signal) => {
                firstCallbackCalls++;
                firstSignal = signal;

                await firstGate.promise;
                return 1;
            });

            controller.abort(error);

            await expect(firstPromise).rejects.toBe(error);
            expect(firstSignal!.aborted).toBe(true);
            expect(isLockActive([scope])).toBe(true);

            let secondCallbackCalls = 0;
            let thirdCallbackCalls = 0;

            const secondPromise = withSingleFlight([scope], () => {
                secondCallbackCalls++;
                return 2;
            });
            const thirdPromise = withSingleFlight([scope], () => {
                thirdCallbackCalls++;
                return 3;
            });

            expect(secondPromise).toBe(thirdPromise);

            await flushMicrotasks();

            expect(secondCallbackCalls).toBe(0);
            expect(thirdCallbackCalls).toBe(0);
            expect(firstCallbackCalls).toBe(1);

            firstGate.release();

            await expect(secondPromise).resolves.toBe(2);
            await expect(thirdPromise).resolves.toBe(2);

            expect(secondCallbackCalls).toBe(1);
            expect(thirdCallbackCalls).toBe(0);
            expect(firstCallbackCalls).toBe(1);
            expect(isLockActive([scope])).toBe(false);
        });
    });

    describe("reentrancy and scope", () => {
        test("a reentrant call with the same scope joins the flight before withLock returns", async () => {
            const scope = {};

            let nestedPromise: Promise<number> | undefined;
            let nestedCallbackCalled = false;

            const outerPromise = withSingleFlight([scope], () => {
                nestedPromise = withSingleFlight([scope], () => {
                    nestedCallbackCalled = true;
                    return 2;
                });

                return 1;
            });

            expect(nestedPromise).toBeDefined();
            expect(nestedCallbackCalled).toBe(false);
            expect(nestedPromise).not.toBe(outerPromise);

            await expect(outerPromise).resolves.toBe(1);
            await expect(nestedPromise!).resolves.toBe(1);

            expect(nestedCallbackCalled).toBe(false);

            await expect(
                withSingleFlight([scope], () => 3)
            ).resolves.toBe(3);
        });

        test("uses a stable scope snapshot for the lifetime of a flight", async () => {
            const scopeObject = {};
            const scope: [object, string] = [scopeObject, "key"];
            const gate = createGate();

            const promise1 = withSingleFlight(scope, async () => {
                await gate.promise;
                return 42;
            });

            scope[1] = "changed";

            const promise2 = withSingleFlight([scopeObject, "key"], () => 84);

            expect(promise2).toBe(promise1);

            gate.release();

            await expect(promise1).resolves.toBe(42);
            await expect(promise2).resolves.toBe(42);

            await expect(
                withSingleFlight([scopeObject, "key"], () => 84)
            ).resolves.toBe(84);
        });
    });
});


class TestError extends Error {

}

function createGate() {
    let release!: () => void;

    const promise = new Promise<void>((accept) => {
        release = accept;
    });

    return {promise, release};
}

async function flushMicrotasks() {
    for (let i = 0; i < 5; i++)
        await Promise.resolve();
}
