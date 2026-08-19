import {type ValidLockScope, withLock} from "./withLock.js";
import {MultiKeyMap} from "./MultiKeyMap.js";
import {AbortablePromise} from "./AbortablePromise.js";

type FlightState = [
    promise: Promise<any>,
    controller: AbortController,
    callers: number,
    scope: readonly any[]
];
const enum FlightIndex {
    promise = 0,
    controller = 1,
    callers = 2,
    scope = 3
}
const flights = new MultiKeyMap<any[], FlightState>();

/**
 * Run a callback at most once in parallel for the given `scope`,
 * with parallel callers sharing its result.
 * The result is only shared with other callers while the callback is running; later calls will run the callback again.
 *
 * Aborting a caller makes its promise reject immediately,
 * but only aborts the running callback's `signal` when no other callers are waiting for its result.
 *
 * The callback holds an exclusive lock for the given `scope` while it runs.
 * The callback accepts a `signal` argument that indicates when it should abort its execution.
 * @example
 * ```typescript
 * import {withSingleFlight, sleep} from "lifecycle-utils";
 *
 * const scope = {};
 * let callCount = 0;
 *
 * async function getValue() {
 *     return await withSingleFlight([scope, "myKey"], async () => {
 *         const value = ++callCount;
 *         await sleep(100);
 *         return value;
 *     });
 * }
 *
 * const first = getValue();
 * await sleep(10);
 * const second = getValue();
 * await sleep(10);
 * const third = getValue();
 *
 * console.log(await first); // 1
 * console.log(await second); // 1
 * console.log(await third); // 1
 * console.log(callCount); // 1
 *
 * console.log(await getValue()); // 2
 * console.log(callCount); // 2
 * ```
 * @example
 * ```typescript
 * import {withSingleFlight, sleep} from "lifecycle-utils";
 *
 * const scope = {};
 * let callCount = 0;
 * let aborted = false;
 * let done = false;
 *
 * function getValue(signal?: AbortSignal) {
 *     return withSingleFlight([scope, "myKey"], signal, async (signal) => {
 *         signal.addEventListener("abort", () => {
 *             aborted = true;
 *         });
 *
 *         const value = ++callCount;
 *         await sleep(100);
 *
 *         done = true;
 *         return value;
 *     });
 * }
 *
 * const firstController = new AbortController();
 * const secondController = new AbortController();
 *
 * const first = getValue(firstController.signal);
 * await sleep(10);
 * const second = getValue(secondController.signal);
 *
 * firstController.abort(new Error("Canceled"));
 *
 * try {
 *     await first;
 * } catch (err) {
 *     console.log((err as Error).message); // "Canceled"
 * }
 *
 * console.log(callCount); // 1
 * console.log(done); // false
 * console.log(aborted); // false
 *
 * console.log(await second); // 1
 * console.log(callCount); // 1
 * console.log(done); // true
 * console.log(aborted); // false
 * ```
 */
export function withSingleFlight<ReturnType, const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>,
    callback: (signal: AbortSignal) => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export function withSingleFlight<ReturnType, const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>,
    signal: AbortSignal | undefined,
    callback: (signal: AbortSignal) => Promise<ReturnType> | ReturnType
): Promise<ReturnType>;
export function withSingleFlight<ReturnType, const Scope extends readonly any[]>(
    scope: ValidLockScope<Scope>,
    signal: AbortSignal | undefined | ((signal: AbortSignal) => Promise<ReturnType> | ReturnType),
    callback?: (signal: AbortSignal) => Promise<ReturnType> | ReturnType
): Promise<ReturnType> {
    let callerSignal: AbortSignal | undefined = undefined;

    if (signal instanceof AbortSignal)
        callerSignal = signal;
    else if (signal != null)
        callback = signal;

    if (callback == null)
        return Promise.reject(new Error("callback is required"));
    else if (callerSignal?.aborted)
        return Promise.reject(callerSignal.reason);

    let state = flights.get(scope);

    if (state == null) {
        const abortController = new AbortController();
        const scopeClone = scope.slice();
        const [tempPromise, acceptPromise] = promiseWithResolver<ReturnType>();

        state = [tempPromise, abortController, 1, scopeClone];
        flights.set(scopeClone, state);

        const promise = withLock(
            scopeClone,
            callerSignal == null // if the first flight doesn't supply a signal, then it won't ever get canceled
                ? undefined
                : abortController.signal,
            () => callback(abortController.signal)
        );
        state[FlightIndex.promise] = promise;
        const onFlightDone = () => {
            if (state![FlightIndex.callers] === 0)
                return;

            state![FlightIndex.callers] = 0;
            flights.delete(state![FlightIndex.scope]);
        };
        void promise.then(onFlightDone, onFlightDone);

        void tempPromise.catch(doNothing);
        acceptPromise(promise);
    } else
        state[FlightIndex.callers]++;

    if (callerSignal == null)
        return state[FlightIndex.promise] as Promise<ReturnType>;
    else if (callerSignal.aborted) {
        onSignalAbort(state, callerSignal);
        return Promise.reject(callerSignal.reason);
    }

    return Promise.resolve(
        new AbortablePromise<ReturnType>(callerSignal, (accept, reject) => {
            state[FlightIndex.promise].then(accept, reject);

            return (resolved) => {
                if (!resolved && callerSignal.aborted)
                    onSignalAbort(state, callerSignal);
            };
        })
    );
}

function onSignalAbort(state: FlightState, signal: AbortSignal) {
    const currentCallers = state[FlightIndex.callers];
    if (currentCallers === 1) {
        state[FlightIndex.callers] = 0;
        flights.delete(state[FlightIndex.scope]);

        state[FlightIndex.controller].abort(signal.reason);
    } else if (currentCallers !== 0)
        state[FlightIndex.callers] = currentCallers - 1;
}

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
