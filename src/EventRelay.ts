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
 */
export class EventRelay<T> {
    /** @internal */ public readonly _callbacks: Map<((data: T) => void), Set<EventRelayListenerHandle>>;
    /** @internal */ private _disposed: boolean = false;

    public constructor() {
        this._callbacks = new Map<((data: T) => void), Set<EventRelayListenerHandle>>();

        this.createListener = this.createListener.bind(this);
        this.createOnceListener = this.createOnceListener.bind(this);
        this.dispatchEvent = this.dispatchEvent.bind(this);
        this.clearListeners = this.clearListeners.bind(this);
        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public createListener(callback: ((data: T) => void)) {
        return this._createListener(callback, false);
    }

    public createOnceListener(callback: ((data: T) => void)) {
        return this._createListener(callback, true);
    }

    public dispatchEvent(data: T) {
        for (const [listenerCallback, handles] of Array.from(this._callbacks.entries())) {
            if (handles.size !== 0) {
                for (const handle of handles) {
                    if (handle._once) {
                        handles.delete(handle);
                        handle._markDisposed();
                    }
                }

                if (handles.size === 0)
                    this._callbacks.delete(listenerCallback);
            }

            try {
                listenerCallback(data);
            } catch (err) {
                console.error(err);
            }
        }
    }

    public clearListeners() {
        this._ensureNotDisposed();
        this._clearListeners();
    }

    public get listenerCount() {
        return this._callbacks.size;
    }

    public get disposed() {
        return this._disposed;
    }

    public dispose() {
        this._clearListeners();
        this._disposed = true;
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    /** @internal */
    private _createListener(callback: ((data: T) => void), once: boolean) {
        this._ensureNotDisposed();

        const handle = EventRelayListenerHandle._create(this, callback, once);

        let handles = this._callbacks.get(callback);
        if (handles == null) {
            handles = new Set();
            this._callbacks.set(callback, handles);
        }

        handles.add(handle);

        return handle;
    }

    /** @internal */
    private _clearListeners() {
        for (const handles of this._callbacks.values()) {
            for (const handle of handles)
                handle._markDisposed();

            handles.clear();
        }

        this._callbacks.clear();
    }

    /** @internal */
    private _ensureNotDisposed() {
        if (this._disposed)
            throw new DisposedError();
    }
}

export class EventRelayListenerHandle {
    /** @internal */ private _relay: undefined | EventRelay<any>;
    /** @internal */ private _callback: undefined | ((data: any) => void);
    /** @internal */ public readonly _once: boolean;

    private constructor(
        relay: EventRelay<any>,
        callback: (data: any) => void,
        once: boolean
    ) {
        this._relay = relay;
        this._callback = callback;
        this._once = once;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public dispose() {
        if (this._relay == null || this._callback == null)
            return;

        const handles = this._relay._callbacks.get(this._callback);
        if (handles != null) {
            handles.delete(this);

            if (handles.size === 0)
                this._relay._callbacks.delete(this._callback);
        }

        this._markDisposed();
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    public get disposed() {
        return this._relay == null;
    }

    /** @internal */
    public _markDisposed() {
        this._relay = undefined;
        this._callback = undefined;
    }

    /** @internal */
    public static _create(relay: EventRelay<any>, callback: (data: any) => void, once: boolean) {
        return new EventRelayListenerHandle(relay, callback, once);
    }
}
