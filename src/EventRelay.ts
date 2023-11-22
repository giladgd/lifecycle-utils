import {DisposedError} from "./DisposedError.js";

/**
 * A simple event relay.
 * Create a listener with `createListener` and dispatch events with `dispatchEvent`.
 * For each supported event type, create a new instance of `EventRelay` and expose it as a property.
 *
 * For example, this code:
 * ```ts
 * class MyClass {
 *     public readonly onSomethingHappened = new EventRelay<string>();
 *
 *     public doSomething(whatToDo: string) {
 *         this.onSomethingHappened.dispatchEvent(whatToDo);
 *         console.log("Done notifying listeners");
 *     }
 * }
 *
 * const myClass = new MyClass();
 * myClass.onSomethingHappened.createListener((whatHappened) => {
 *     console.log(`Something happened: ${whatHappened}`);
 * });
 * myClass.doSomething("eat a cookie");
 * ```
 *
 * Will print this:
 * ```
 * Something happened: eat a cookie
 * Done notifying listeners
 * ```
 * @template T
 * @class EventRelay
 */
export class EventRelay<T> {
    private readonly _listenerCallbacks: Map<((data: T) => void), Set<EventRelayListenerHandle>>;
    private _disposed: boolean = false;

    public constructor() {
        this._listenerCallbacks = new Map<((data: T) => void), Set<EventRelayListenerHandle>>();

        this.createListener = this.createListener.bind(this);
        this.dispatchEvent = this.dispatchEvent.bind(this);
        this.clearListeners = this.clearListeners.bind(this);
        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public createListener(callback: ((data: T) => void)) {
        this._ensureNotDisposed();

        const handle = new EventRelayListenerHandle(() => {
            const handles = this._listenerCallbacks.get(callback);

            if (handles != null) {
                handles.delete(handle);

                if (handles.size === 0)
                    this._listenerCallbacks.delete(callback);
            }
        });

        if (!this._listenerCallbacks.has(callback))
            this._listenerCallbacks.set(callback, new Set<EventRelayListenerHandle>());

        this._listenerCallbacks.get(callback)!.add(handle);

        return handle;
    }

    public createOnceListener(callback: ((data: T) => void)) {
        this._ensureNotDisposed();

        const handle = this.createListener((data: T) => {
            handle.dispose();
            callback(data);
        });

        return handle;
    }

    public dispatchEvent(data: T) {
        for (const [listenerCallback] of Array.from(this._listenerCallbacks.entries())) {
            try {
                listenerCallback(data);
            } catch (err) {
                console.error(err);
            }
        }
    }

    public clearListeners() {
        this._ensureNotDisposed();

        for (const handles of Array.from(this._listenerCallbacks.values())) {
            for (const handle of Array.from(handles)) {
                handle.dispose();
            }
        }

        this._listenerCallbacks.clear();
    }

    public get listenerCount() {
        return this._listenerCallbacks.size;
    }

    public get disposed() {
        return this._disposed;
    }

    public dispose() {
        this.clearListeners();
        this._disposed = true;
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    private _ensureNotDisposed() {
        if (this._disposed)
            throw new DisposedError();
    }
}

export class EventRelayListenerHandle {
    private _dispose: (() => void) | null;

    /**
     * @internal
     * @param {function(): void} dispose
     */
    public constructor(dispose: () => void) {
        this._dispose = dispose;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public dispose() {
        if (this._dispose != null) {
            this._dispose();
            this._dispose = null;
        }
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    public get disposed() {
        return this._dispose == null;
    }
}
