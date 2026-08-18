import {describe, expect, test} from "vitest";
import {
    acquireLock, acquireSharedLock, isLockActive, ValidLockScope, waitForLockRelease, withLock, withSharedLock
} from "../src/index.js";

describe("withLock", () => {
    test("lock works", async () => {
        const scope1 = {};
        const key1 = "key";

        let proceedLock1: ((value: "something") => void) | null = null;
        let lock1Done = false;
        const lockPromise1 = withLock([scope1, key1], async () => {
            const res = await new Promise((accept) => {
                proceedLock1 = accept;
            });
            lock1Done = true;
            return res;
        });

        let proceedLock2: ((value: "something2") => void) | null = null;
        let lock2Done = false;
        const lockPromise2 = withLock([scope1, key1], async () => {
            const res = await new Promise((accept) => {
                proceedLock2 = accept;
            });
            lock2Done = true;
            return res;
        });

        expect(proceedLock1).not.toBeNull();
        expect(proceedLock2).toBeNull();
        expect(lock1Done).toBe(false);
        expect(lock2Done).toBe(false);
        expect(isLockActive([scope1, key1])).toBe(true);

        proceedLock1!("something");
        await expect(lockPromise1).resolves.toBe("something");
        expect(isLockActive([scope1, key1])).toBe(true);
        await new Promise((accept) => setTimeout(accept, 0));
        expect(isLockActive([scope1, key1])).toBe(true);

        expect(proceedLock2).not.toBeNull();
        expect(lock2Done).toBe(false);

        proceedLock2!("something2");
        await expect(lockPromise2).resolves.toBe("something2");
        expect(isLockActive([scope1, key1])).toBe(false);
        await new Promise((accept) => setTimeout(accept, 0));
        expect(lock2Done).toBe(true);

        expect(isLockActive([scope1, key1])).toBe(false);
    });

    test("lock works with acquireLockSignal", async () => {
        const scope1 = {};
        const key1 = "key";

        const waitForEnoughMicrotasks = async () => {
            for (let i = 0; i < 10; i++)
                await Promise.resolve();
        };

        let proceedLock1: ((value: "something") => void) | null = null;
        let lock1Done = false;
        let lock1Error: any = undefined;
        const lock1Controller = new AbortController();
        const lockPromise1 = withLock([scope1, key1], lock1Controller.signal, async () => {
            const res = await new Promise((accept) => {
                proceedLock1 = accept;
            });
            lock1Done = true;
            return res;
        })
            .catch((error) => {
                lock1Error = error;
            });

        let proceedLock2: ((value: "something2") => void) | null = null;
        let lock2Done = false;
        let lock2Error: any = undefined;
        const lock2Controller = new AbortController();
        withLock([scope1, key1], lock2Controller.signal, async () => {
            const res = await new Promise((accept) => {
                proceedLock2 = accept;
            });
            lock2Done = true;
            return res;
        })
            .catch((error) => {
                lock2Error = error;
            });

        expect(proceedLock1).not.toBeNull();
        expect(proceedLock2).toBeNull();
        expect(lock1Error).toBeUndefined();
        expect(lock2Error).toBeUndefined();
        expect(lock1Done).toBe(false);
        expect(lock2Done).toBe(false);
        expect(isLockActive([scope1, key1])).toBe(true);

        lock1Controller.abort(new TestError());

        expect(proceedLock1).not.toBeNull();
        expect(proceedLock2).toBeNull();
        expect(lock1Error).toBeUndefined();
        expect(lock2Error).toBeUndefined();
        expect(lock1Done).toBe(false);
        expect(lock2Done).toBe(false);
        expect(isLockActive([scope1, key1])).toBe(true);

        lock2Controller.abort(new TestError());

        expect(proceedLock1).not.toBeNull();
        expect(proceedLock2).toBeNull();
        expect(lock1Error).toBeUndefined();
        expect(lock2Error).toBeUndefined();
        expect(lock1Done).toBe(false);
        expect(lock2Done).toBe(false);
        expect(isLockActive([scope1, key1])).toBe(true);

        await waitForEnoughMicrotasks();

        expect(proceedLock1).not.toBeNull();
        expect(proceedLock2).toBeNull();
        expect(lock1Error).toBeUndefined();
        expect(lock2Error).to.be.instanceof(TestError);
        expect(lock1Done).toBe(false);
        expect(lock2Done).toBe(false);
        expect(isLockActive([scope1, key1])).toBe(true);

        proceedLock1!("something");
        await expect(lockPromise1).resolves.toBe("something");
        expect(isLockActive([scope1, key1])).toBe(false);
        expect(proceedLock2).toBeNull();
        expect(lock2Done).toBe(false);
    });

    test("acquireLock", async () => {
        const scope1 = {};
        const key1 = "key";

        const lock1 = await acquireLock([scope1, key1]);
        expect(isLockActive([scope1, key1])).toBe(true);

        let acquiredLock2 = false;
        const lock2Promise = (async () => {
            const res = await acquireLock([scope1, key1]);
            acquiredLock2 = true;
            return res;
        })();

        expect(acquiredLock2).toBe(false);

        await new Promise((accept) => setTimeout(accept, 0));
        expect(acquiredLock2).toBe(false);

        lock1.dispose();
        await new Promise((accept) => setTimeout(accept, 0));

        expect(isLockActive([scope1, key1])).toBe(true);
        expect(acquiredLock2).toBe(true);

        const lock2 = await lock2Promise;
        lock2[Symbol.dispose]();
        await new Promise((accept) => setTimeout(accept, 0));

        expect(isLockActive([scope1, key1])).toBe(false);
    });

    test("acquireLock with acquireLockSignal", async () => {
        const scope1 = {};
        const key1 = "key";

        const lock1Controller = new AbortController();
        const lock1Promise = acquireLock([scope1, key1], lock1Controller.signal);
        expect(isLockActive([scope1, key1])).toBe(true);

        lock1Controller.abort(new TestError());
        expect(isLockActive([scope1, key1])).toBe(true);

        const lock1 = await lock1Promise;
        expect(isLockActive([scope1, key1])).toBe(true);

        const lock2Controller = new AbortController();
        const lock2Promise = acquireLock([scope1, key1], lock2Controller.signal);

        const lock3Controller = new AbortController();
        const lock3Promise = acquireLock([scope1, key1], lock3Controller.signal);

        lock2Controller.abort(new TestError());
        await expect(lock2Promise).rejects.toBeInstanceOf(TestError);

        lock1.dispose();
        await new Promise((accept) => setTimeout(accept, 0));

        const lock3 = await lock3Promise;
        expect(isLockActive([scope1, key1])).toBe(true);

        lock3.dispose();
        await new Promise((accept) => setTimeout(accept, 0));

        expect(isLockActive([scope1, key1])).toBe(false);
    });

    test("call order", async () => {
        const scope1 = {};
        const key1 = "key";

        const res: number[] = [];

        async function addRow(index: number) {
            await withLock([scope1, key1], async () => {
                await new Promise((resolve) => setTimeout(resolve, 1));
                res.push(index);
            });
        }

        await Promise.all([
            addRow(1),
            addRow(2),
            addRow(3)
        ]);

        expect(res).toEqual([1, 2, 3]);
    });

    test("waitForLockRelease", async () => {
        const scope1 = {};
        const key1 = "key";

        const waitForEnoughMicrotasks = async () => {
            for (let i = 0; i < 10; i++)
                await Promise.resolve();
        };

        const lock1 = await acquireLock([scope1, key1]);

        const lockWithError2 = withLock([scope1, key1], async () => {
            throw new Error("some error");
        });

        let lockReleased = false;
        void (async () => {
            await waitForLockRelease([scope1, key1]);
            lockReleased = true;
        })();

        const lock3Promise = acquireLock([scope1, key1]);

        expect(lockReleased).toBe(false);
        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(false);

        lock1.dispose();
        expect(lockReleased).toBe(false);
        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(false);

        try {
            await lockWithError2;
            expect.unreachable("lockWithError2 should throw");
        } catch (err) {
            expect(lockReleased).toBe(false);
            await waitForEnoughMicrotasks();
            expect(lockReleased).toBe(false);
        }

        const lock2 = await lock3Promise;
        expect(lockReleased).toBe(false);
        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(false);

        lock2.dispose();

        await waitForEnoughMicrotasks();
        expect(lockReleased).toBe(true);
    });

    test("waitForLockRelease with signal", async () => {
        const scope1 = {};
        const key1 = "key";

        const lock1 = await acquireLock([scope1, key1]);

        const lockWithError2 = withLock([scope1, key1], async () => {
            throw new Error("some error");
        });

        const lockReleasedSignal = new AbortController();

        let lockReleased = false;
        const lockReleasePromise = (async () => {
            await waitForLockRelease([scope1, key1], lockReleasedSignal.signal);
            lockReleased = true;
        })();

        expect(lockReleased).toBe(false);
        lockReleasedSignal.abort(new TestError());

        expect(lockReleased).toBe(false);
        await expect(lockReleasePromise).rejects.toBeInstanceOf(TestError);
        expect(lockReleased).toBe(false);

        lock1.dispose();

        try {
            await lockWithError2;
            expect.unreachable("lockWithError2 should throw");
        } catch (err) {
            // do nothing
        }
    });

    test("async locks", async () => {
        const scope1 = {};
        const key1 = "key";

        let proceedLock1: ((value: "something") => void) | null = null;
        let lock1Done = false;
        let proceedLock2: ((value: "something2") => void) | null = null;
        let lock2Done = false;

        const lockPromise1 = withLock([scope1, key1], async () => {
            const res = new Promise((accept) => {
                proceedLock1 = accept;
            });

            void withLock([scope1, key1], async () => {
                const res = new Promise((accept) => {
                    proceedLock2 = accept;
                });
                lock2Done = true;
                return res;
            });

            lock1Done = true;
            return res;
        });

        expect(lock1Done).toBe(true);
        expect(lock2Done).toBe(false);

        expect(proceedLock1).not.toBeNull();
        proceedLock1!("something");

        await expect(lockPromise1).resolves.toBe("something");
        expect(lock2Done).toBe(true);

        expect(proceedLock2).not.toBeNull();
        proceedLock2!("something2");

        await new Promise((accept) => setTimeout(accept, 0));

        expect(isLockActive([scope1, key1])).toBe(false);
    });

    test("scope types", () => {
        const obj = {};
        const obj2 = {a: 1, b: 2};
        const date = new Date();
        const arr: string[] = [];
        const func = () => void 0;
        const obj3 = new TestError();

        class TestClass {}
        const obj4 = new TestClass();

        // valid scopes
        isLockActive([1, obj, 2, 3]);
        isLockActive([obj, 1, 2, 3]);
        isLockActive([1, 2, 3, obj]);
        isLockActive([1, 2, 3, func]);
        isLockActive([1, 2, 3, obj3]);
        isLockActive([1, 2, 3, obj4]);
        isLockActive([date, "a", true]);
        isLockActive([arr]);
        isLockActive([1, 2, obj2, 3]);

        // invalid scopes
        void (checkScopeType([1, 2, 3]) satisfies InvalidLockType);
        void (checkScopeType([1, true, null]) satisfies InvalidLockType);
        void (checkScopeType([]) satisfies InvalidLockType);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        class test {
            public test1() {
                isLockActive([1, this, 2, 3]);
                isLockActive([this, 1, 2, 3]);
                isLockActive([1, 2, 3, this, func]);
                isLockActive([1, 2, 3, func]);
                isLockActive([1, 2, 3, this.test1]);
                isLockActive([1, 2, 3, this.test1, this]);
                isLockActive([1, 2, 3, this, obj3]);
                isLockActive([1, 2, 3, obj3]);
                isLockActive([this]);
                // isLockActive([]);
            }
        }

        // isLockActive([1, 2, 3]);
        // isLockActive([1, true, null]);
        // isLockActive([]);
        // isLockActive([this]);
    });

    test("withLock requires a callback", async () => {
        const scope = {};

        await expect((withLock as any)([scope], undefined)).rejects.toThrow("callback is required");
        expect(isLockActive([scope])).toBe(false);
    });

    test("withLock rejects an already aborted acquireLockSignal", async () => {
        const scope = {};
        const controller = new AbortController();
        const error = new TestError();

        controller.abort(error);

        let callbackCalled = false;

        await expect(
            withLock([scope], controller.signal, () => {
                callbackCalled = true;
            })
        ).rejects.toBe(error);

        expect(callbackCalled).toBe(false);
        expect(isLockActive([scope])).toBe(false);
    });

    test("acquireLock rejects an already aborted acquireLockSignal", async () => {
        const scope = {};
        const controller = new AbortController();
        const error = new TestError();

        controller.abort(error);

        await expect(acquireLock([scope], controller.signal)).rejects.toBe(error);
        expect(isLockActive([scope])).toBe(false);
    });

    test("waitForLockRelease resolves immediately when no lock is active", async () => {
        const scope = {};

        await expect(waitForLockRelease([scope])).resolves.toBeUndefined();
    });

    test("waitForLockRelease rejects an already aborted signal", async () => {
        const scope = {};
        const controller = new AbortController();
        const error = new TestError();

        controller.abort(error);

        await expect(waitForLockRelease([scope], controller.signal)).rejects.toBe(error);
    });

    describe("shared locks", () => {
        test("shared locks run in parallel and a regular lock waits for all of them", async () => {
            const scope = {};
            const key = "key";

            const sharedGate1 = createGate();
            const sharedGate2 = createGate();
            const regularGate = createGate();

            const started: string[] = [];

            const shared1 = withSharedLock([scope, key], async () => {
                started.push("shared1");
                await sharedGate1.promise;
                return 1;
            });

            const shared2 = withSharedLock([scope, key], async () => {
                started.push("shared2");
                await sharedGate2.promise;
                return 2;
            });

            expect(started).toEqual(["shared1", "shared2"]);
            expect(isLockActive([scope, key])).toBe(true);

            const regular = withLock([scope, key], async () => {
                started.push("regular");
                await regularGate.promise;
                return 3;
            });

            await flushMicrotasks();

            expect(started).toEqual(["shared1", "shared2"]);

            sharedGate1.release();
            await expect(shared1).resolves.toBe(1);
            await flushMicrotasks();

            expect(started).toEqual(["shared1", "shared2"]);
            expect(isLockActive([scope, key])).toBe(true);

            sharedGate2.release();
            await expect(shared2).resolves.toBe(2);
            await flushMicrotasks();

            expect(started).toEqual(["shared1", "shared2", "regular"]);
            expect(isLockActive([scope, key])).toBe(true);

            regularGate.release();
            await expect(regular).resolves.toBe(3);

            expect(isLockActive([scope, key])).toBe(false);
        });

        test("consecutive shared locks are grouped while preserving FIFO across regular locks", async () => {
            const scope = {};
            const key = "key";

            const initialLock = await acquireLock([scope, key]);

            const sharedGate1 = createGate();
            const sharedGate2 = createGate();
            const regularGate1 = createGate();
            const sharedGate3 = createGate();
            const sharedGate4 = createGate();
            const regularGate2 = createGate();

            const started: string[] = [];

            const shared1 = withSharedLock([scope, key], async () => {
                started.push("shared1");
                await sharedGate1.promise;
            });

            const shared2 = withSharedLock([scope, key], async () => {
                started.push("shared2");
                await sharedGate2.promise;
            });

            const regular1 = withLock([scope, key], async () => {
                started.push("regular1");
                await regularGate1.promise;
            });

            const shared3 = withSharedLock([scope, key], async () => {
                started.push("shared3");
                await sharedGate3.promise;
            });

            const shared4 = withSharedLock([scope, key], async () => {
                started.push("shared4");
                await sharedGate4.promise;
            });

            const regular2 = withLock([scope, key], async () => {
                started.push("regular2");
                await regularGate2.promise;
            });

            await flushMicrotasks();
            expect(started).toEqual([]);

            initialLock.dispose();
            await flushMicrotasks();

            expect(started).toEqual(["shared1", "shared2"]);

            sharedGate1.release();
            await shared1;
            await flushMicrotasks();

            expect(started).toEqual(["shared1", "shared2"]);

            sharedGate2.release();
            await shared2;
            await flushMicrotasks();

            expect(started).toEqual(["shared1", "shared2", "regular1"]);

            regularGate1.release();
            await regular1;
            await flushMicrotasks();

            expect(started).toEqual([
                "shared1",
                "shared2",
                "regular1",
                "shared3",
                "shared4"
            ]);

            sharedGate3.release();
            await shared3;
            await flushMicrotasks();

            expect(started).not.toContain("regular2");

            sharedGate4.release();
            await shared4;
            await flushMicrotasks();

            expect(started).toEqual([
                "shared1",
                "shared2",
                "regular1",
                "shared3",
                "shared4",
                "regular2"
            ]);

            regularGate2.release();
            await regular2;

            expect(isLockActive([scope, key])).toBe(false);
        });

        test("a shared lock arriving after a queued regular lock does not bypass it", async () => {
            const scope = {};

            const activeSharedGate = createGate();
            const regularGate = createGate();
            const queuedSharedGate = createGate();

            const started: string[] = [];

            const activeShared = withSharedLock([scope], async () => {
                started.push("shared1");
                await activeSharedGate.promise;
            });

            const regular = withLock([scope], async () => {
                started.push("regular");
                await regularGate.promise;
            });

            const queuedShared = withSharedLock([scope], async () => {
                started.push("shared2");
                await queuedSharedGate.promise;
            });

            await flushMicrotasks();

            expect(started).toEqual(["shared1"]);

            activeSharedGate.release();
            await activeShared;
            await flushMicrotasks();

            expect(started).toEqual(["shared1", "regular"]);

            regularGate.release();
            await regular;
            await flushMicrotasks();

            expect(started).toEqual(["shared1", "regular", "shared2"]);

            queuedSharedGate.release();
            await queuedShared;

            expect(isLockActive([scope])).toBe(false);
        });

        test("cancelling the head regular waiter lets following shared locks join the active shared phase", async () => {
            const scope = {};

            const activeShared = await acquireSharedLock([scope]);

            const regularController = new AbortController();
            const regularError = new TestError();

            const regularPromise = acquireLock([scope], regularController.signal);

            const sharedGate = createGate();
            let sharedStarted = false;

            const sharedPromise = withSharedLock([scope], async () => {
                sharedStarted = true;
                await sharedGate.promise;
            });

            await flushMicrotasks();

            expect(sharedStarted).toBe(false);

            regularController.abort(regularError);
            await expect(regularPromise).rejects.toBe(regularError);
            await flushMicrotasks();

            expect(sharedStarted).toBe(true);

            sharedGate.release();
            await sharedPromise;

            expect(isLockActive([scope])).toBe(true);

            activeShared.dispose();

            expect(isLockActive([scope])).toBe(false);
        });

        test("queued shared lock can be aborted", async () => {
            const scope = {};

            const regularLock = await acquireLock([scope]);

            const controller1 = new AbortController();
            const controller2 = new AbortController();

            let shared1Started = false;
            let shared2Started = false;

            const shared1 = withSharedLock([scope], controller1.signal, () => {
                shared1Started = true;
            });

            const sharedGate2 = createGate();
            const shared2 = withSharedLock([scope], controller2.signal, async () => {
                shared2Started = true;
                await sharedGate2.promise;
            });

            const error = new TestError();
            controller1.abort(error);

            await expect(shared1).rejects.toBe(error);

            expect(shared1Started).toBe(false);
            expect(shared2Started).toBe(false);

            regularLock.dispose();
            await flushMicrotasks();

            expect(shared1Started).toBe(false);
            expect(shared2Started).toBe(true);

            /*
             * Once acquired, the signal no longer owns the lifetime of the lock.
             */
            controller2.abort(new TestError());

            sharedGate2.release();
            await shared2;

            expect(isLockActive([scope])).toBe(false);
        });

        test("acquireSharedLock queues and consecutive shared handles acquire together", async () => {
            const scope = {};

            const regularLock = await acquireLock([scope]);

            let acquired1 = false;
            let acquired2 = false;

            const shared1Promise = acquireSharedLock([scope])
                .then((lock) => {
                    acquired1 = true;
                    return lock;
                });

            const controller = new AbortController();

            const shared2Promise = acquireSharedLock([scope], controller.signal)
                .then((lock) => {
                    acquired2 = true;
                    return lock;
                });

            await flushMicrotasks();

            expect(acquired1).toBe(false);
            expect(acquired2).toBe(false);

            regularLock.dispose();
            await flushMicrotasks();

            expect(acquired1).toBe(true);
            expect(acquired2).toBe(true);

            const shared1 = await shared1Promise;
            const shared2 = await shared2Promise;

            // Acquisition signals have no effect after acquisition.
            controller.abort(new TestError());

            let regularAcquired = false;
            const nextRegularPromise = acquireLock([scope])
                .then((lock) => {
                    regularAcquired = true;
                    return lock;
                });

            await flushMicrotasks();
            expect(regularAcquired).toBe(false);

            shared1.dispose();
            shared1.dispose();

            await flushMicrotasks();
            expect(regularAcquired).toBe(false);

            shared2[Symbol.dispose]();
            await flushMicrotasks();

            expect(regularAcquired).toBe(true);

            // Disposal is idempotent.
            shared2.dispose();

            const nextRegular = await nextRegularPromise;
            nextRegular.dispose();

            expect(isLockActive([scope])).toBe(false);
        });

        test("aborted signals reject before acquiring a shared lock", async () => {
            const scope = {};

            const withLockController = new AbortController();
            const withLockError = new TestError();
            withLockController.abort(withLockError);

            let callbackCalled = false;

            await expect(
                withSharedLock([scope], withLockController.signal, () => {
                    callbackCalled = true;
                })
            ).rejects.toBe(withLockError);

            expect(callbackCalled).toBe(false);
            expect(isLockActive([scope])).toBe(false);

            const acquireController = new AbortController();
            const acquireError = new TestError();
            acquireController.abort(acquireError);

            await expect(
                acquireSharedLock([scope], acquireController.signal)
            ).rejects.toBe(acquireError);

            expect(isLockActive([scope])).toBe(false);
        });

        test("shared callback errors release their shared usage", async () => {
            const scope = {};

            const sharedGate = createGate();

            const shared1 = withSharedLock([scope], async () => {
                await sharedGate.promise;
            });

            const error = new TestError();

            const shared2 = withSharedLock([scope], () => {
                throw error;
            });

            await expect(shared2).rejects.toBe(error);

            let regularStarted = false;

            const regular = withLock([scope], () => {
                regularStarted = true;
            });

            await flushMicrotasks();
            expect(regularStarted).toBe(false);

            sharedGate.release();
            await shared1;
            await regular;

            expect(regularStarted).toBe(true);
            expect(isLockActive([scope])).toBe(false);
        });

        test("waitForLockRelease waits for every active shared lock", async () => {
            const scope = {};

            const shared1 = await acquireSharedLock([scope]);
            const shared2 = await acquireSharedLock([scope]);

            let released = false;

            const releasedPromise = waitForLockRelease([scope])
                .then(() => {
                    released = true;
                });

            await flushMicrotasks();
            expect(released).toBe(false);

            shared1.dispose();

            await flushMicrotasks();
            expect(released).toBe(false);

            shared2.dispose();

            await releasedPromise;

            expect(released).toBe(true);
            expect(isLockActive([scope])).toBe(false);
        });

        test("withSharedLock requires a callback at runtime", async () => {
            const scope = {};

            await expect(
                (withSharedLock as any)([scope], undefined)
            ).rejects.toThrow("callback is required");

            expect(isLockActive([scope])).toBe(false);
        });
    });
});


class TestError extends Error {

}


export function checkScopeType<const Scope extends any[]>(scope: Scope): ValidLockScope<Scope> {
    return scope as ValidLockScope<Scope>;
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

type InvalidLockType = ValidLockScope<[]>;
