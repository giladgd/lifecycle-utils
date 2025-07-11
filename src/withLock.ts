import {MultiKeyMap} from "./MultiKeyMap.js";

const locks = new MultiKeyMap<any[], [queue: (() => void)[], onDelete: (() => void)[]]>();

/**
 * Only allow one instance of the callback to run at a time for a given `scope` values.
 */
export async function withLock<ReturnType, const Scope extends any[]>(
    scope: ValidLockScope<Scope>,
    callback: () => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export async function withLock<ReturnType, const Scope extends any[]>(
    scope: ValidLockScope<Scope>,
    acquireLockSignal: AbortSignal | undefined,
    callback: () => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export async function withLock<ReturnType, const Scope extends any[]>(
    scope: ValidLockScope<Scope>,
    acquireLockSignalOrCallback: AbortSignal | undefined | (() => Promise<ReturnType> | ReturnType),
    callback?: () => Promise<ReturnType> | ReturnType
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

    const scopeClone = scope.slice();

    let [queue, onDelete] = locks.get(scopeClone) || [];
    if (queue != null && onDelete != null)
        await createQueuePromise(queue, acquireLockSignal);
    else {
        queue = [];
        onDelete = [];
        locks.set(scopeClone, [queue, onDelete]);
    }

    try {
        return await callback();
    } finally {
        if (queue.length > 0)
            queue.shift()!();
        else {
            locks.delete(scopeClone);

            while (onDelete.length > 0)
                onDelete.shift()!();
        }
    }
}

/**
 * Check if a lock is currently active for a given `scope` values.
 */
export function isLockActive<const Scope extends any[]>(scope: ValidLockScope<Scope>): boolean {
    return locks.has(scope) ?? false;
}

/**
 * Acquire a lock for a given `scope` values.
 */
export function acquireLock<const Scope extends any[]>(
    scope: ValidLockScope<Scope>, acquireLockSignal?: AbortSignal
): Promise<Lock<Scope>> {
    return new Promise<Lock<Scope>>((accept, reject) => {
        const scopeClone = scope.slice() as typeof scope;

        void withLock(scopeClone, acquireLockSignal, () => {
            let releaseLock: () => void;
            const promise = new Promise<void>((accept) => {
                releaseLock = accept;
            });

            accept({
                scope: scopeClone as Scope,
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
 * Wait for a lock to be released for a given `scope` values.
 */
export async function waitForLockRelease<const Scope extends any[]>(
    scope: ValidLockScope<Scope>,
    signal?: AbortSignal
): Promise<void> {
    if (signal?.aborted)
        throw signal.reason;

    const [queue, onDelete] = locks.get(scope) ?? [];
    if (queue == null || onDelete == null)
        return;

    await createQueuePromise(onDelete, signal);
}

export type Lock<Scope extends any[] = any[]> = {
    scope: Scope,
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

/**
 * Ensure that the scope array contains at least one object, otherwise it will be `never`.
 */
export type ValidLockScope<T extends readonly unknown[] = unknown[]> =
    IncludesObject<T> extends true
        ? T & [...T]
        : InvalidScopeError<"Scope array must include at least one object reference">;

type IncludesObject<T extends readonly unknown[]> =
    T extends [infer Head, ...infer Tail]
        ? [Head] extends [object]
            ? true
            : IncludesObject<Tail>
        : false;

type InvalidScopeError<Message extends string> = unknown[] & {error: Message, __error: never};
