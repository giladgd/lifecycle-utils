import {DisposedError} from "./DisposedError.js";

/**
 * `AsyncDisposeAggregator` is a utility class that allows you to add multiple items and then dispose them all at once.
 * The items are disposed one by one in the order they were added.
 * When the `parallel` option is enabled, then all the items are disposed in parallel,
 * triggered by the order in which they were added.
 * You can add a function to call, an object with a `dispose` method, an object with a `Symbol.dispose` method,
 * an object with a `Symbol.asyncDispose` method, or a Promise that resolves to one of the previous types.
 * To dispose all the items, call `dispose` or use the `Symbol.asyncDispose` symbol.
 * The difference between `AsyncDisposeAggregator` and `DisposeAggregator` is that `AsyncDisposeAggregator` can dispose async targets.
 *
 * For example,
 * ```typescript
 * import {AsyncDisposeAggregator, EventRelay} from "lifecycle-utils";
 *
 * const disposeAggregator = new AsyncDisposeAggregator();
 *
 * const eventRelay = new EventRelay<string>();
 * disposeAggregator.add(eventRelay);
 *
 * disposeAggregator.add(async () => {
 *     await new Promise(resolve => setTimeout(resolve, 0));
 *     // do some async work
 * });
 *
 * disposeAggregator.dispose();
 * ```
 */
export class AsyncDisposeAggregator {
    /** @internal */ private _targets: AsyncDisposeAggregatorTarget[] = [];
    /** @internal */ private _disposed: boolean | Promise<void> = false;
    /** @internal */ private readonly _parallel: boolean;

    public constructor({parallel}: {
        /**
         * Whether to dispose all the targets in parallel when the aggregator is disposed.
         *
         * Defaults to `false`.
         */
        parallel?: boolean
    } = {}) {
        this._parallel = parallel ?? false;
        this.add = this.add.bind(this);
        this.dispose = this.dispose.bind(this);
        this[Symbol.asyncDispose] = this[Symbol.asyncDispose].bind(this);
        this._disposeTarget = this._disposeTarget.bind(this);
    }

    /**
     * Adds a target to be disposed.
     * You can wrap the target with a `WeakRef` to prevent this class from holding a strong reference to the target.
     */
    public add(target: AsyncDisposeAggregatorTarget): this {
        this._ensureNotDisposed();
        this._targets.push(target);

        return this;
    }

    /**
     * Disposes all the targets that have been added and clears the list of targets.
     *
     * After all the targets have been disposed, if any throws an error or rejects,
     * then the error from the first such target will be thrown.
     */
    public dispose(): Promise<void> {
        if (this._disposed === true)
            return Promise.resolve();
        else if (this._disposed !== false)
            return this._disposed;

        const [tempPromise, acceptPromise] = promiseWithResolver<void>();
        tempPromise.catch(doNothing);
        this._disposed = tempPromise;

        const disposedPromise = this._dispose();
        acceptPromise(disposedPromise);

        if (this._disposed === tempPromise)
            this._disposed = disposedPromise;

        return disposedPromise;
    }

    public [Symbol.asyncDispose](): Promise<void> {
        return this.dispose();
    }

    public get targetCount(): number {
        return this._targets.length;
    }

    /** @internal */
    private async _dispose() {
        if (this._parallel) {
            let firstError: unknown;
            let errorIndex: number | undefined;
            const promises: Promise<void>[] = [];

            const targets = this._targets;
            this._targets = [];
            for (const target of targets) {
                try {
                    const res = this._disposeTarget(target);
                    if (res instanceof Promise)
                        promises.push(res);
                } catch (err) {
                    if (errorIndex == null) {
                        firstError = err;
                        errorIndex = promises.length;
                    }
                }
            }

            targets.length = 0;

            const results = await Promise.allSettled(promises);
            try {
                for (let i = 0; i < (errorIndex ?? results.length); i++) {
                    const result = results[i];
                    if (result?.status === "rejected")
                        throw result.reason;
                }

                if (errorIndex != null)
                    throw firstError;
            } finally {
                this._disposed = true;
            }
        } else {
            let firstError: unknown;
            let hasError: boolean = false;

            const targets: (AsyncDisposeAggregatorTarget | null)[] = this._targets;
            this._targets = [];
            for (let i = 0; i < targets.length; i++) {
                const target = targets[i]!;
                targets[i] = null;

                try {
                    const res = this._disposeTarget(target);
                    if (res instanceof Promise)
                        await res;
                } catch (err) {
                    if (!hasError) {
                        firstError = err;
                        hasError = true;
                    }
                }
            }

            targets.length = 0;
            this._disposed = true;

            if (hasError)
                throw firstError;
        }
    }

    /** @internal */
    private _ensureNotDisposed(): void {
        if (this._disposed !== false)
            throw new DisposedError();
    }

    private _disposeTarget(target: AsyncDisposeAggregatorTarget | undefined): Promise<void> | void {
        if (target instanceof Promise)
            return target.then(this._disposeTarget);
        else if (typeof WeakRef !== "undefined" && target instanceof WeakRef)
            target = target.deref();

        if (target == null || target === this)
            return;
        else if (typeof target === "function") {
            if (target === this.dispose || target === this[Symbol.asyncDispose])
                return;

            return target();
        } else if (
            Symbol.asyncDispose != null && Symbol.asyncDispose in target &&
            typeof target[Symbol.asyncDispose] === "function"
        )
            return target[Symbol.asyncDispose]();
        else if (
            Symbol.dispose != null && Symbol.dispose in target &&
            typeof target[Symbol.dispose] === "function"
        )
            target[Symbol.dispose]();
        else if ("dispose" in target && typeof target.dispose === "function")
            return target.dispose();
    }
}

export type AsyncDisposeAggregatorTarget = AsyncDisposeAggregatorWrappedTarget | Promise<AsyncDisposeAggregatorWrappedTarget>;

export type AsyncDisposeAggregatorWrappedTarget = (() => void | Promise<void>) | {
    [Symbol.asyncDispose](): void | Promise<void>
} | {
    [Symbol.dispose](): void
} | {
    dispose(): void | Promise<void>
} | WeakRef<{
    [Symbol.asyncDispose](): void | Promise<void>
} | {
    [Symbol.dispose](): void
} | {
    dispose(): void | Promise<void>
}>;

function promiseWithResolver<T>(): [promise: Promise<T>, accept: (value: PromiseLike<T> | T) => void] {
    let _accept: ((value: PromiseLike<T> | T) => void) | undefined = undefined;
    const promise = new Promise<T>((accept) => {
        _accept = accept;
    });

    return [promise, _accept!];
}

function doNothing() {
    // do nothing
}
