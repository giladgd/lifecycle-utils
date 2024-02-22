const locks = new Map<any, Map<string, Promise<any>>>();

/**
 * Only allow one instance of the callback to run at a time for a given `scope` and `key`.
 */
export async function withLock<ReturnType, ScopeType>(scope: ScopeType, key: string, callback: (this: ScopeType) => Promise<ReturnType>): Promise<ReturnType>;
export async function withLock<ReturnType, ScopeType>(
    scope: ScopeType, key: string, acquireLockSignal: AbortSignal | undefined, callback: (this: ScopeType) => Promise<ReturnType>
): Promise<ReturnType>;
export async function withLock<ReturnType, ScopeType>(
    scope: ScopeType,
    key: string,
    acquireLockSignalOrCallback: AbortSignal | undefined | ((this: ScopeType) => Promise<ReturnType>),
    callback?: () => Promise<ReturnType>
): Promise<ReturnType> {
    let acquireLockSignal: AbortSignal | undefined = undefined;

    if (acquireLockSignalOrCallback instanceof AbortSignal)
        acquireLockSignal = acquireLockSignalOrCallback;
    else if (acquireLockSignalOrCallback != null)
        callback = acquireLockSignalOrCallback;

    if (callback == null)
        throw new Error("callback is required");

    while (locks.get(scope)?.has(key)) {
        if (acquireLockSignal?.aborted)
            throw acquireLockSignal.reason;

        try {
            if (acquireLockSignal != null) {
                const acquireLockPromise = createAbortSignalAbortPromise(acquireLockSignal);

                await Promise.race([
                    acquireLockPromise.promise,
                    locks.get(scope)?.get(key)
                ]);

                acquireLockPromise.dispose();
            } else
                await locks.get(scope)?.get(key);
        } catch (err) {
            // we only need to wait here for the promise to resolve, we don't care about the result
        }

        if (acquireLockSignal?.aborted)
            throw acquireLockSignal.reason;
    }

    const promise = callback.call(scope);

    if (!locks.has(scope))
        locks.set(scope, new Map());

    locks.get(scope)!.set(key, promise);

    try {
        return await promise;
    } finally {
        locks.get(scope)?.delete(key);

        if (locks.get(scope)?.size === 0)
            locks.delete(scope);
    }
}

/**
 * Check if a lock is currently active for a given `scope` and `key`.
 */
export function isLockActive(scope: any, key: string): boolean {
    return locks.get(scope)?.has(key) ?? false;
}

/**
 * Acquire a lock for a given `scope` and `key`.
 */
export async function acquireLock<S = any, K extends string = string>(
    scope: S, key: K, acquireLockSignal?: AbortSignal
): Promise<Lock<S, K>> {
    let releaseLock: (param: null) => void;

    await new Promise((accept, reject) => {
        void withLock(scope, key, acquireLockSignal, async () => {
            accept(null);

            await new Promise((accept) => {
                releaseLock = accept;
            });
        })
            .catch(reject);
    });

    return {
        scope,
        key,
        dispose() {
            releaseLock(null);
        },
        [Symbol.dispose]() {
            releaseLock(null);
        }
    };
}

/**
 * Wait for a lock to be released for a given `scope` and `key`.
 */
export async function waitForLockRelease(scope: any, key: string, signal?: AbortSignal): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (signal?.aborted)
            throw signal.reason;

        try {
            if (signal != null) {
                const signalPromise = createAbortSignalAbortPromise(signal);

                await Promise.race([
                    signalPromise.promise,
                    locks.get(scope)?.get(key)
                ]);

                signalPromise.dispose();
            } else
                await locks.get(scope)?.get(key);
        } catch (err) {
            // we only need to wait here for the promise to resolve, we don't care about the result
        }

        if (signal?.aborted)
            throw signal.reason;

        if (locks.get(scope)?.has(key))
            continue;

        await Promise.resolve(); // wait for a microtask to run, so other pending locks can be registered

        if (signal?.aborted)
            throw signal.reason;

        if (locks.get(scope)?.has(key))
            continue;

        return;
    }
}

export type Lock<S = any, K extends string = string> = {
    scope: S,
    key: K,
    dispose(): void,
    [Symbol.dispose](): void
};

function createControlledPromise<T = any>() {
    let resolve: (value: T | Promise<T>) => void;
    let reject: (reason?: any) => void;

    const promise = new Promise<T>((accept, fail) => {
        resolve = accept;
        reject = fail;
    });

    return {
        promise,
        resolve: resolve!,
        reject: reject!
    };
}

function createAbortSignalAbortPromise(signal: AbortSignal) {
    const acquireLockPromise = createControlledPromise<void>();

    const onAbort = () => {
        acquireLockPromise.resolve();
        signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort);

    return {
        promise: acquireLockPromise.promise,
        dispose() {
            signal.removeEventListener("abort", onAbort);
        }
    };
}

