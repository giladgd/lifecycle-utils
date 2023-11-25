import {DisposedError} from "./DisposedError.js";

/**
 * `AsyncDisposeAggregator` is a utility class that allows you to add multiple items and then dispose them all at once.
 * The items are disposed one by one in the order they were added.
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
    /** @internal */
    private readonly _targets: AsyncDisposeAggregatorTarget[] = [];
    /** @internal */
    private _disposed: boolean = false;

    public constructor() {
        this.add = this.add.bind(this);
        this.dispose = this.dispose.bind(this);
        this[Symbol.asyncDispose] = this[Symbol.asyncDispose].bind(this);
    }

    /**
     * Adds a target to be disposed.
     * @param {(function(): void) | ({dispose: (function(): void)}) | ({Symbol.dispose: (function(): void)}) |
     *  ({Symbol.asyncDispose: (function(): void)}) |
     *  Promise<
     *      (function(): void) | ({dispose: (function(): void)}) | ({Symbol.dispose: (function(): void)}) |
     *      ({Symbol.asyncDispose: (function(): void)})
     *      >
     * } target
     * @returns {this}
     */
    public add(target: AsyncDisposeAggregatorTarget): this {
        this._ensureNotDisposed();
        this._targets.push(target);

        return this;
    }

    /**
     * Disposes all the targets that have been added and clears the list of targets.
     * You can wrap the target with a `WeakRef` to prevent this class from holding a strong reference to the target.
     * @returns {Promise<void>}
     */
    public async dispose(): Promise<void> {
        this._ensureNotDisposed();
        this._disposed = true;

        while (this._targets.length > 0) {
            let disposeTarget = this._targets.shift();

            if (disposeTarget instanceof Promise) {
                try {
                    disposeTarget = await disposeTarget;
                } catch (err) { /* c8 ignore start */
                    console.error(err);
                    continue;
                } /* c8 ignore stop */
            }

            if (typeof WeakRef !== "undefined" && disposeTarget instanceof WeakRef)
                disposeTarget = disposeTarget.deref();

            if (disposeTarget == null)
                continue;
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
            else if (disposeTarget instanceof Function)
                await disposeTarget();
        }
    }

    public async [Symbol.asyncDispose](): Promise<void> {
        return this.dispose();
    }

    public get targetCount(): number {
        return this._targets.length;
    }

    /** @internal */
    private _ensureNotDisposed(): void {
        if (this._disposed)
            throw new DisposedError();
    }
}

type AsyncDisposeAggregatorTarget = DisposeTarget | Promise<DisposeTarget>;

type DisposeTarget = (() => void | Promise<void>) | {
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
