const locks = new Map<any, Map<string, Promise<any>>>();

/**
 * Only allow one instance of the callback to run at a time for a given `scope` and `key`.
 */
export async function withLock<ReturnType>(scope: any, key: string, callback: () => Promise<ReturnType>): Promise<ReturnType> {
    while (locks.get(scope)?.has(key)) {
        try {
            await locks.get(scope)?.get(key);
        } catch (err) {
            // we only need to wait here for the promise to resolve, we don't care about the result
        }
    }

    const promise = callback();

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
export async function acquireLock<S = any, K extends string = string>(scope: S, key: K): Promise<Lock<S, K>> {
    let releaseLock: (param: null) => void;

    await new Promise((accept) => {
        void withLock(scope, key, async () => {
            accept(null);

            await new Promise((accept) => {
                releaseLock = accept;
            });
        });
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
export async function waitForLockRelease(scope: any, key: string): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await locks.get(scope)?.get(key);
        } catch (err) {
            // we only need to wait here for the promise to resolve, we don't care about the result
        }

        if (locks.get(scope)?.has(key))
            continue;

        await Promise.resolve(); // wait for a microtask to run, so other pending locks can be registered

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
