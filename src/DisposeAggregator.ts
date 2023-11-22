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
    private readonly _targets: DisposeAggregatorTarget[] = [];
    private _disposed: boolean = false;

    public constructor() {
        this.add = this.add.bind(this);
        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    /**
     * Adds a target to be disposed.
     * @param {(function(): void) | ({dispose: (function(): void)}) | ({Symbol.dispose: (function(): void)})} target
     * @returns {this}
     */
    public add<T extends DisposeAggregatorTarget>(target: T): T {
        this._ensureNotDisposed();
        this._targets.push(target);

        return target;
    }

    /**
     * Disposes all the targets that have been added and clears the list of targets.
     */
    public dispose(): void {
        this._ensureNotDisposed();

        while (this._targets.length > 0) {
            const disposeTarget = this._targets.shift();

            if (disposeTarget == null)
                continue;
            else if (Symbol.dispose != null && Symbol.dispose in disposeTarget && disposeTarget[Symbol.dispose] instanceof Function)
                disposeTarget[Symbol.dispose]();
            else if ("dispose" in disposeTarget && disposeTarget.dispose instanceof Function)
                disposeTarget.dispose();
            else if (disposeTarget instanceof Function)
                disposeTarget();
        }

        this._disposed = true;
    }

    public [Symbol.dispose](): void {
        this.dispose();
    }

    public get targetCount(): number {
        return this._targets.length;
    }

    private _ensureNotDisposed(): void {
        if (this._disposed)
            throw new DisposedError();
    }
}

type DisposeAggregatorTarget = (() => void) | {
    [Symbol.dispose](): void
} | {
    dispose(): void
};
