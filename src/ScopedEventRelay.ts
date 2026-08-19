import {DisposedError} from "./DisposedError.js";
import {MultiKeyMap} from "./MultiKeyMap.js";

/**
 * A scoped event relay.
 *
 * Create a listener for a given scope with `createListener` and dispatch events for a given scope with `dispatchEvent`.
 * For each supported event type, create a new instance of `ScopedEventRelay` and expose it as a property,
 * where the scope identifies the target the event belongs to.
 *
 * A scope consists of one or more values that identify the target or context of an event, such as a `clientId` string.
 * @example
 * ```typescript
 * import {ScopedEventRelay} from "lifecycle-utils";
 *
 * class Clients {
 *     public readonly onClientMessage = new ScopedEventRelay<[clientId: string], string>();
 *
 *     public sendMessage(clientId: string, message: string) {
 *         this.onClientMessage.dispatchEvent([clientId], message);
 *         console.log("Done notifying listeners");
 *     }
 * }
 *
 * const clients = new Clients();
 * clients.onClientMessage.createListener(["client1"], (message) => {
 *     console.log(`Message from client1: ${message}`);
 * });
 * clients.onClientMessage.createListener(["client2"], (message) => {
 *     console.log(`Message from client2: ${message}`);
 * });
 * clients.sendMessage("client1", "eat a cookie");
 * clients.sendMessage("client2", "eat a sandwich");
 * ```
 *
 * Will print this:
 * ```
 * Message from client1: eat a cookie
 * Done notifying listeners
 * Message from client2: eat a sandwich
 * Done notifying listeners
 * ```
 */
export class ScopedEventRelay<const Scope extends readonly any[], Event> {
    /** @internal */ public readonly _listenerCallbacks: MultiKeyMap<
        Scope,
        Map<((data: Event) => void), Set<ScopedEventRelayListenerHandle>>
    >;
    /** @internal */ public _totalListeners: number = 0;
    /** @internal */ private _disposed: boolean = false;

    public constructor() {
        this._listenerCallbacks = new MultiKeyMap();

        this.createListener = this.createListener.bind(this);
        this.createOnceListener = this.createOnceListener.bind(this);
        this.dispatchEvent = this.dispatchEvent.bind(this);
        this.clearListeners = this.clearListeners.bind(this);
        this.getListenerCount = this.getListenerCount.bind(this);
        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public createListener(scope: Readonly<Scope>, callback: ((data: Event) => void)) {
        return this._createListener(scope, callback, false);
    }

    public createOnceListener(scope: Readonly<Scope>, callback: ((data: Event) => void)) {
        return this._createListener(scope, callback, true);
    }

    public dispatchEvent(scope: Readonly<Scope>, data: Event) {
        const scopeMap = this._listenerCallbacks.get(scope);
        if (scopeMap == null)
            return;

        for (const [listenerCallback, handles] of Array.from(scopeMap.entries())) {
            if (handles.size !== 0) {
                const scopeClone = handles.values().next().value?._scope as Readonly<Scope> | undefined;

                for (const handle of handles) {
                    if (handle._once) {
                        handles.delete(handle);
                        handle._markDisposed();
                    }
                }

                if (handles.size === 0) {
                    scopeMap.delete(listenerCallback);
                    this._totalListeners--;

                    if (scopeMap.size === 0 && scopeClone != null)
                        this._listenerCallbacks.delete(scopeClone);
                }
            }

            try {
                listenerCallback(data);
            } catch (err) {
                console.error(err);
            }
        }
    }

    /**
     * Clear registered listeners.
     *
     * When called with a scope, only the listeners registered for that scope are cleared.
     *
     * When called without a scope, all registered listeners are cleared regardless of scope.
     */
    public clearListeners(scope?: Readonly<Scope>) {
        this._ensureNotDisposed();

        if (scope != null)
            this._clearScopeListeners(scope);
        else
            this._clearAllScopeListeners();
    }

    /**
     * Get the number of registered listeners.
     *
     * When called with a scope, returns the number of listeners registered for that scope.
     *
     * When called without a scope, returns the total number of registered listeners across all scopes.
     */
    public getListenerCount(scope?: Readonly<Scope>) {
        if (scope == null)
            return this._totalListeners;

        return this._listenerCallbacks.get(scope)?.size ?? 0;
    }

    public get disposed() {
        return this._disposed;
    }

    public dispose() {
        this._clearAllScopeListeners();
        this._disposed = true;
    }

    public [Symbol.dispose]() {
        this.dispose();
    }

    /** @internal */
    private _createListener(scope: Readonly<Scope>, callback: ((data: Event) => void), once: boolean) {
        this._ensureNotDisposed();

        let scopeMap = this._listenerCallbacks.get(scope);
        if (scopeMap == null) {
            scopeMap = new Map();
            this._listenerCallbacks.set(scope, scopeMap);
        }

        let callbackHandles = scopeMap.get(callback);
        if (callbackHandles == null) {
            this._totalListeners++;
            callbackHandles = new Set();
            scopeMap.set(callback, callbackHandles);
        }

        const scopeClone = scopeMap.values().next().value?.values().next().value?._scope ?? scope.slice();
        const handle = ScopedEventRelayListenerHandle._create(this, scopeClone, callback, once);

        callbackHandles.add(handle);

        return handle;
    }

    /** @internal */
    private _clearAllScopeListeners() {
        for (const scopeMap of this._listenerCallbacks.values())
            this._clearListeners(scopeMap);

        this._totalListeners = 0;
        this._listenerCallbacks.clear();
    }

    /** @internal */
    private _clearScopeListeners(scope: Readonly<Scope>) {
        const scopeMap = this._listenerCallbacks.get(scope);
        if (scopeMap == null)
            return;

        this._listenerCallbacks.delete(scope);
        this._clearListeners(scopeMap);
    }

    /** @internal */
    private _clearListeners(scopeMap: Map<((data: Event) => void), Set<ScopedEventRelayListenerHandle>>) {
        for (const handles of scopeMap.values()) {
            for (const handle of handles)
                handle._markDisposed();

            handles.clear();
        }

        this._totalListeners -= scopeMap.size;
        scopeMap.clear();
    }

    /** @internal */
    private _ensureNotDisposed() {
        if (this._disposed)
            throw new DisposedError();
    }
}

export class ScopedEventRelayListenerHandle {
    /** @internal */ private _relay: undefined | ScopedEventRelay<any, any>;
    /** @internal */ public _scope: undefined | readonly any[];
    /** @internal */ private _callback: undefined | ((data: any) => void);
    /** @internal */ public readonly _once: boolean;

    private constructor(
        relay: ScopedEventRelay<any, any>,
        scope: readonly any[],
        callback: (data: any) => void,
        once: boolean
    ) {
        this._relay = relay;
        this._scope = scope;
        this._callback = callback;
        this._once = once;

        this.dispose = this.dispose.bind(this);
        this[Symbol.dispose] = this[Symbol.dispose].bind(this);
    }

    public dispose() {
        if (this._relay == null || this._scope == null || this._callback == null)
            return;

        const scopeMap = this._relay._listenerCallbacks.get(this._scope);
        const callbackHandles = scopeMap?.get(this._callback);

        if (callbackHandles != null) {
            callbackHandles.delete(this);

            if (callbackHandles.size === 0 && scopeMap != null) {
                scopeMap.delete(this._callback);
                this._relay._totalListeners--;

                if (scopeMap.size === 0)
                    this._relay._listenerCallbacks.delete(this._scope);
            }
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
        this._scope = undefined;
        this._callback = undefined;
    }

    /** @internal */
    public static _create(
        relay: ScopedEventRelay<any, any>,
        scope: readonly any[],
        callback: (data: any) => void,
        once: boolean
    ) {
        return new ScopedEventRelayListenerHandle(relay, scope, callback, once);
    }
}
