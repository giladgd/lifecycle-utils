import {MultiKeyMap} from "./MultiKeyMap.js";
import {Queue} from "./Queue.js";

type LockState = [
    queue: Queue<(() => void) | [entry: () => void]>,
    onDelete: Queue<() => void>,
    shared?: number
];
const enum LockIndex {
    queue = 0,
    onDelete = 1,
    shared = 2
}
const locks = new MultiKeyMap<any[], LockState>();

/**
 * Run a callback while holding an exclusive lock for the given `scope`.
 *
 * An exclusive lock prevents any other exclusive or shared locks from being held at the same time.
 * Lock requests are acquired in the order they are made; consecutive shared lock requests are acquired together.
 */
export async function withLock<ReturnType, const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>,
    callback: () => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export async function withLock<ReturnType, const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>,
    acquireLockSignal: AbortSignal | undefined,
    callback: () => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export async function withLock<ReturnType, const Scope extends readonly any[]>(
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

    let state = locks.get(scopeClone);
    if (state != null)
        await createQueuePromise(state[LockIndex.queue], acquireLockSignal, state);
    else {
        state = [new Queue(), new Queue()];
        locks.set(scopeClone, state);
    }

    try {
        return await callback();
    } finally {
        releaseNextLock(scopeClone, state);
    }
}

/**
 * Run a callback while holding a shared lock for the given `scope`.
 *
 * Multiple shared locks can run in parallel, while a regular lock requires exclusive access.
 * Lock requests are acquired in the order they are made; consecutive shared lock requests acquired together.
 * A new shared lock joins an active shared lock immediately when no regular lock requests are waiting.
 */
export async function withSharedLock<ReturnType, const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>,
    callback: () => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export async function withSharedLock<ReturnType, const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>,
    acquireLockSignal: AbortSignal | undefined,
    callback: () => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export async function withSharedLock<ReturnType, const Scope extends readonly any[]>(
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

    let state = locks.get(scopeClone);

    if (state == null) {
        state = [new Queue(), new Queue(), 1];
        locks.set(scopeClone, state);
    } else {
        const shared = state[LockIndex.shared];

        if (typeof shared === "number" && state[LockIndex.queue].isEmpty)
            state[LockIndex.shared] = shared + 1;
        else
            await createSharedQueuePromise(state[LockIndex.queue], acquireLockSignal);
    }

    try {
        return await callback();
    } finally {
        releaseSharedLock(scopeClone, state);
    }
}

/**
 * Check whether a lock is currently active for a given `scope` values.
 */
export function isLockActive<const Scope extends readonly any[]>(scope: ValidLockScope<Scope>): boolean {
    return locks.has(scope) ?? false;
}

/**
 * Acquire an exclusive lock for the given `scope`.
 *
 * An exclusive lock prevents any other exclusive or shared locks from being held at the same time.
 * Lock requests are acquired in the order they are made; consecutive shared lock requests are acquired together.
 */
export async function acquireLock<const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>, acquireLockSignal?: AbortSignal
): Promise<Lock<Scope>> {
    if (acquireLockSignal?.aborted)
        throw acquireLockSignal.reason;

    const scopeClone = scope.slice();

    let state = locks.get(scopeClone);
    if (state != null)
        await createQueuePromise(state[LockIndex.queue], acquireLockSignal, state);
    else {
        state = [new Queue(), new Queue()];
        locks.set(scopeClone, state);
    }

    return LockHandle._create<Scope>(scopeClone as any as Scope, state, false);
}

/**
 * Acquire a shared lock for the given `scope`.
 *
 * Multiple shared locks can be held in parallel, while a regular lock requires exclusive access.
 * Lock requests are acquired in the order they are made; consecutive shared lock requests acquired together.
 * A new shared lock joins an active shared lock immediately when no regular lock requests are waiting.
 */
export async function acquireSharedLock<const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>, acquireLockSignal?: AbortSignal
): Promise<Lock<Scope>> {
    if (acquireLockSignal?.aborted)
        throw acquireLockSignal.reason;

    const scopeClone = scope.slice();

    let state = locks.get(scopeClone);
    if (state == null) {
        state = [new Queue(), new Queue(), 1];
        locks.set(scopeClone, state);
    } else {
        const shared = state[LockIndex.shared];

        if (typeof shared === "number" && state[LockIndex.queue].isEmpty)
            state[LockIndex.shared] = shared + 1;
        else
            await createSharedQueuePromise(state[LockIndex.queue], acquireLockSignal);
    }

    return LockHandle._create<Scope>(scopeClone as any as Scope, state, true);
}

/**
 * Wait for a lock to be released for a given `scope` values.
 */
export async function waitForLockRelease<const Scope extends readonly any[]>(
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

export class LockHandle<const Scope extends readonly any[]> implements Lock<Scope> {
    public readonly scope: Scope;
    /** @internal */ private _state: LockState | undefined;
    /** @internal */ private readonly _shared: boolean;

    private constructor(scope: Scope, state: LockState, shared: boolean) {
        this.scope = scope;
        this._state = state;
        this._shared = shared;
    }

    public dispose() {
        const state = this._state;
        if (state == null)
            return;

        this._state = undefined;

        if (this._shared)
            releaseSharedLock(this.scope, state);
        else
            releaseNextLock(this.scope, state);
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    /** @internal */
    public static _create<const Scope extends readonly any[]>(scope: Scope, state: LockState, shared: boolean) {
        return new LockHandle(scope, state, shared);
    }
}

export type Lock<Scope extends readonly any[] = readonly any[]> = {
    scope: Scope,
    dispose(): void,
    [Symbol.dispose](): void
};

function releaseNextLock(scope: readonly any[], state: LockState) {
    const queue = state[LockIndex.queue];

    if (!queue.isEmpty) {
        const entry = queue.first;

        if (typeof entry === "function") {
            queue.shift();
            return void entry();
        }

        return void activateSharedLocks(state);
    }

    locks.delete(scope);

    const onDelete = state[LockIndex.onDelete];
    for (const callback of onDelete.values())
        callback();

    onDelete.clear();
}

function releaseSharedLock(scope: readonly any[], state: LockState) {
    const shared = state[LockIndex.shared] as number;

    if (shared > 1)
        state[LockIndex.shared] = shared - 1;
    else {
        state.length = LockIndex.shared;
        releaseNextLock(scope, state);
    }
}

function activateSharedLocks(state: LockState) {
    const queue = state[LockIndex.queue];

    let sharedUsageCount = 0;
    for (const entry of queue.values()) {
        if (typeof entry === "function")
            break;

        sharedUsageCount++;
        entry[0]();
    }

    state[LockIndex.shared] = (state[LockIndex.shared] ?? 0) + sharedUsageCount;
    queue.delete(0, sharedUsageCount);
}

function createQueuePromise(queue: LockState[LockIndex.queue], signal?: AbortSignal, state?: LockState) {
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
            if (itemIndex >= 0) {
                queue.delete(itemIndex);

                if (state != null && itemIndex === 0 && state[LockIndex.shared] != null && !queue.isEmpty &&
                    typeof queue.first !== "function"
                )
                    activateSharedLocks(state);
            }

            signal!.removeEventListener("abort", onAbort);
            reject(signal!.reason);
        }

        queue.push(onAcquireLock);
        signal.addEventListener("abort", onAbort);
    });
}

function createSharedQueuePromise(queue: LockState[LockIndex.queue], signal?: AbortSignal) {
    if (signal == null)
        return new Promise<void>((accept) => void queue.push([accept]));

    return new Promise<void>((accept, reject) => {
        function onAcquireLock() {
            signal!.removeEventListener("abort", onAbort);
            accept();
        }

        const queueLength = queue.length;
        const entry: [entry: () => void] = [onAcquireLock];

        function onAbort() {
            const itemIndex = queue.lastIndexOf(entry, queueLength);
            if (itemIndex >= 0)
                queue.delete(itemIndex);

            signal!.removeEventListener("abort", onAbort);
            reject(signal!.reason);
        }

        queue.push(entry);
        signal.addEventListener("abort", onAbort);
    });
}

/**
 * Ensure that the scope array contains at least one object, otherwise it will be `never`.
 */
export type ValidLockScope<T extends readonly unknown[] = readonly unknown[]> =
    IncludesObject<T> extends true
        ? Readonly<T & [...T]>
        : InvalidScopeError<"Scope array must include at least one object reference">;

type IncludesObject<T extends readonly unknown[]> =
    true extends (
        {
            [K in keyof T]: readonly [T[K]] extends readonly [object]
                ? true
                : false
        }[keyof T]
    )
        ? true
        : false;

type InvalidScopeError<Message extends string> = readonly unknown[] & {error: Message, __error: never};
