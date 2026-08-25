import {MultiKeyMap} from "./MultiKeyMap.js";
import {AbortablePromise} from "./AbortablePromise.js";

type RetainerState = [
    retains: number,
    drains: number | Set<(value: ScopedRetainerDrainHandle) => void>,
    scope: readonly any[]
];
const enum RetainerStateIndex {
    retains = 0,
    drains = 1,
    scope = 2
}

/**
 * A scoped version of {@link Retainer} that coordinates retains and drains independently for each scope.
 *
 * A scope consists of one or more values that identify a resource or context to retain or drain.
 * Draining one scope does not affect other scopes.
 * @example
 * ```typescript
 * import {ScopedRetainer, sleep} from "lifecycle-utils";
 *
 * const retainer = new ScopedRetainer<[clientId: string]>();
 *
 * async function useClient(clientId: string) {
 *     using handle = retainer.tryRetain([clientId], () => new Error(clientId + " is draining"));
 *
 *     console.log("using " + clientId);
 *     await sleep(1000);
 *     console.log("done using " + clientId);
 * }
 *
 * async function drainClient(clientId: string) {
 *     console.log("awaiting drain for " + clientId);
 *     using drain = await retainer.acquireDrain([clientId]);
 *
 *     // no retained usages for this client are active while the drain handle is held
 *     console.log("drain started for " + clientId);
 *     await sleep(1000);
 * }
 *
 * const usePromise = useClient("client1");
 * const drainPromise = drainClient("client1");
 *
 * await useClient("client1").catch(console.log);
 * await useClient("client2");
 * await Promise.all([usePromise, drainPromise]);
 *
 * // using client1
 * // awaiting drain for client1
 * // Error: client1 is draining
 * // using client2
 * // done using client1
 * // drain started for client1
 * // done using client2
 * ```
 */
export class ScopedRetainer<const Scope extends readonly any[]> {
    /** @internal */ public readonly _states = new MultiKeyMap<Scope, RetainerState>();

    public constructor() {
        this.tryRetain = this.tryRetain.bind(this);
        this.acquireDrain = this.acquireDrain.bind(this);
    }

    /**
     * A scoped version of {@link Retainer.tryRetain}
     * @param scope - the scope to create the retain for
     * @param errorWhenDraining - an error to be thrown if a drain is active or pending for the scope.
     * When a function is provided, its result is thrown instead.
     */
    public tryRetain(
        scope: Readonly<Scope>,
        errorWhenDraining: Error | (() => Error)
    ): ScopedRetainerHandle;
    public tryRetain(
        scope: Readonly<Scope>,
        errorWhenDraining?: Error | (() => Error)
    ): ScopedRetainerHandle | undefined;
    public tryRetain(
        scope: Readonly<Scope>,
        errorWhenDraining?: Error | (() => Error)
    ): ScopedRetainerHandle | undefined {
        let state = this._states.get(scope);
        if (state == null) {
            state = [1, 0, scope.slice()];
            this._states.set(scope, state);
        } else {
            const drains = state[RetainerStateIndex.drains];
            if (drains === 0)
                state[RetainerStateIndex.retains]++;
            else {
                if (errorWhenDraining != null) {
                    if (typeof errorWhenDraining === "function")
                        throw errorWhenDraining();

                    throw errorWhenDraining;
                }

                return undefined;
            }
        }

        return ScopedRetainerHandle._create(this, state);
    }

    /**
     * A scoped version of {@link Retainer.acquireDrain}.
     * @param scope - the scope to acquire the drain for
     * @param signal - an optional abort signal to abort the drain acquisition
     */
    public acquireDrain(scope: Readonly<Scope>, signal?: AbortSignal): Promise<ScopedRetainerDrainHandle> {
        if (signal?.aborted)
            return Promise.reject(signal.reason);

        let state = this._states.get(scope);
        if (state == null) {
            state = [0, 1, scope.slice()];
            this._states.set(scope, state);
            return Promise.resolve(ScopedRetainerDrainHandle._create(this, state));
        } else {
            let drains = state[RetainerStateIndex.drains];
            if (typeof drains === "number") {
                if (state[RetainerStateIndex.retains] === 0) {
                    state[RetainerStateIndex.drains] = drains + 1;
                    return Promise.resolve(ScopedRetainerDrainHandle._create(this, state));
                } else {
                    drains = new Set();
                    state[RetainerStateIndex.drains] = drains;
                }
            }

            return Promise.resolve(new AbortablePromise<ScopedRetainerDrainHandle>(signal, (accept) => {
                drains.add(accept);

                return (resolved) => {
                    if (resolved)
                        return;

                    drains.delete(accept);

                    if (drains.size === 0)
                        state![RetainerStateIndex.drains] = 0;
                };
            }));
        }
    }

    public getIsDraining(scope: Readonly<Scope>) {
        const state = this._states.get(scope);
        return state != null && state[RetainerStateIndex.drains] !== 0;
    }
}

/** A retain handle acquired from {@link ScopedRetainer.tryRetain} */
export class ScopedRetainerHandle {
    /** @internal */ private _retainer: undefined | ScopedRetainer<any>;
    /** @internal */ public _state: undefined | RetainerState;

    private constructor(retainer: ScopedRetainer<any>, state: RetainerState) {
        this._retainer = retainer;
        this._state = state;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public dispose() {
        if (this._retainer == null || this._state == null)
            return;

        /* c8 ignore start */
        if (this._retainer._states.get(this._state[RetainerStateIndex.scope]) !== this._state)
            return void this._markDisposed(); /* c8 ignore stop */

        const retains = this._state[RetainerStateIndex.retains];
        this._state[RetainerStateIndex.retains] = retains - 1;
        if (retains === 1) {
            const drains = this._state[RetainerStateIndex.drains];
            if (drains === 0)
                this._retainer._states.delete(this._state[RetainerStateIndex.scope]);
            else if (drains instanceof Set) {
                this._state[RetainerStateIndex.drains] = drains.size;

                for (const callback of drains)
                    callback(ScopedRetainerDrainHandle._create(this._retainer, this._state));
            }
        }

        this._markDisposed();
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    public get disposed() {
        return this._retainer == null;
    }

    /** @internal */
    private _markDisposed() {
        this._retainer = undefined;
        this._state = undefined;
    }

    /** @internal */
    public static _create(retainer: ScopedRetainer<any>, state: RetainerState) {
        return new ScopedRetainerHandle(retainer, state);
    }
}

/** A drain handle acquired from {@link ScopedRetainer.acquireDrain} */
export class ScopedRetainerDrainHandle {
    /** @internal */ private _retainer: undefined | ScopedRetainer<any>;
    /** @internal */ public _state: undefined | RetainerState;

    private constructor(retainer: ScopedRetainer<any>, state: RetainerState) {
        this._retainer = retainer;
        this._state = state;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public dispose() {
        if (this._retainer == null || this._state == null)
            return;

        /* c8 ignore start */
        if (this._retainer._states.get(this._state[RetainerStateIndex.scope]) !== this._state)
            return void this._markDisposed(); /* c8 ignore stop */

        const drains = this._state[RetainerStateIndex.drains];
        if (typeof drains === "number") {
            if (drains === 1)
                this._retainer._states.delete(this._state[RetainerStateIndex.scope]);
            else
                this._state[RetainerStateIndex.drains] = drains - 1;
        }

        this._markDisposed();
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    public get disposed() {
        return this._retainer == null;
    }

    /** @internal */
    private _markDisposed() {
        this._retainer = undefined;
        this._state = undefined;
    }

    /** @internal */
    public static _create(retainer: ScopedRetainer<any>, state: RetainerState) {
        return new ScopedRetainerDrainHandle(retainer, state);
    }
}
