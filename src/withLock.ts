const locks = new Map<any, Map<string, [queue: (() => void)[], onDelete: (() => void)[]]>>();

/**
 * Only allow one instance of the callback to run at a time for a given `scope` and `key`.
 */
export async function withLock<ReturnType, const ScopeType = any>(
    scope: ScopeType, key: string, callback: (this: ScopeType) => Promise<ReturnType>
): Promise<ReturnType>;
export async function withLock<ReturnType, const ScopeType = any>(
    scope: ScopeType, key: string, acquireLockSignal: AbortSignal | undefined, callback: (this: ScopeType) => Promise<ReturnType>
): Promise<ReturnType>;
export async function withLock<ReturnType, const ScopeType = any>(
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

    if (acquireLockSignal?.aborted)
        throw acquireLockSignal.reason;

    let keyMap = locks.get(scope);
    if (keyMap == null) {
        keyMap = new Map();
        locks.set(scope, keyMap);
    }

    let [queue, onDelete] = keyMap.get(key) || [];
    if (queue != null && onDelete != null)
        await createQueuePromise(queue, acquireLockSignal);
    else {
        queue = [];
        onDelete = [];
        keyMap.set(key, [queue, onDelete]);
    }

    try {
        return await callback.call(scope);
    } finally {
        if (queue.length > 0)
            queue.shift()!();
        else {
            locks.get(scope)?.delete(key);

            if (locks.get(scope)?.size === 0)
                locks.delete(scope);

            while (onDelete.length > 0)
                onDelete.shift()!();
        }
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
export function acquireLock<S = any, K extends string = string>(
    scope: S, key: K, acquireLockSignal?: AbortSignal
): Promise<Lock<S, K>> {
    return new Promise<Lock<S, K>>((accept, reject) => {
        void withLock(scope, key, acquireLockSignal, () => {
            let releaseLock: () => void;
            const promise = new Promise<void>((accept) => {
                releaseLock = accept;
            });

            accept({
                scope,
                key,
                dispose() {
                    releaseLock();
                },
                [Symbol.dispose]() {
                    releaseLock();
                }
            });

            return promise;
        })
            .catch(reject);
    });
}

/**
 * Wait for a lock to be released for a given `scope` and `key`.
 */
export async function waitForLockRelease(scope: any, key: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted)
        throw signal.reason;

    const [queue, onDelete] = locks.get(scope)?.get(key) ?? [];
    if (queue == null || onDelete == null)
        return;

    await createQueuePromise(onDelete, signal);
}

export type Lock<S = any, K extends string = string> = {
    scope: S,
    key: K,
    dispose(): void,
    [Symbol.dispose](): void
};

function createQueuePromise(queue: (() => void)[], signal?: AbortSignal) {
    if (signal == null)
        return new Promise<void>((accept) => void queue.push(accept));

    return new Promise<void>((accept, reject) => {
        function onAcquireLock() {
            signal!.removeEventListener("abort", onAbort);
            accept();
        }

        const queueLength = queue.length;

        function onAbort() {
            const itemIndex = queue.lastIndexOf(onAcquireLock, queueLength);
            if (itemIndex >= 0)
                queue.splice(itemIndex, 1);

            signal!.removeEventListener("abort", onAbort);
            reject(signal!.reason);
        }

        queue.push(onAcquireLock);
        signal.addEventListener("abort", onAbort);
    });
}
