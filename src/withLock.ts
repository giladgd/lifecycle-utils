const locks = new Map<any, Map<string, Promise<any>>>();

/**
 * Only allow one instance of the callback to run at a time for a given scope and key.
 * @template ReturnType
 * @param {any} scope
 * @param {string} key
 * @param {function(): Promise<ReturnType>}callback
 * @returns {Promise<ReturnType>}
 */
export async function withLock<ReturnType>(scope: any, key: string, callback: () => Promise<ReturnType>): Promise<ReturnType> {
    while (locks.get(scope)?.has(key)) {
        await locks.get(scope)?.get(key);
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
 * Check if a lock is currently active for a given scope and key.
 * @param {any} scope
 * @param {string} key
 * @returns {boolean}
 */
export function isLockActive(scope: any, key: string): boolean {
    return locks.get(scope)?.has(key) ?? false;
}

/**
 * Acquire a lock for a given scope and key.
 * @param {any} scope
 * @param {string} key
 * @returns {Promise<Lock>}
 */
export async function acquireLock(scope: any, key: string): Promise<Lock> {
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
        dispose() {
            releaseLock(null);
        },
        [Symbol.dispose]() {
            releaseLock(null);
        }
    };
}

export type Lock = {
    dispose(): void,
    [Symbol.dispose](): void
};