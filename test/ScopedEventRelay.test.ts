import {describe, expect, expectTypeOf, test, vi} from "vitest";

import {DisposedError, ScopedEventRelay} from "../src/index.js";

type TestScope = [root: object, key: string];

describe("ScopedEventRelay", () => {
    describe("basic behavior", () => {
        test("events are dispatched only to listeners in the matching scope", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope1: TestScope = [root, "one"];
            const scope2: TestScope = [root, "two"];
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            const callback3 = vi.fn();

            eventRelay.createListener(scope1, (data) => {
                expectTypeOf(data).toBeString();
                callback1(data);
            });
            eventRelay.createListener(scope1, callback2);
            eventRelay.createListener(scope2, callback3);

            eventRelay.dispatchEvent(scope1, "first");

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback1).toHaveBeenCalledWith("first");
            expect(callback2).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledWith("first");
            expect(callback3).not.toHaveBeenCalled();

            eventRelay.dispatchEvent(scope2, "second");

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
            expect(callback3).toHaveBeenCalledTimes(1);
            expect(callback3).toHaveBeenCalledWith("second");
        });

        test("dispatching to a scope without listeners does nothing", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};

            expect(eventRelay.getListenerCount()).toBe(0);
            expect(eventRelay.getListenerCount([root, "missing"])).toBe(0);
            expect(() => eventRelay.dispatchEvent([root, "missing"], "event")).not.toThrow();
        });
    });

    describe("scope behavior", () => {
        test("equivalent scope arrays address the same listeners", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const callback = vi.fn();

            eventRelay.createListener([root, "key"], callback);
            eventRelay.dispatchEvent([root, "key"], "event");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith("event");
            expect(eventRelay.getListenerCount([root, "key"])).toBe(1);
        });

        test("the same callback is registered independently in different scopes", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope1: TestScope = [root, "one"];
            const scope2: TestScope = [root, "two"];
            const callback = vi.fn();

            const onceHandle = eventRelay.createOnceListener(scope1, callback);
            const regularHandle = eventRelay.createListener(scope2, callback);

            expect(eventRelay.getListenerCount()).toBe(2);
            expect(eventRelay.getListenerCount(scope1)).toBe(1);
            expect(eventRelay.getListenerCount(scope2)).toBe(1);

            eventRelay.dispatchEvent(scope1, "first");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith("first");
            expect(onceHandle.disposed).toBe(true);
            expect(regularHandle.disposed).toBe(false);
            expect(eventRelay.getListenerCount(scope1)).toBe(0);
            expect(eventRelay.getListenerCount(scope2)).toBe(1);
            expect(eventRelay.getListenerCount()).toBe(1);

            eventRelay.dispatchEvent(scope2, "second");

            expect(callback).toHaveBeenCalledTimes(2);
            expect(callback).toHaveBeenLastCalledWith("second");
            expect(regularHandle.disposed).toBe(false);
        });

        test("different object identities create different scopes", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root1 = {};
            const root2 = {};
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            eventRelay.createListener([root1, "key"], callback1);
            eventRelay.createListener([root2, "key"], callback2);

            eventRelay.dispatchEvent([root1, "key"], "event");

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).not.toHaveBeenCalled();
            expect(eventRelay.getListenerCount()).toBe(2);
        });

        test("scope value order matters", () => {
            const eventRelay = new ScopedEventRelay<[first: object, second: object], string>();
            const first = {};
            const second = {};
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            eventRelay.createListener([first, second], callback1);
            eventRelay.createListener([second, first], callback2);

            eventRelay.dispatchEvent([first, second], "event");

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).not.toHaveBeenCalled();
        });

        test("supports an empty scope", () => {
            const eventRelay = new ScopedEventRelay<[], string>();
            const callback = vi.fn();

            const handle = eventRelay.createListener([], callback);
            eventRelay.dispatchEvent([], "event");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith("event");

            handle.dispose();
            expect(eventRelay.getListenerCount()).toBe(0);
        });

        test("uses one stable scope snapshot for all listeners in a scope", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            const handle1 = eventRelay.createListener(scope, callback1);
            scope[1] = "changed";
            const handle2 = eventRelay.createListener([root, "key"], callback2);

            expect(handle1._scope).not.toBe(scope);
            expect(handle1._scope).toBe(handle2._scope);
            expect(handle1._scope).toEqual([root, "key"]);

            eventRelay.dispatchEvent([root, "key"], "event");
            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);

            handle1.dispose();
            expect(eventRelay.getListenerCount([root, "key"])).toBe(1);
            handle2.dispose();
            expect(eventRelay.getListenerCount([root, "key"])).toBe(0);
            expect(eventRelay.getListenerCount([root, "changed"])).toBe(0);
        });
    });

    describe("once listeners", () => {
        test("once listener is only called once", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();
            const handle = eventRelay.createOnceListener(scope, callback);

            expect(handle.disposed).toBe(false);
            expect(eventRelay.getListenerCount()).toBe(1);

            eventRelay.dispatchEvent(scope, "first");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith("first");
            expect(handle.disposed).toBe(true);
            expect(eventRelay.getListenerCount()).toBe(0);
            expect(eventRelay.getListenerCount(scope)).toBe(0);
            expect(eventRelay._listenerCallbacks.size).toBe(0);

            eventRelay.dispatchEvent(scope, "second");
            expect(callback).toHaveBeenCalledTimes(1);
        });

        test("once registration only removes itself when the same callback also has a regular registration", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();

            const regularHandle = eventRelay.createListener(scope, callback);
            const onceHandle = eventRelay.createOnceListener(scope, callback);

            expect(eventRelay.getListenerCount()).toBe(1);
            expect(eventRelay.getListenerCount(scope)).toBe(1);

            eventRelay.dispatchEvent(scope, "first");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith("first");
            expect(onceHandle.disposed).toBe(true);
            expect(regularHandle.disposed).toBe(false);
            expect(eventRelay.getListenerCount()).toBe(1);

            eventRelay.dispatchEvent(scope, "second");

            expect(callback).toHaveBeenCalledTimes(2);
            expect(callback).toHaveBeenLastCalledWith("second");
            expect(regularHandle.disposed).toBe(false);
        });

        test("multiple once registrations of the same callback dispatch the callback only once", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();

            const handle1 = eventRelay.createOnceListener(scope, callback);
            const handle2 = eventRelay.createOnceListener(scope, callback);

            expect(eventRelay.getListenerCount()).toBe(1);

            eventRelay.dispatchEvent(scope, "event");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(handle1.disposed).toBe(true);
            expect(handle2.disposed).toBe(true);
            expect(eventRelay.getListenerCount()).toBe(0);
        });

        test("removing a once callback keeps other callbacks in the same scope", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const onceCallback = vi.fn();
            const regularCallback = vi.fn();

            const onceHandle = eventRelay.createOnceListener(scope, onceCallback);
            const regularHandle = eventRelay.createListener(scope, regularCallback);

            expect(eventRelay.getListenerCount(scope)).toBe(2);

            eventRelay.dispatchEvent(scope, "first");

            expect(onceCallback).toHaveBeenCalledTimes(1);
            expect(regularCallback).toHaveBeenCalledTimes(1);
            expect(onceHandle.disposed).toBe(true);
            expect(regularHandle.disposed).toBe(false);
            expect(eventRelay.getListenerCount(scope)).toBe(1);
            expect(eventRelay.getListenerCount()).toBe(1);

            eventRelay.dispatchEvent(scope, "second");

            expect(onceCallback).toHaveBeenCalledTimes(1);
            expect(regularCallback).toHaveBeenCalledTimes(2);
        });

        test("once listener is removed before it is called", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn((data: string) => {
                if (data === "outer")
                    eventRelay.dispatchEvent(scope, "inner");
            });

            const handle = eventRelay.createOnceListener(scope, callback);
            eventRelay.dispatchEvent(scope, "outer");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith("outer");
            expect(handle.disposed).toBe(true);
            expect(eventRelay.getListenerCount()).toBe(0);
        });
    });

    describe("listener handles and counts", () => {
        test("multiple regular registrations of the same callback share one listener slot", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();

            const handle1 = eventRelay.createListener(scope, callback);
            const handle2 = eventRelay.createListener(scope, callback);

            expect(eventRelay.getListenerCount()).toBe(1);
            expect(eventRelay.getListenerCount(scope)).toBe(1);

            eventRelay.dispatchEvent(scope, "event");
            expect(callback).toHaveBeenCalledTimes(1);

            handle1.dispose();
            expect(handle1.disposed).toBe(true);
            expect(handle2.disposed).toBe(false);
            expect(eventRelay.getListenerCount(scope)).toBe(1);

            handle1.dispose();
            expect(eventRelay.getListenerCount(scope)).toBe(1);

            handle2[Symbol.dispose]();
            expect(handle2.disposed).toBe(true);
            expect(eventRelay.getListenerCount(scope)).toBe(0);
            expect(eventRelay.getListenerCount()).toBe(0);
        });

        test("disposing the last handle for one callback keeps other callbacks in the scope", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            const handle1 = eventRelay.createListener(scope, callback1);
            const handle2 = eventRelay.createListener(scope, callback2);

            expect(eventRelay.getListenerCount(scope)).toBe(2);

            handle1.dispose();

            expect(handle1.disposed).toBe(true);
            expect(handle2.disposed).toBe(false);
            expect(eventRelay.getListenerCount(scope)).toBe(1);
            expect(eventRelay.getListenerCount()).toBe(1);

            handle2.dispose();
            expect(eventRelay.getListenerCount(scope)).toBe(0);
            expect(eventRelay.getListenerCount()).toBe(0);
        });

        test("listener counts are tracked independently per scope and as a total", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope1: TestScope = [root, "one"];
            const scope2: TestScope = [root, "two"];
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            eventRelay.createListener(scope1, callback1);
            eventRelay.createListener(scope1, callback1);
            eventRelay.createListener(scope1, callback2);
            eventRelay.createListener(scope2, callback1);

            expect(eventRelay.getListenerCount(scope1)).toBe(2);
            expect(eventRelay.getListenerCount(scope2)).toBe(1);
            expect(eventRelay.getListenerCount([root, "missing"])).toBe(0);
            expect(eventRelay.getListenerCount()).toBe(3);
        });
    });

    describe("clearing and disposal", () => {
        test("clearListeners for a scope only clears that scope", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope1: TestScope = [root, "one"];
            const scope2: TestScope = [root, "two"];
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            const callback3 = vi.fn();

            const handle1 = eventRelay.createListener(scope1, callback1);
            const handle2 = eventRelay.createListener(scope1, callback2);
            const handle3 = eventRelay.createListener(scope2, callback3);

            eventRelay.clearListeners([root, "one"]);

            expect(handle1.disposed).toBe(true);
            expect(handle2.disposed).toBe(true);
            expect(handle3.disposed).toBe(false);
            expect(eventRelay.getListenerCount(scope1)).toBe(0);
            expect(eventRelay.getListenerCount(scope2)).toBe(1);
            expect(eventRelay.getListenerCount()).toBe(1);

            eventRelay.dispatchEvent(scope1, "ignored");
            eventRelay.dispatchEvent(scope2, "event");

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).not.toHaveBeenCalled();
            expect(callback3).toHaveBeenCalledTimes(1);
            expect(callback3).toHaveBeenCalledWith("event");
        });

        test("clearListeners for a missing scope does nothing", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();
            const handle = eventRelay.createListener(scope, callback);

            eventRelay.clearListeners([root, "missing"]);

            expect(handle.disposed).toBe(false);
            expect(eventRelay.getListenerCount()).toBe(1);
            expect(eventRelay.getListenerCount(scope)).toBe(1);
        });

        test("clearListeners without a scope clears every scope", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope1: TestScope = [root, "one"];
            const scope2: TestScope = [root, "two"];
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            const handle1 = eventRelay.createListener(scope1, callback1);
            const handle2 = eventRelay.createListener(scope2, callback2);

            eventRelay.clearListeners();

            expect(handle1.disposed).toBe(true);
            expect(handle2.disposed).toBe(true);
            expect(eventRelay.getListenerCount()).toBe(0);
            expect(eventRelay.getListenerCount(scope1)).toBe(0);
            expect(eventRelay.getListenerCount(scope2)).toBe(0);

            eventRelay.dispatchEvent(scope1, "ignored");
            eventRelay.dispatchEvent(scope2, "ignored");
            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).not.toHaveBeenCalled();
        });

        test("dispose clears listeners and is idempotent", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();
            const handle = eventRelay.createListener(scope, callback);

            expect(eventRelay.disposed).toBe(false);

            eventRelay.dispose();

            expect(eventRelay.disposed).toBe(true);
            expect(handle.disposed).toBe(true);
            expect(eventRelay.getListenerCount()).toBe(0);
            expect(eventRelay.getListenerCount(scope)).toBe(0);
            expect(() => eventRelay.dispatchEvent(scope, "ignored")).not.toThrow();
            expect(callback).not.toHaveBeenCalled();

            expect(() => eventRelay.dispose()).not.toThrow();
            expect(eventRelay.disposed).toBe(true);
        });

        test("Symbol.dispose disposes the relay", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const handle = eventRelay.createListener(scope, vi.fn());

            eventRelay[Symbol.dispose]();

            expect(eventRelay.disposed).toBe(true);
            expect(handle.disposed).toBe(true);
            expect(eventRelay.getListenerCount()).toBe(0);
        });

        test("listener creation and clearing fail after disposal", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];

            eventRelay.dispose();

            expect(() => eventRelay.createListener(scope, vi.fn())).toThrow(DisposedError);
            expect(() => eventRelay.createOnceListener(scope, vi.fn())).toThrow(DisposedError);
            expect(() => eventRelay.clearListeners()).toThrow(DisposedError);
        });
    });

    describe("errors", () => {
        test("an error in one listener is logged and does not prevent other listeners from running", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const error = new Error("Ignore this error");
            const callback1 = vi.fn(() => {
                throw error;
            });
            const callback2 = vi.fn();
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            try {
                eventRelay.createListener(scope, callback1);
                eventRelay.createListener(scope, callback2);

                eventRelay.dispatchEvent(scope, "event");

                expect(callback1).toHaveBeenCalledTimes(1);
                expect(callback2).toHaveBeenCalledTimes(1);
                expect(callback2).toHaveBeenCalledWith("event");
                expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
                expect(consoleErrorSpy).toHaveBeenCalledWith(error);
                expect(eventRelay.getListenerCount(scope)).toBe(2);
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });

        test("a throwing once listener is still removed", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const error = new Error("Ignore this error");
            const callback = vi.fn(() => {
                throw error;
            });
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            try {
                const handle = eventRelay.createOnceListener(scope, callback);

                eventRelay.dispatchEvent(scope, "first");
                eventRelay.dispatchEvent(scope, "second");

                expect(callback).toHaveBeenCalledTimes(1);
                expect(handle.disposed).toBe(true);
                expect(eventRelay.getListenerCount()).toBe(0);
                expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
                expect(consoleErrorSpy).toHaveBeenCalledWith(error);
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });
    });

    describe("reentrancy and dispatch snapshots", () => {
        test("re-registering a disposed listener during dispatch does not remove the new registration", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();
            let callbackHandle: ReturnType<typeof eventRelay.createListener> | undefined;

            const mutatingHandle = eventRelay.createOnceListener(scope, () => {
                callbackHandle!.dispose();
                callbackHandle = eventRelay.createListener(scope, callback);
            });
            callbackHandle = eventRelay.createListener(scope, callback);

            eventRelay.dispatchEvent(scope, "first");

            expect(mutatingHandle.disposed).toBe(true);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith("first");
            expect(callbackHandle.disposed).toBe(false);
            expect(eventRelay.getListenerCount(scope)).toBe(1);
            expect(eventRelay.getListenerCount()).toBe(1);

            eventRelay.dispatchEvent(scope, "second");

            expect(callback).toHaveBeenCalledTimes(2);
            expect(callback).toHaveBeenLastCalledWith("second");
            expect(eventRelay.getListenerCount(scope)).toBe(1);
        });

        test("a newly added callback is not called until the next dispatch", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const addedCallback = vi.fn();
            let addedHandle: ReturnType<typeof eventRelay.createListener> | undefined;

            eventRelay.createListener(scope, () => {
                if (addedHandle == null)
                    addedHandle = eventRelay.createListener(scope, addedCallback);
            });

            eventRelay.dispatchEvent(scope, "first");

            expect(addedCallback).not.toHaveBeenCalled();
            expect(eventRelay.getListenerCount(scope)).toBe(2);

            eventRelay.dispatchEvent(scope, "second");

            expect(addedCallback).toHaveBeenCalledTimes(1);
            expect(addedCallback).toHaveBeenCalledWith("second");
        });

        test("clearing a scope during dispatch does not stop callbacks already in the dispatch snapshot", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback1 = vi.fn(() => {
                eventRelay.clearListeners(scope);
            });
            const callback2 = vi.fn();

            const handle1 = eventRelay.createListener(scope, callback1);
            const handle2 = eventRelay.createListener(scope, callback2);

            eventRelay.dispatchEvent(scope, "event");

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledWith("event");
            expect(handle1.disposed).toBe(true);
            expect(handle2.disposed).toBe(true);
            expect(eventRelay.getListenerCount(scope)).toBe(0);
            expect(eventRelay.getListenerCount()).toBe(0);
        });
    });

    describe("bound methods", () => {
        test("public methods remain bound when detached from the relay", () => {
            const eventRelay = new ScopedEventRelay<TestScope, string>();
            const root = {};
            const scope: TestScope = [root, "key"];
            const callback = vi.fn();
            const onceCallback = vi.fn();
            const createListener = eventRelay.createListener;
            const createOnceListener = eventRelay.createOnceListener;
            const dispatchEvent = eventRelay.dispatchEvent;
            const clearListeners = eventRelay.clearListeners;
            const getListenerCount = eventRelay.getListenerCount;
            const dispose = eventRelay.dispose;
            const symbolDispose = eventRelay[Symbol.dispose];

            const regularHandle = createListener(scope, callback);
            const onceHandle = createOnceListener(scope, onceCallback);

            expect(getListenerCount(scope)).toBe(2);
            dispatchEvent(scope, "event");

            expect(callback).toHaveBeenCalledTimes(1);
            expect(onceCallback).toHaveBeenCalledTimes(1);
            expect(onceHandle.disposed).toBe(true);
            expect(regularHandle.disposed).toBe(false);

            clearListeners(scope);
            expect(regularHandle.disposed).toBe(true);
            expect(getListenerCount()).toBe(0);

            const secondHandle = createListener(scope, callback);
            expect(() => dispose()).not.toThrow();
            expect(secondHandle.disposed).toBe(true);
            expect(eventRelay.disposed).toBe(true);
            expect(() => symbolDispose()).not.toThrow();
        });
    });
});
