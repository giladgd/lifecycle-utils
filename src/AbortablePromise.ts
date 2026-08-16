import {LongTimeout} from "./LongTimeout.js";

/**
 * A Promise that can be rejected by an abort signal.
 *
 * When a signal is provided, the promise is rejected with `signal.reason`
 * if the signal is aborted before the executor resolves or rejects the promise.
 *
 * The executor may return a cleanup callback, which is invoked
 * when the executor calls `resolve` or `reject`, or when the signal aborts it.
 *
 * The `resolved` argument passed to the cleanup callback is `true` when the executor called `resolve`,
 * and `false` otherwise.
 * @example
 * ```typescript
 * import {AbortablePromise} from "lifecycle-utils";
 *
 * const controller = new AbortController();
 *
 * const promise = new AbortablePromise(controller.signal, (resolve, reject) => {
 *     // register to things here
 *
 *     return (resolved) => {
 *         // do cleanup here
 *
 *         // `resolved` is true if `resolve` was called,
 *         // and false if `reject` was called or the signal was aborted
 *     };
 * });
 * ```
 */
export class AbortablePromise<T> extends Promise<T> {
    public constructor(signal: AbortSignal | undefined, executor: AbortablePromiseExecutor<T>);
    /** @internal */
    public constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void);
    public constructor(
        signalOrExecutor: AbortSignal | undefined |
            ((resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void),
        executor?: AbortablePromiseExecutor<T>
    ) {
        if (executor == null || typeof signalOrExecutor === "function")
            super(signalOrExecutor as ((resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void));
        else
            super((accept, reject) => {
                if ((signalOrExecutor as AbortSignal | undefined)?.aborted) {
                    reject((signalOrExecutor as AbortSignal)!.reason);
                    return;
                }

                let isDone = false;
                let resolved = false;
                let cleanup: AbortablePromiseCleanup | undefined | void;
                let cleanupOnReturn = false;

                function onAccept(value: T | PromiseLike<T>) {
                    if (isDone)
                        return;

                    isDone = true;
                    resolved = true;
                    (signalOrExecutor as AbortSignal | undefined)?.removeEventListener("abort", onAbort);
                    accept(value);

                    if (cleanup == null)
                        cleanupOnReturn = true;
                    else
                        cleanup(resolved);
                }

                function onAbort(reason?: any) {
                    if (isDone)
                        return;

                    isDone = true;
                    (signalOrExecutor as AbortSignal)!.removeEventListener("abort", onAbort);
                    reject((signalOrExecutor as AbortSignal)!.reason);

                    if (cleanup == null)
                        cleanupOnReturn = true;
                    else
                        cleanup(resolved);
                }

                function onReject(reason?: any) {
                    if (isDone)
                        return;

                    isDone = true;
                    (signalOrExecutor as AbortSignal | undefined)?.removeEventListener("abort", onAbort);
                    reject(reason);

                    if (cleanup == null)
                        cleanupOnReturn = true;
                    else
                        cleanup(resolved);
                }

                (signalOrExecutor as AbortSignal | undefined)?.addEventListener("abort", onAbort);

                try {
                    cleanup = executor(onAccept, onReject);
                } catch (err) {
                    onReject(err);
                    return;
                }

                if (cleanupOnReturn)
                    cleanup?.(resolved);
            });
    }

    /**
     * Like {@link Promise.all}, with an optional abort signal as the first argument.
     *
     * When a signal is provided, the returned promise is rejected with `signal.reason` if the signal is aborted before
     * the returned promise settles.
     */
    public static override all<T extends readonly unknown[] | []>(
        signal: AbortSignal | undefined,
        values: T
    ): Promise<{-readonly [P in keyof T]: Awaited<T[P]>}>;
    public static override all<T>(
        signal: AbortSignal | undefined,
        values: Iterable<T | PromiseLike<T>>
    ): Promise<Awaited<T>[]>;
    public static override all<T extends readonly unknown[] | []>(values: T): Promise<{-readonly [P in keyof T]: Awaited<T[P]>;}>;
    public static override all<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>[]>;
    public static override all<T extends readonly unknown[] | []>(
        signalOrValues: AbortSignal | undefined | T,
        values?: T
    ): Promise<{-readonly [P in keyof T]: Awaited<T[P]>}> {
        if (values != null)
            return this.resolve(this.withSignal(signalOrValues as AbortSignal | undefined, Promise.all(values)));

        return this.resolve(Promise.all(signalOrValues as T));
    }

    /**
     * Like {@link Promise.race}, with an optional abort signal as the first argument.
     *
     * When a signal is provided, the returned promise is rejected with `signal.reason` if the signal is aborted before
     * the returned promise settles.
     */
    public static override race<T extends readonly unknown[] | []>(
        signal: AbortSignal | undefined,
        values: T
    ): Promise<Awaited<T[number]>>;
    public static override race<T>(
        signal: AbortSignal | undefined,
        values: Iterable<T | PromiseLike<T>>
    ): Promise<Awaited<T>>;
    public static override race<T extends readonly unknown[] | []>(values: T): Promise<Awaited<T[number]>>;
    public static override race<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>>;
    public static override race<T extends readonly unknown[] | []>(
        signalOrValues: AbortSignal | undefined | T,
        values?: T
    ): Promise<Awaited<T[number]>> {
        if (values != null)
            return this.resolve(this.withSignal(signalOrValues as AbortSignal | undefined, Promise.race(values)));

        return this.resolve(Promise.race(signalOrValues as T));
    }

    /**
     * Like {@link Promise.any}, with an optional abort signal as the first argument.
     *
     * When a signal is provided, the returned promise is rejected with `signal.reason` if the signal is aborted before
     * the returned promise settles.
     */
    public static override any<T extends readonly unknown[] | []>(
        signal: AbortSignal | undefined,
        values: T
    ): Promise<Awaited<T[number]>>;
    public static override any<T>(
        signal: AbortSignal | undefined,
        values: Iterable<T | PromiseLike<T>>
    ): Promise<Awaited<T>>;
    public static override any<T extends readonly unknown[] | []>(values: T): Promise<Awaited<T[number]>>;
    public static override any<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>>;
    public static override any<T extends readonly unknown[] | []>(
        signalOrValues: AbortSignal | undefined | T,
        values?: T
    ): Promise<Awaited<T[number]>> {
        if (values != null)
            return this.resolve(this.withSignal(signalOrValues as AbortSignal | undefined, Promise.any(values)));

        return this.resolve(Promise.any(signalOrValues as T));
    }

    /**
     * Like {@link Promise.allSettled}, with an optional abort signal as the first argument.
     *
     * When a signal is provided, the returned promise is rejected with `signal.reason` if the signal is aborted before
     * the returned promise settles.
     */
    public static override allSettled<T extends readonly unknown[] | []>(
        signal: AbortSignal | undefined,
        values: T
    ): Promise<{-readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>;}>;
    public static override allSettled<T>(
        signal: AbortSignal | undefined,
        values: Iterable<T | PromiseLike<T>>
    ): Promise<PromiseSettledResult<Awaited<T>>[]>;
    public static override allSettled<T extends readonly unknown[] | []>(
        values: T
    ): Promise<{-readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>;}>;
    public static override allSettled<T>(
        values: Iterable<T | PromiseLike<T>>
    ): Promise<PromiseSettledResult<Awaited<T>>[]>;
    public static override allSettled<T extends readonly unknown[] | []>(
        signalOrValues: AbortSignal | undefined | T,
        values?: T
    ): Promise<{-readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>;}> {
        if (values != null)
            return this.resolve(this.withSignal(signalOrValues as AbortSignal | undefined, Promise.allSettled(values)));

        return this.resolve(Promise.allSettled(signalOrValues as T));
    }

    /**
     * Wraps a promise with an abort signal.
     *
     * If the signal is aborted before the promise settles, then the returns promise is rejected with `signal.reason`.
     * Otherwise, it settles in the same way as the original promise.
     *
     * If no signal is provided then the original promise is returned unchanged.
     */
    public static withSignal<T>(signal: AbortSignal | undefined, promise: Promise<T>) {
        if (signal == null)
            return promise;

        if (signal.aborted) {
            promise.catch(noop);
            return this.reject(signal.reason);
        }

        return new this<T>(signal, (accept, reject) => void promise.then(accept, reject));
    }

    /**
     * Returns a promise that resolves after the given duration.
     *
     * If a signal is provided and is aborted before the duration has elapsed,
     * then the promise is rejected with `signal.reason`.
     * @param signal
     * @param duration - the duration to wait in milliseconds
     */
    public static sleep(signal: AbortSignal | undefined, duration: number): Promise<void>;
    public static sleep(duration: number): Promise<void>;
    public static sleep(signalOrDuration: AbortSignal | undefined | number, duration?: number) {
        if (duration == null || typeof signalOrDuration == "number")
            return new this<void>((accept) => void new LongTimeout(accept, signalOrDuration as number));

        if (signalOrDuration?.aborted)
            return this.reject(signalOrDuration.reason);

        return new this<void>(signalOrDuration, (accept) => {
            const timeout = new LongTimeout(accept, duration);
            return timeout.dispose.bind(timeout);
        });
    }
}

/**
 * Returns a promise that resolves after the given duration.
 *
 * If a signal is provided and is aborted before the duration has elapsed,
 * then the promise is rejected with `signal.reason`.
 * @param signal
 * @param duration - the duration to wait in milliseconds
 */
export function sleep(signal: AbortSignal | undefined, duration: number): Promise<void>;
export function sleep(duration: number, signal: AbortSignal | undefined): Promise<void>;
export function sleep(duration: number): Promise<void>;
export function sleep(a: AbortSignal | undefined | number, b?: AbortSignal | undefined | number) {
    if (typeof a === "number")
        return AbortablePromise.sleep(b as AbortSignal | undefined, a);

    return AbortablePromise.sleep(a, b as number);
}

function noop() {
    // do nothing
}

/**
 * Executor used to initialize a {@link AbortablePromise}.
 *
 * May return a cleanup callback that is invoked after `resolve` or `reject` is called,
 * or when the associated signal aborts the promise
 */
export type AbortablePromiseExecutor<T> = (
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: any) => void
) => (void | AbortablePromiseCleanup);

/**
 * Cleans up resources associated with a {@link AbortablePromise}.
 * @param resolved - `true` if the executor called `resolve`, and `false` otherwise
 */
export type AbortablePromiseCleanup = (
    resolved: boolean
) => void;
