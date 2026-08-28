import {AbortablePromise} from "./AbortablePromise.js";

/**
 * A utility for retaining a resource while it's being used,
 * and for draining it by blocking new retain requests and waiting for existing retains to be released.
 *
 * `tryRetain` acquires a retain handle if no drain is active or pending.
 * `acquireDrain` prevents new retain handles from being acquired, waits for existing retain handles to be released,
 * and resolves with a drain handle that keeps the retainer drained until disposed.
 *
 * Multiple drain handles can be held in parallel.
 * New retain handles are allowed again when the last drain handle is disposed.
 * @example
 * ```typescript
 * import {Retainer, sleep} from "lifecycle-utils";
 *
 * class MyClass {
 *     private _retainer = new Retainer();
 *
 *     async useResource() {
 *         using handle = this._retainer.tryRetain(() => new Error("Resource is draining"));
 *
 *         console.log("using resource");
 *         await sleep(1000);
 *         console.log("done using resource");
 *     }
 *
 *     async drain() {
 *         console.log("awaiting drain");
 *         using drain = await this._retainer.acquireDrain();
 *
 *         // no retained usages are active while the drain handle is held
 *         console.log("drain started");
 *         await sleep(1000);
 *     }
 * }
 *
 * const myClass = new MyClass();
 *
 * const usePromise = myClass.useResource();
 * const drainPromise = myClass.drain();
 *
 * await myClass.useResource().catch(console.log);
 * await Promise.all([usePromise, drainPromise]);
 *
 * // using resource
 * // awaiting drain
 * // Error: Resource is draining
 * // done using resource
 * // drain started
 * ```
 */
export class Retainer {
    /** @internal */ public _retains: number = 0;
    /** @internal */ public _drains: number | Set<(value: RetainerDrainHandle) => void> = 0;

    public constructor() {
        this.tryRetain = this.tryRetain.bind(this);
        this.acquireDrain = this.acquireDrain.bind(this);
    }

    /**
     * Try to retain the resource.
     *
     * Returns `undefined` if a drain is active or pending.
     * If `errorWhenDraining` is provided, throws that error instead.
     * When a function is provided, its result will be thrown
     * (this is an optimization to avoid constructing an `Error` object when it's not being thrown).
     * @param errorWhenDraining - an error to be thrown if a drain is active or pending.
     * When a function is provided, its result is thrown instead.
     */
    public tryRetain(errorWhenDraining: Error | (() => Error)): RetainerHandle;
    public tryRetain(errorWhenDraining?: Error | (() => Error)): RetainerHandle | undefined;
    public tryRetain(errorWhenDraining?: Error | (() => Error)): RetainerHandle | undefined {
        if (this._drains === 0) {
            this._retains++;
            return RetainerHandle._create(this);
        }

        if (errorWhenDraining != null) {
            if (typeof errorWhenDraining === "function")
                throw errorWhenDraining();

            throw errorWhenDraining;
        }

        return undefined;
    }

    /**
     * Acquire a drain.
     *
     * Prevents new retains immediately and waits for all existing retain handles to be disposed.
     * The retainer remains drained until the returned handle is disposed.
     * @param signal - an optional abort signal to abort the drain acquisition
     */
    public acquireDrain(signal?: AbortSignal): Promise<RetainerDrainHandle> {
        if (signal?.aborted)
            return Promise.reject(signal.reason);

        if (typeof this._drains === "number") {
            if (this._retains === 0) {
                this._drains++;
                return Promise.resolve(RetainerDrainHandle._create(this));
            } else
                this._drains = new Set();
        }

        const drains = this._drains;
        return Promise.resolve(new AbortablePromise<RetainerDrainHandle>(signal, (accept) => {
            drains.add(accept);

            return (resolved) => {
                if (resolved)
                    return;

                drains.delete(accept);

                if (drains.size === 0)
                    this._drains = 0;
            };
        }));
    }

    /** The number of active retains */
    public get activeRetains(): number {
        return this._retains;
    }

    public get isDraining() {
        return this._drains !== 0;
    }
}

/** A retain handle acquired from {@link Retainer.tryRetain} */
export class RetainerHandle {
    /** @internal */ private _retainer: undefined | Retainer;

    private constructor(retainer: Retainer) {
        this._retainer = retainer;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public dispose() {
        if (this._retainer == null)
            return;

        this._retainer._retains--;
        if (this._retainer._retains === 0) {
            if (this._retainer._drains instanceof Set) {
                const drains = this._retainer._drains;
                this._retainer._drains = drains.size;
                for (const callback of drains)
                    callback(RetainerDrainHandle._create(this._retainer));
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
    }

    /** @internal */
    public static _create(retainer: Retainer) {
        return new RetainerHandle(retainer);
    }
}

/** A drain handle acquired from {@link Retainer.acquireDrain} */
export class RetainerDrainHandle {
    /** @internal */ private _retainer: undefined | Retainer;

    private constructor(retainer: Retainer) {
        this._retainer = retainer;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public dispose() {
        if (this._retainer == null)
            return;

        if (typeof this._retainer._drains === "number")
            this._retainer._drains--;

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
    }

    /** @internal */
    public static _create(retainer: Retainer) {
        return new RetainerDrainHandle(retainer);
    }
}
