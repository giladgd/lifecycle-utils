import {describe, expect, expectTypeOf, test, vi} from "vitest";
import {EventRelay, DisposedError} from "../src/index.js";

describe("EventRelay", () => {
    test("events are dispatched", async () => {
        const eventRelay = new EventRelay<string>();

        const onEvent1 = {
            event(event: string) {
                event; // do nothing
            }
        };
        const onEvent2 = {
            event(event: string) {
                event; // do nothing
            }
        };
        const onStateChangeSpy1 = vi.spyOn(onEvent1, "event");
        const onStateChangeSpy2 = vi.spyOn(onEvent2, "event");

        const eventHandle1 = eventRelay.createListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent1.event(data);
        });
        const eventHandle2 = eventRelay.createListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent2.event(data);
        });

        expect(onStateChangeSpy1).not.toHaveBeenCalled();
        expect(onStateChangeSpy2).not.toHaveBeenCalled();

        eventRelay.dispatchEvent("something");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");
        expect(onStateChangeSpy2).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy2).toHaveBeenCalledWith("something");

        eventHandle1.dispose();

        eventRelay.dispatchEvent("something2");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");
        expect(onStateChangeSpy2).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy2).toHaveBeenLastCalledWith("something2");

        eventHandle2[Symbol.dispose]();

        eventRelay.dispatchEvent("something3");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");
        expect(onStateChangeSpy2).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy2).toHaveBeenLastCalledWith("something2");
    });

    test("once listener is only called once", async () => {
        const eventRelay = new EventRelay<string>();

        const onEvent1 = {
            event(event: string) {
                event; // do nothing
            }
        };
        const onStateChangeSpy1 = vi.spyOn(onEvent1, "event");

        const eventHandle1 = eventRelay.createOnceListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent1.event(data);
        });

        expect(onStateChangeSpy1).not.toHaveBeenCalled();
        expect(eventHandle1.disposed).toBe(false);

        eventRelay.dispatchEvent("something");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        eventRelay.dispatchEvent("something2");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        expect(eventHandle1.disposed).toBe(true);
    });

    test("clearListeners works", async () => {
        const eventRelay = new EventRelay<string>();

        const onEvent1 = {
            event(event: string) {
                event; // do nothing
            }
        };
        const onStateChangeSpy1 = vi.spyOn(onEvent1, "event");

        const eventHandle1 = eventRelay.createListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent1.event(data);
        });

        expect(eventRelay.listenerCount).toBe(1);
        expect(onStateChangeSpy1).not.toHaveBeenCalled();
        expect(eventHandle1.disposed).toBe(false);

        eventRelay.dispatchEvent("something");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        eventRelay.clearListeners();
        expect(eventRelay.listenerCount).toBe(0);

        eventRelay.dispatchEvent("something2");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        expect(eventHandle1.disposed).toBe(true);
    });

    test("dispose works", async () => {
        const eventRelay = new EventRelay<string>();

        const onEvent1 = {
            event(event: string) {
                event; // do nothing
            }
        };
        const onStateChangeSpy1 = vi.spyOn(onEvent1, "event");

        const eventHandle1 = eventRelay.createListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent1.event(data);
        });

        expect(eventRelay.listenerCount).toBe(1);
        expect(onStateChangeSpy1).not.toHaveBeenCalled();
        expect(eventHandle1.disposed).toBe(false);

        eventRelay.dispatchEvent("something");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        eventRelay.dispose();
        expect(eventRelay.disposed).toBe(true);
        expect(eventRelay.listenerCount).toBe(0);

        eventRelay.dispatchEvent("something2");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        expect(eventHandle1.disposed).toBe(true);
    });

    test("Symbol.dispose works", async () => {
        const eventRelay = new EventRelay<string>();

        const onEvent1 = {
            event(event: string) {
                event; // do nothing
            }
        };
        const onStateChangeSpy1 = vi.spyOn(onEvent1, "event");

        const eventHandle1 = eventRelay.createListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent1.event(data);
        });

        expect(eventRelay.listenerCount).toBe(1);
        expect(onStateChangeSpy1).not.toHaveBeenCalled();
        expect(eventHandle1.disposed).toBe(false);

        eventRelay.dispatchEvent("something");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        eventRelay[Symbol.dispose]();
        expect(eventRelay.disposed).toBe(true);
        expect(eventRelay.listenerCount).toBe(0);

        eventRelay.dispatchEvent("something2");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        expect(eventHandle1.disposed).toBe(true);
    });

    test("error in event", async () => {
        const eventRelay = new EventRelay<string>();

        let calledCount = 0;
        const onEvent1 = {
            event(event: string) {
                event; // do nothing

                if (calledCount++ === 0)
                    throw new Error("Ignore this error");
            }
        };
        const onStateChangeSpy1 = vi.spyOn(onEvent1, "event");

        const eventHandle1 = eventRelay.createListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent1.event(data);
        });

        expect(eventRelay.listenerCount).toBe(1);
        expect(onStateChangeSpy1).not.toHaveBeenCalled();
        expect(eventHandle1.disposed).toBe(false);

        eventRelay.dispatchEvent("something");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        eventRelay.dispatchEvent("something2");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy1).toHaveBeenLastCalledWith("something2");

        eventRelay[Symbol.dispose]();
        expect(eventHandle1.disposed).toBe(true);

        eventRelay.dispatchEvent("something3");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy1).toHaveBeenLastCalledWith("something2");
    });

    test("fail to create listener on disposed EventRelay", async () => {
        const eventRelay = new EventRelay<string>();

        const onEvent1 = {
            event(event: string) {
                event; // do nothing
            }
        };
        const onStateChangeSpy1 = vi.spyOn(onEvent1, "event");

        const eventHandle1 = eventRelay.createListener((data) => {
            expectTypeOf(data).toBeString();
            onEvent1.event(data);
        });

        expect(eventRelay.listenerCount).toBe(1);
        expect(onStateChangeSpy1).not.toHaveBeenCalled();
        expect(eventHandle1.disposed).toBe(false);

        eventRelay.dispatchEvent("something");
        expect(onStateChangeSpy1).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy1).toHaveBeenCalledWith("something");

        eventRelay[Symbol.dispose]();
        expect(eventHandle1.disposed).toBe(true);

        try {
            eventRelay.createListener((data) => {
                console.log(data);
            });
            expect.unreachable("Should have thrown an error");
        } catch (err) {
            expect(err).to.be.an.instanceof(Error);
            expect(err).to.be.an.instanceof(DisposedError);
        }
    });
});
