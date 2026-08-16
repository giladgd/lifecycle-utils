import {describe, expect, test, vi} from "vitest";

import {AbortablePromise, sleep} from "../src/index.js";

describe("AbortablePromise", () => {
    describe("constructor", () => {
        test("resolves without a signal and runs cleanup", async () => {
            let resolvePromise: ((value: number) => void) | undefined;
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(undefined, (resolve) => {
                resolvePromise = resolve;
                return cleanup;
            });

            expect(cleanup).not.toHaveBeenCalled();

            resolvePromise!(42);

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(true);
            await expect(promise).resolves.toBe(42);
        });

        test("rejects without a signal and runs cleanup", async () => {
            let rejectPromise: ((reason?: any) => void) | undefined;
            const error = new TestError("reject");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(undefined, (resolve, reject) => {
                rejectPromise = reject;
                return cleanup;
            });

            expect(cleanup).not.toHaveBeenCalled();

            rejectPromise!(error);

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);
        });

        test("runs cleanup returned after a synchronous resolve", async () => {
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(undefined, (resolve) => {
                resolve(42);
                expect(cleanup).not.toHaveBeenCalled();
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(true);
            await expect(promise).resolves.toBe(42);
        });

        test("runs cleanup returned after a synchronous reject", async () => {
            const error = new TestError("reject");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(undefined, (resolve, reject) => {
                reject(error);
                expect(cleanup).not.toHaveBeenCalled();
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);
        });

        test("works without a cleanup callback", async () => {
            const promise = new AbortablePromise<number>(undefined, (resolve) => {
                resolve(42);
            });

            await expect(promise).resolves.toBe(42);
        });

        test("rejects on an asynchronous abort and runs cleanup once", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(controller.signal, () => cleanup);

            controller.abort(error);

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);

            controller.signal.dispatchEvent(new Event("abort"));
            expect(cleanup).toHaveBeenCalledOnce();
        });

        test("rejects when aborted synchronously inside the executor and runs returned cleanup", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(controller.signal, () => {
                controller.abort(error);
                expect(cleanup).not.toHaveBeenCalled();
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);
        });

        test("does not call the executor when the signal is already aborted", async () => {
            const controller = new AbortController();
            const error = new TestError("already aborted");
            const executor = vi.fn();
            controller.abort(error);

            const promise = new AbortablePromise<number>(controller.signal, executor);

            expect(executor).not.toHaveBeenCalled();
            await expect(promise).rejects.toBe(error);
        });

        test("the first resolve wins and cleanup is called only once", async () => {
            const error = new TestError("ignored");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(undefined, (resolve, reject) => {
                resolve(1);
                resolve(2);
                reject(error);
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(true);
            await expect(promise).resolves.toBe(1);
        });

        test("the first reject wins and cleanup is called only once", async () => {
            const error = new TestError("first");
            const ignoredError = new TestError("ignored");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(undefined, (resolve, reject) => {
                reject(error);
                reject(ignoredError);
                resolve(42);
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);
        });

        test("abort wins over later resolve and reject calls", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(controller.signal, (resolve, reject) => {
                controller.abort(error);
                resolve(42);
                reject(new TestError("ignored"));
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);
        });

        test("resolve wins over a later abort", async () => {
            const controller = new AbortController();
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(controller.signal, (resolve) => {
                resolve(42);
                controller.abort(new TestError("ignored"));
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(true);
            await expect(promise).resolves.toBe(42);
        });

        test("reject wins over a later abort", async () => {
            const controller = new AbortController();
            const error = new TestError("reject");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(controller.signal, (resolve, reject) => {
                reject(error);
                controller.abort(new TestError("ignored"));
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);
        });

        test("ignores repeated abort events", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const cleanup = vi.fn();
            const removeEventListener = vi.spyOn(controller.signal, "removeEventListener")
                .mockImplementation(() => {});
            const promise = new AbortablePromise<number>(controller.signal, () => cleanup);

            controller.abort(error);
            controller.signal.dispatchEvent(new Event("abort"));

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(false);
            await expect(promise).rejects.toBe(error);

            removeEventListener.mockRestore();
        });

        test("rejects when the executor throws", async () => {
            const controller = new AbortController();
            const error = new TestError("executor");
            const promise = new AbortablePromise<number>(controller.signal, () => {
                throw error;
            });

            await expect(promise).rejects.toBe(error);

            controller.abort(new TestError("ignored"));
            await expect(promise).rejects.toBe(error);
        });

        test("ignores an executor error thrown after resolve", async () => {
            const error = new TestError("ignored");
            const promise = new AbortablePromise<number>(undefined, (resolve) => {
                resolve(42);
                throw error;
            });

            await expect(promise).resolves.toBe(42);
        });

        test("ignores an executor error thrown after reject", async () => {
            const error = new TestError("reject");
            const promise = new AbortablePromise<number>(undefined, (resolve, reject) => {
                reject(error);
                throw new TestError("ignored");
            });

            await expect(promise).rejects.toBe(error);
        });

        test("supports the standard Promise constructor signature", async () => {
            const promise = new AbortablePromise<number>((resolve) => {
                resolve(42);
            });

            expect(promise).toBeInstanceOf(AbortablePromise);
            await expect(promise).resolves.toBe(42);
        });

        test("detects the standard Promise constructor signature from the first argument", async () => {
            const ignoredExecutor = vi.fn();
            const promise = new (AbortablePromise as any)(
                (resolve: (value: number) => void) => resolve(42),
                ignoredExecutor
            ) as AbortablePromise<number>;

            expect(ignoredExecutor).not.toHaveBeenCalled();
            await expect(promise).resolves.toBe(42);
        });

        test("works with Promise subclass chaining and inherited resolve and reject", async () => {
            const promise = new AbortablePromise<number>(undefined, (resolve) => resolve(1));
            const chainedPromise = promise.then((value) => value + 1);

            expect(chainedPromise).toBeInstanceOf(AbortablePromise);
            await expect(chainedPromise).resolves.toBe(2);

            const resolvedPromise = AbortablePromise.resolve(42);
            expect(resolvedPromise).toBeInstanceOf(AbortablePromise);
            await expect(resolvedPromise).resolves.toBe(42);

            const error = new TestError("reject");
            const rejectedPromise = AbortablePromise.reject(error);
            expect(rejectedPromise).toBeInstanceOf(AbortablePromise);
            await expect(rejectedPromise).rejects.toBe(error);
        });

        test("cleanup reports resolve even when an adopted promise later rejects", async () => {
            const error = new TestError("adopted rejection");
            const cleanup = vi.fn();
            const promise = new AbortablePromise<number>(undefined, (resolve) => {
                resolve(Promise.reject(error));
                return cleanup;
            });

            expect(cleanup).toHaveBeenCalledOnce();
            expect(cleanup).toHaveBeenCalledWith(true);
            await expect(promise).rejects.toBe(error);
        });
    });

    describe("withSignal", () => {
        test("withSignal returns the original promise when no signal is provided", async () => {
            const originalPromise = Promise.resolve(42);
            const promise = AbortablePromise.withSignal(undefined, originalPromise);

            expect(promise).toBe(originalPromise);
            await expect(promise).resolves.toBe(42);
        });

        test("withSignal resolves with the original promise", async () => {
            const controller = new AbortController();
            const originalPromise = Promise.resolve(42);
            const promise = AbortablePromise.withSignal(controller.signal, originalPromise);

            await expect(promise).resolves.toBe(42);

            controller.abort(new TestError("ignored"));
            await expect(promise).resolves.toBe(42);
        });

        test("withSignal rejects with the original promise", async () => {
            const controller = new AbortController();
            const error = new TestError("reject");
            const originalPromise = Promise.reject<number>(error);
            const promise = AbortablePromise.withSignal(controller.signal, originalPromise);

            await expect(promise).rejects.toBe(error);

            controller.abort(new TestError("ignored"));
            await expect(promise).rejects.toBe(error);
        });

        test("withSignal rejects immediately for an already aborted signal", async () => {
            const controller = new AbortController();
            const error = new TestError("already aborted");
            const deferred = promiseWithResolvers<number>();
            controller.abort(error);

            const promise = AbortablePromise.withSignal(controller.signal, deferred.promise);

            await expect(promise).rejects.toBe(error);

            deferred.resolve(42);
            await Promise.resolve();
            await expect(promise).rejects.toBe(error);
        });

        test("withSignal rejects when the signal aborts before the original promise settles", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const deferred = promiseWithResolvers<number>();
            const promise = AbortablePromise.withSignal(controller.signal, deferred.promise);

            controller.abort(error);

            await expect(promise).rejects.toBe(error);

            deferred.resolve(42);
            await Promise.resolve();
            await expect(promise).rejects.toBe(error);
        });

        test("withSignal lets an abort win before an already-resolved promise callback runs", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const promise = AbortablePromise.withSignal(controller.signal, Promise.resolve(42));

            controller.abort(error);

            await expect(promise).rejects.toBe(error);
        });
    });

    describe("all", () => {
        test("all behaves like Promise.all", async () => {
            const tuplePromise = AbortablePromise.all([
                Promise.resolve(1),
                "two"
            ] as const);
            void (tuplePromise satisfies Promise<[number, "two"]>);

            expect(tuplePromise).toBeInstanceOf(AbortablePromise);
            await expect(tuplePromise).resolves.toEqual([1, "two"]);

            const iterable: Iterable<number | PromiseLike<number>> = new Set([
                Promise.resolve(1),
                2
            ]);
            const iterablePromise = AbortablePromise.all(iterable);
            void (iterablePromise satisfies Promise<number[]>);
            await expect(iterablePromise).resolves.toEqual([1, 2]);

            const error = new TestError("reject");
            await expect(AbortablePromise.all([Promise.reject(error)])).rejects.toBe(error);
        });

        test("all rejects when its signal aborts", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const deferred = promiseWithResolvers<number>();
            const promise = AbortablePromise.all(controller.signal, [
                deferred.promise,
                Promise.resolve("two")
            ] as const);
            void (promise satisfies Promise<[number, string]>);

            controller.abort(error);

            await expect(promise).rejects.toBe(error);
            deferred.resolve(1);
        });

        test("all supports the signal overload with an undefined signal and iterables", async () => {
            const values: Iterable<number | PromiseLike<number>> = new Set([1, Promise.resolve(2)]);
            const promise = AbortablePromise.all(undefined, values);
            void (promise satisfies Promise<number[]>);

            expect(promise).toBeInstanceOf(AbortablePromise);
            await expect(promise).resolves.toEqual([1, 2]);
        });
    });

    describe("race", () => {
        test("race behaves like Promise.race", async () => {
            const deferred = promiseWithResolvers<number>();
            const tuplePromise = AbortablePromise.race([
                deferred.promise,
                Promise.resolve<"two">("two")
            ] as const);
            void (tuplePromise satisfies Promise<number | "two">);

            expect(tuplePromise).toBeInstanceOf(AbortablePromise);
            await expect(tuplePromise).resolves.toBe("two");

            const iterable: Iterable<number | PromiseLike<number>> = new Set([
                Promise.resolve(1),
                2
            ]);
            const iterablePromise = AbortablePromise.race(iterable);
            void (iterablePromise satisfies Promise<number>);
            await expect(iterablePromise).resolves.toBe(1);

            const error = new TestError("reject");
            await expect(AbortablePromise.race([Promise.reject(error)])).rejects.toBe(error);
        });

        test("race rejects when its signal aborts", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const promise = AbortablePromise.race(controller.signal, [] as const);
            void (promise satisfies Promise<never>);

            controller.abort(error);

            await expect(promise).rejects.toBe(error);
        });

        test("race supports the signal overload with an undefined signal and iterables", async () => {
            const values: Iterable<number | PromiseLike<number>> = new Set([Promise.resolve(1), 2]);
            const promise = AbortablePromise.race(undefined, values);
            void (promise satisfies Promise<number>);

            expect(promise).toBeInstanceOf(AbortablePromise);
            await expect(promise).resolves.toBe(1);
        });
    });

    describe("any", () => {
        test("any behaves like Promise.any", async () => {
            const error = new TestError("ignored rejection");
            const tuplePromise = AbortablePromise.any([
                Promise.reject(error),
                Promise.resolve<"two">("two")
            ] as const);
            void (tuplePromise satisfies Promise<never | "two">);

            expect(tuplePromise).toBeInstanceOf(AbortablePromise);
            await expect(tuplePromise).resolves.toBe("two");

            const iterable: Iterable<number | PromiseLike<number>> = new Set([
                Promise.reject(new TestError("ignored")),
                2
            ]);
            const iterablePromise = AbortablePromise.any(iterable);
            void (iterablePromise satisfies Promise<number>);
            await expect(iterablePromise).resolves.toBe(2);

            await expect(AbortablePromise.any([])).rejects.toBeInstanceOf(AggregateError);
        });

        test("any rejects when its signal aborts", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const deferred = promiseWithResolvers<number>();
            const promise = AbortablePromise.any(controller.signal, [deferred.promise] as const);
            void (promise satisfies Promise<number>);

            controller.abort(error);

            await expect(promise).rejects.toBe(error);
            deferred.resolve(1);
        });

        test("any supports the signal overload with an undefined signal and iterables", async () => {
            const values: Iterable<number | PromiseLike<number>> = new Set([Promise.resolve(1), 2]);
            const promise = AbortablePromise.any(undefined, values);
            void (promise satisfies Promise<number>);

            expect(promise).toBeInstanceOf(AbortablePromise);
            await expect(promise).resolves.toBe(1);
        });
    });

    describe("allSettled", () => {
        test("allSettled behaves like Promise.allSettled", async () => {
            const error = new TestError("reject");
            const tuplePromise = AbortablePromise.allSettled([
                Promise.resolve(1),
                Promise.reject(error)
            ] as const);
            void (tuplePromise satisfies Promise<[
                PromiseSettledResult<number>,
                PromiseSettledResult<never>
            ]>);

            expect(tuplePromise).toBeInstanceOf(AbortablePromise);
            await expect(tuplePromise).resolves.toEqual([
                {status: "fulfilled", value: 1},
                {status: "rejected", reason: error}
            ]);

            const iterable: Iterable<number | PromiseLike<number>> = new Set([
                Promise.resolve(1),
                2
            ]);
            const iterablePromise = AbortablePromise.allSettled(iterable);
            void (iterablePromise satisfies Promise<PromiseSettledResult<number>[]>);
            await expect(iterablePromise).resolves.toEqual([
                {status: "fulfilled", value: 1},
                {status: "fulfilled", value: 2}
            ]);

            await expect(AbortablePromise.allSettled([])).resolves.toEqual([]);
        });

        test("allSettled rejects when its signal aborts", async () => {
            const controller = new AbortController();
            const error = new TestError("abort");
            const deferred = promiseWithResolvers<number>();
            const promise = AbortablePromise.allSettled(controller.signal, [deferred.promise] as const);
            void (promise satisfies Promise<[PromiseSettledResult<number>]>);

            controller.abort(error);

            await expect(promise).rejects.toBe(error);
            deferred.resolve(1);
        });

        test("allSettled supports the signal overload with an undefined signal and iterables", async () => {
            const values: Iterable<number | PromiseLike<number>> = new Set([Promise.resolve(1), 2]);
            const promise = AbortablePromise.allSettled(undefined, values);
            void (promise satisfies Promise<PromiseSettledResult<number>[]>);

            expect(promise).toBeInstanceOf(AbortablePromise);
            await expect(promise).resolves.toEqual([
                {status: "fulfilled", value: 1},
                {status: "fulfilled", value: 2}
            ]);
        });
    });

    describe("sleep", () => {
        test("sleep resolves after the requested duration", async () => {
            vi.useFakeTimers();

            const promise = AbortablePromise.sleep(undefined, 1000);
            let resolved = false;
            void promise.then(() => {
                resolved = true;
            });

            expect(promise).toBeInstanceOf(AbortablePromise);
            expect(resolved).toBe(false);

            await vi.advanceTimersByTimeAsync(999);
            expect(resolved).toBe(false);

            await vi.advanceTimersByTimeAsync(1);
            await expect(promise).resolves.toBeUndefined();
            expect(resolved).toBe(true);

            vi.useRealTimers();
        });

        test("sleep rejects on abort and cancels its timeout", async () => {
            vi.useFakeTimers();

            const controller = new AbortController();
            const error = new TestError("abort");
            const clearTimeout = vi.spyOn(globalThis, "clearTimeout");
            const promise = AbortablePromise.sleep(controller.signal, 1000);

            expect(vi.getTimerCount()).toBe(1);

            controller.abort(error);

            await expect(promise).rejects.toBe(error);
            expect(clearTimeout).toHaveBeenCalledOnce();
            expect(vi.getTimerCount()).toBe(0);

            await vi.advanceTimersByTimeAsync(1000);
            await expect(promise).rejects.toBe(error);

            clearTimeout.mockRestore();
            vi.useRealTimers();
        });

        test("sleep rejects immediately without creating a timeout when the signal is already aborted", async () => {
            vi.useFakeTimers();

            const controller = new AbortController();
            const error = new TestError("already aborted");
            controller.abort(error);

            const promise = AbortablePromise.sleep(controller.signal, 1000);

            expect(vi.getTimerCount()).toBe(0);
            await expect(promise).rejects.toBe(error);

            vi.useRealTimers();
        });

        test("sleep stays resolved if the signal aborts after the duration", async () => {
            vi.useFakeTimers();

            const controller = new AbortController();
            const promise = AbortablePromise.sleep(controller.signal, 1000);

            await vi.advanceTimersByTimeAsync(1000);
            await expect(promise).resolves.toBeUndefined();

            controller.abort(new TestError("ignored"));
            await expect(promise).resolves.toBeUndefined();

            vi.useRealTimers();
        });

        test("sleep resolves after the given duration without a signal", async () => {
            vi.useFakeTimers();

            const promise = AbortablePromise.sleep(1000);

            expect(promise).toBeInstanceOf(AbortablePromise);

            let resolved = false;
            void promise.then(() => {
                resolved = true;
            });

            await vi.advanceTimersByTimeAsync(999);
            expect(resolved).toBe(false);

            await vi.advanceTimersByTimeAsync(1);
            expect(resolved).toBe(true);

            await expect(promise).resolves.toBeUndefined();

            vi.useRealTimers();
        });
    });
});

describe("sleep", () => {
    test("resolves after the given duration", async () => {
        vi.useFakeTimers();

        const promise = sleep(1000);
        let resolved = false;
        void promise.then(() => resolved = true);

        await vi.advanceTimersByTimeAsync(999);
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        expect(resolved).toBe(true);

        vi.useRealTimers();
    });

    test("supports a signal as the first argument", async () => {
        vi.useFakeTimers();

        const controller = new AbortController();
        const promise = sleep(controller.signal, 1000);

        await vi.advanceTimersByTimeAsync(500);
        controller.abort("aborted");

        await expect(promise).rejects.toBe("aborted");

        await vi.advanceTimersByTimeAsync(500);

        vi.useRealTimers();
    });

    test("supports a signal as the second argument", async () => {
        vi.useFakeTimers();

        const controller = new AbortController();
        const promise = sleep(1000, controller.signal);

        await vi.advanceTimersByTimeAsync(500);
        controller.abort("aborted");

        await expect(promise).rejects.toBe("aborted");

        await vi.advanceTimersByTimeAsync(500);

        vi.useRealTimers();
    });

    test("supports undefined as the first signal argument", async () => {
        vi.useFakeTimers();

        const promise = sleep(undefined, 1000);

        await vi.advanceTimersByTimeAsync(999);

        let resolved = false;
        void promise.then(() => resolved = true);
        await Promise.resolve();

        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await expect(promise).resolves.toBeUndefined();

        vi.useRealTimers();
    });

    test("supports undefined as the second signal argument", async () => {
        vi.useFakeTimers();

        const promise = sleep(1000, undefined);

        await vi.advanceTimersByTimeAsync(1000);

        await expect(promise).resolves.toBeUndefined();

        vi.useRealTimers();
    });

    test("rejects immediately when the first signal argument is already aborted", async () => {
        vi.useFakeTimers();

        const controller = new AbortController();
        controller.abort("already aborted");

        const promise = sleep(controller.signal, 1000);

        await expect(promise).rejects.toBe("already aborted");

        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
    });

    test("rejects immediately when the second signal argument is already aborted", async () => {
        vi.useFakeTimers();

        const controller = new AbortController();
        controller.abort("already aborted");

        const promise = sleep(1000, controller.signal);

        await expect(promise).rejects.toBe("already aborted");

        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
    });

    test("does not reject if the signal aborts after the sleep resolves", async () => {
        vi.useFakeTimers();

        const controller = new AbortController();
        const promise = sleep(controller.signal, 1000);

        await vi.advanceTimersByTimeAsync(1000);
        await expect(promise).resolves.toBeUndefined();

        controller.abort("too late");

        await expect(promise).resolves.toBeUndefined();

        vi.useRealTimers();
    });

    test("cancels the timeout when aborted", async () => {
        vi.useFakeTimers();

        const controller = new AbortController();
        const promise = sleep(controller.signal, 1000);

        expect(vi.getTimerCount()).toBe(1);

        controller.abort("aborted");

        await expect(promise).rejects.toBe("aborted");

        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
    });
});

class TestError extends Error {}

function promiseWithResolvers<T>(): ({
    promise: Promise<T>,
    resolve(value: T | PromiseLike<T>): void,
    reject(reason?: any): void
}) {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;

    const promise = new Promise<T>((accept, rejectFn) => {
        resolve = accept;
        reject = rejectFn;
    });

    return {
        promise,
        resolve: resolve!,
        reject: reject!
    };
}
