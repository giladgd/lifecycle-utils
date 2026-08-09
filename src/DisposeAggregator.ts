import {DisposedError} from "./DisposedError.js";

/**
 * `DisposeAggregator` is a utility class that allows you to add multiple items and then dispose them all at once.
 * You can add a function to call, an object with a `dispose` method, or an object with a `Symbol.dispose` method.
 * To dispose all the items, call `dispose` or use the `Symbol.dispose` symbol.
 *
 * For example,
 * ```typescript
 * const disposeAggregator = new DisposeAggregator();
 *
 * const eventRelay = new EventRelay<string>();
 * disposeAggregator.add(eventRelay);
 *
 * const eventRelay2 = disposeAggregator.add(new EventRelay<string>());
 *
 * disposeAggregator.dispose();
 * console.log(eventRelay.disposed === true); // true
 * console.log(eventRelay2.disposed === true); // true
 * ```
 */
export class DisposeAggregator {
    /** @internal */ private _targets: DisposeAggregatorTarget[] = [];
    /** @internal */ private _disposed: boolean = false;

    public constructor() {
        this.add = this.add.bind(this);
        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    /**
     * Adds a target to be disposed.
     * You can wrap the target with a `WeakRef` to prevent this class from holding a strong reference to the target.
     */
    public add<T extends DisposeAggregatorTarget>(target: T): T {
        this._ensureNotDisposed();
        this._targets.push(target);

        return target;
    }

    /**
     * Disposes all the targets that have been added and clears the list of targets.
     *
     * After all the targets have been disposed, if any throws an error,
     * then the error from the first such target will be thrown.
     */
    public dispose(): void {
        if (this._disposed)
            return;

        this._disposed = true;

        let firstError: unknown;
        let hasError: boolean = false;

        const targets: (DisposeAggregatorTarget | null)[] = this._targets;
        this._targets = [];
        for (let i = 0; i < targets.length; i++) {
            let disposeTarget = targets[i];
            targets[i] = null;

            try {
                if (typeof WeakRef !== "undefined" && disposeTarget instanceof WeakRef)
                    disposeTarget = disposeTarget.deref();

                if (disposeTarget == null || disposeTarget === this)
                    continue;
                else if (typeof disposeTarget === "function") {
                    if (disposeTarget === this.dispose || disposeTarget === this[Symbol.dispose])
                        continue;

                    disposeTarget();
                } else if (Symbol.dispose != null && Symbol.dispose in disposeTarget && typeof disposeTarget[Symbol.dispose] === "function")
                    disposeTarget[Symbol.dispose]();
                else if ("dispose" in disposeTarget && typeof disposeTarget.dispose === "function")
                    disposeTarget.dispose();
            } catch (err) {
                if (!hasError) {
                    firstError = err;
                    hasError = true;
                }
            }
        }

        targets.length = 0;

        if (hasError)
            throw firstError;
    }

    public [Symbol.dispose](): void {
        this.dispose();
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

export type DisposeAggregatorTarget = (() => void) | {
    [Symbol.dispose](): void
} | {
    dispose(): void
} | WeakRef<{
    [Symbol.dispose](): void
} | {
    dispose(): void
}>;
