const finalizationRegistry = new FinalizationRegistry<[target: RegisterFinalizer, token: {}]>(onFinalization);
const pendingFinalization = new WeakSet<{}>();

export class FinalizerRegistrationHandle {
    /** @internal */ private _token?: {};

    private constructor(token: {}) {
        this._token = token;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    /** Returns `true` if the target object has been finalized or the handle has been disposed */
    public get finalized(): boolean {
        if (this._token == null)
            return true;

        const finalized = !pendingFinalization.has(this._token);
        if (finalized)
            delete this._token;

        return finalized;
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    public dispose() {
        if (this._token == null)
            return;

        finalizationRegistry.unregister(this._token);
        pendingFinalization.delete(this._token);
        delete this._token;
    }

    /** @internal */
    public static _create(token: {}) {
        return new FinalizerRegistrationHandle(token);
    }
}

/**
 * Register a finalizer for a given target, so that the finalizer is called after the target is garbage-collected.
 *
 * A finalizer can be a function to call, an object with a `dispose` method, an object with a `Symbol.dispose` method,
 * an object with a `Symbol.asyncDispose` method, or a Promise that resolves to one of the previous types.
 *
 * When registering a finalizer, the result is a handle that can be used to dispose the registration
 * (so that the finalizer won't trigger when the object is garbage-collected).
 *
 * You can register multiple finalizers for the same target, and each registration is completely separate.
 *
 * > **Note:** make sure to never reference the target in the finalizer,
 * > since otherwise it might cause the target to never get garbage-collected.
 * @example
 * ```typescript
 * import {DisposeAggregator, registerFinalizer} from "lifecycle-utils";
 *
 * const disposeAggregator = new DisposeAggregator();
 * disposeAggregator.add(() => console.log("disposed"));
 *
 * let obj: {} | null = {};
 * registerFinalizer(obj, disposeAggregator);
 *
 * obj = null; // get rid of a reference to the object
 * await new Promise((accept) => setTimeout(accept, 1000 * 10)); // wait for the garbage collector
 *
 * // disposed
 * ```
 * @example
 * ```typescript
 * import {registerFinalizer} from "lifecycle-utils";
 *
 * let disposed1 = false;
 * let disposed2 = false;
 *
 * let obj: {} | null = {};
 * const handle1 = registerFinalizer(obj, () => {
 *     disposed1 = true;
 * });
 * const handle2 = registerFinalizer(obj, () => {
 *     disposed2 = true;
 * });
 *
 * console.log(disposed2.finalized); // false
 *
 * handle1.dispose(); // remove the finalizer
 * obj = null; // get rid of a reference to the object
 *
 * await new Promise((accept) => setTimeout(accept, 1000 * 10)); // wait for the garbage collector
 *
 * console.log(disposed1); // false, because we removed the finalizer
 * console.log(disposed2); // true
 *
 * console.log(disposed2.finalized); // true
 * ```
 */
export function registerFinalizer(target: object, finalizer: RegisterFinalizer): FinalizerRegistrationHandle {
    const unregisterToken = {};
    pendingFinalization.add(unregisterToken);
    finalizationRegistry.register(target, [finalizer, unregisterToken], unregisterToken);
    return FinalizerRegistrationHandle._create(unregisterToken);
}

export type RegisterFinalizer = WrappedFinalizer | Promise<WrappedFinalizer>;

export type WrappedFinalizer = (() => void | Promise<void>) | {
    [Symbol.asyncDispose](): void | Promise<void>
} | {
    [Symbol.dispose](): void
} | {
    dispose(): void | Promise<void>
};

async function onFinalization([disposeTarget, token]: [disposeTarget: RegisterFinalizer | undefined, token: {}]) {
    if (disposeTarget instanceof Promise) {
        try {
            disposeTarget = await disposeTarget;
        } catch (err) {
            pendingFinalization.delete(token);
            console.error(err);
            return;
        }
    }

    try {
        if (disposeTarget == null)
            return;
        else if (disposeTarget instanceof Function)
            await disposeTarget();
        else if (
            Symbol.asyncDispose != null && Symbol.asyncDispose in disposeTarget &&
            disposeTarget[Symbol.asyncDispose] instanceof Function
        )
            await disposeTarget[Symbol.asyncDispose]();
        else if (
            Symbol.dispose != null && Symbol.dispose in disposeTarget &&
            disposeTarget[Symbol.dispose] instanceof Function
        )
            disposeTarget[Symbol.dispose]();
        else if ("dispose" in disposeTarget && disposeTarget.dispose instanceof Function)
            await disposeTarget.dispose();
    } catch (err) {
        console.error(err);
    } finally {
        pendingFinalization.delete(token);
    }
}
