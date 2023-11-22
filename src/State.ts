/**
 * `State` is a utility class that allows you to hold a value and notify listeners when the value changes.
 * @template T
 */
export class State<T> {
    /** @internal */
    private readonly _queueEvents: boolean;
    /** @internal */
    private readonly _listenerCallbacks: Map<((state: T, lastValue?: T) => void), T>;
    /** @internal */
    private _state: T;
    /** @internal */
    private _changeEventMicrotaskQueued: boolean;

    /**
     * @param {T} defaultState
     * @param {object} [options]
     * @param {boolean} [options.queueEvents=true] - queue events to be dispatched in a microtask.
     * If the state changes multiple times in the same microtask, only the last change will be dispatched.
     * If the most recent value is the same as the previous value, no event will be dispatched.
     * Set this to `false` to dispatch events immediately upon state changes.
     */
    public constructor(defaultState: T, {queueEvents = true} = {}) {
        this._queueEvents = queueEvents;
        this._listenerCallbacks = new Map<((state: T) => void), T>();

        this._state = defaultState;
        this._changeEventMicrotaskQueued = false;

        this.createChangeListener = this.createChangeListener.bind(this);
        this.clearChangeListeners = this.clearChangeListeners.bind(this);
    }

    public get state(): T {
        return this._state;
    }

    public set state(newState: T) {
        if (this._state === newState)
            return;

        this._state = newState;

        if (!this._queueEvents) {
            this._dispatchChangeEvent(this._state);
        } else if (!this._changeEventMicrotaskQueued) {
            this._changeEventMicrotaskQueued = true;

            (globalThis.queueMicrotask || globalThis.setTimeout)(() => {
                this._changeEventMicrotaskQueued = false;

                this._dispatchChangeEvent(this._state);
            });
        }
    }

    public createChangeListener(callback: ((state: T, lastValue?: T) => void), callInstantlyWithCurrentState: boolean = false) {
        this._listenerCallbacks.set(callback, this._state);

        if (callInstantlyWithCurrentState) {
            try {
                callback(this._state, undefined);
            } catch (err) {
                console.error(err);
            }
        }

        return StateChangeListenerHandle._create(() => {
            this._listenerCallbacks.delete(callback);
        });
    }

    public clearChangeListeners() {
        this._listenerCallbacks.clear();
    }

    public get changeListenerCount() {
        return this._listenerCallbacks.size;
    }

    /**
     * @internal
     * @param {T} newState
     */
    private _dispatchChangeEvent(newState: T) {
        for (const [listenerCallback, lastValue] of Array.from(this._listenerCallbacks.entries())) {
            if (lastValue === newState)
                continue;

            if (this._listenerCallbacks.has(listenerCallback))
                this._listenerCallbacks.set(listenerCallback, newState);

            try {
                listenerCallback(newState, lastValue);
            } catch (err) {
                console.error(err);
            }
        }
    }

    /**
     * Create a listener that listens to multiple states and calls the callback when any of the states change.
     *
     * For example,
     * ```typescript
     * import {State} from "lifecycle-utils";
     *
     * const valueState1 = new State<number>(6);
     * const valueState2 = new State<string>("hello");
     * const valueState3 = new State<boolean>(true);
     *
     * const eventHandle = State.createCombinedChangeListener([valueState1, valueState2, valueState3], (newValues, previousValues) => {
     *     console.log("new values:", newValues);
     *     console.log("previous values:", previousValues);
     * });
     *
     * valueState1.state = 7;
     * valueState2.state = "world";
     * valueState3.state = false;
     *
     * // after a microtask, the listener will be called
     * // to make event fire immediately upon change, disable the `queueEvents` option on the constructor
     * await new Promise(resolve => setTimeout(resolve, 0));
     * // will print:
     * // new values: [7, "world", false]
     * // previous values: [6, "hello", true]
     *
     * eventHandle.dispose();
     * ```
     * @param {Array<State<any>>} states
     * @param {function(any[]): void} callback
     * @param {object} [options]
     * @param {boolean} [options.callInstantlyWithCurrentState=false]
     * @param {boolean} [options.queueEvents=true] - queue events to be dispatched in a microtask.
     * If the state changes multiple times in the same microtask, only the last change will be dispatched.
     * If the most recent value is the same as the previous value, no event will be dispatched.
     * Set this to `false` to dispatch events immediately upon state changes.
     * @returns {StateChangeListenerHandle}
     */
    public static createCombinedChangeListener<const StatesObjects extends readonly State<any>[], const StateTypes = {
        -readonly [Index in keyof StatesObjects]: TypeOfState<StatesObjects[Index]>
    }>(
        states: StatesObjects,
        callback: ((state: StateTypes, previousState: StateTypes | {-readonly [Index in keyof StatesObjects]: undefined}) => void),
        {
            callInstantlyWithCurrentState = false,
            queueEvents = true
        }: {
            callInstantlyWithCurrentState?: boolean,
            queueEvents?: boolean
        } = {}
    ) {
        let changeEventMicrotaskQueued = false;
        const getState = () => states.map(state => state.state) as StateTypes;
        let lastDispatchState = getState();

        const dispatchEvent = (onlyIfChanged: boolean = true, includeLastState: boolean = true) => {
            const newState = getState();
            const previousState = lastDispatchState;

            if (
                onlyIfChanged &&
                (newState as any[]).every((value, index) => value === (previousState as any[])[index])
            )
                return;

            lastDispatchState = newState;

            try {
                callback(
                    newState,
                    includeLastState
                        ? previousState
                        : ((previousState as any[]).map(() => undefined) as {-readonly [Index in keyof StatesObjects]: undefined})
                );
            } catch (err) {
                console.error(err);
            }
        };
        const onChange = () => {
            if (changeEventMicrotaskQueued)
                return;

            if (!queueEvents)
                dispatchEvent();
            else {
                changeEventMicrotaskQueued = true;

                (globalThis.queueMicrotask || globalThis.setTimeout)(() => {
                    changeEventMicrotaskQueued = false;

                    dispatchEvent();
                });
            }
        };

        const handlers = states.map(state => state.createChangeListener(onChange, false));

        if (callInstantlyWithCurrentState)
            dispatchEvent(false, false);

        return StateChangeListenerHandle._create(() => handlers.forEach(handler => handler.dispose()));
    }
}

export class StateChangeListenerHandle {
    /** @internal */
    private _dispose: (() => void) | null;

    private constructor(dispose: () => void) {
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

    /**
     * @internal
     * @param {function(): void} dispose
     * @returns {StateChangeListenerHandle}
     */
    public static _create(dispose: () => void) {
        return new StateChangeListenerHandle(dispose);
    }
}

type TypeOfState<T extends State<any>> = T extends State<infer S> ? S : never;
