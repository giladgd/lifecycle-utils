import {describe, expect, expectTypeOf, test, vi} from "vitest";
import {State} from "../src/index.js";

describe("State", () => {
    test("event fired on change", async () => {
        vi.useFakeTimers();

        const state = new State(0);

        const onStateChange = {
            event(state: number) {
                expect(state).toBe(1);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        state.createChangeListener(onStateChange.event);
        expect(onStateChangeSpy).not.toHaveBeenCalled();

        state.state = 1;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith(1, 0);

        vi.useRealTimers();
    });

    test("event fired on register", async () => {
        vi.useFakeTimers();

        const state = new State(0);
        let expectedState = 0;

        const onStateChange = {
            event(state: number) {
                expect(state).toBe(expectedState);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        state.createChangeListener(onStateChange.event, true);
        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith(0, undefined);

        expectedState = 1;
        state.state = 1;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy).toHaveBeenLastCalledWith(1, 0);

        vi.useRealTimers();
    });

    test("event fired on register with error", async () => {
        vi.useFakeTimers();

        const state = new State(0);
        let expectedState = 0;

        const onStateChange = {
            event(state: number) {
                expect(state).toBe(expectedState);

                if (expectedState === 0)
                    throw new Error("Ignore this error " + state);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        state.createChangeListener(onStateChange.event, true);
        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith(0, undefined);

        expectedState = 1;
        state.state = 1;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy).toHaveBeenLastCalledWith(1, 0);

        vi.useRealTimers();
    });

    test("no event fired when value have not changed", async () => {
        vi.useFakeTimers();

        const state = new State(0);

        const onStateChange = {
            event(state: number) {
                expect(state).toBe(1);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        state.createChangeListener(onStateChange.event);
        expect(onStateChangeSpy).not.toHaveBeenCalled();

        state.state = 0;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).not.toHaveBeenCalled();

        vi.useRealTimers();
    });

    test("no event fired when value have not changed before the next queued event", async () => {
        vi.useFakeTimers();

        const state = new State(0);

        const onStateChange = {
            event(state: number) {
                expect(state).toBe(1);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        state.createChangeListener(onStateChange.event);
        expect(onStateChangeSpy).not.toHaveBeenCalled();

        state.state = 1;
        state.state = 0;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).not.toHaveBeenCalled();

        vi.useRealTimers();
    });

    test("event fired immediately when `queueEvents: false`", async () => {
        vi.useFakeTimers();

        const state = new State(0, {queueEvents: false});

        const onStateChange = {
            event(state: number) {
                expect(state).toBe(1);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        const changeEventHandle = state.createChangeListener(onStateChange.event);
        expect(onStateChangeSpy).not.toHaveBeenCalled();

        state.state = 1;

        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith(1, 0);

        expect(state.changeListenerCount).toBe(1);
        changeEventHandle[Symbol.dispose]();
        expect(state.changeListenerCount).toBe(0);

        state.state = 2;

        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith(1, 0);

        vi.useRealTimers();
    });

    test("clearChangeListeners, error throw from event", async () => {
        vi.useFakeTimers();

        const state = new State(0, {queueEvents: false});

        const onStateChange = {
            event(state: number) {
                throw new Error("Ignore this error " + state);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        state.createChangeListener(onStateChange.event);
        expect(onStateChangeSpy).not.toHaveBeenCalled();

        state.state = 1;

        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith(1, 0);

        expect(state.changeListenerCount).toBe(1);
        state.clearChangeListeners();
        expect(state.changeListenerCount).toBe(0);

        state.state = 2;

        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith(1, 0);

        vi.useRealTimers();
    });

    test("combined event listener called properly", async () => {
        vi.useFakeTimers();

        const state1 = new State(0);
        const state2 = new State("hi");
        const state3 = new State(true);

        let currentCombinedValue = [state1.state, state2.state, state3.state];
        let previousCombinedValue: typeof currentCombinedValue | [undefined, undefined, undefined] = [-1, -1, -1];

        const onStateChange = {
            event(
                state: [number, string, boolean],
                previousState: [number, string, boolean] | [undefined, undefined, undefined]
            ) {
                currentCombinedValue = state;
                previousCombinedValue = previousState;
                expect(state).toEqual([1, "hello", false]);
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        const combinedListenerHandle = State.createCombinedChangeListener([state1, state2, state3], (state, previousState) => {
            expectTypeOf(state).toEqualTypeOf<[number, string, boolean]>();
            expectTypeOf(previousState).toEqualTypeOf<[number, string, boolean] | [undefined, undefined, undefined]>();
            onStateChange.event(state, previousState);
        });

        state1.state = 1;
        state2.state = "hello";
        state3.state = false;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith([1, "hello", false], [0, "hi", true]);
        expect(currentCombinedValue).toEqual([1, "hello", false]);
        expect(previousCombinedValue).toEqual([0, "hi", true]);

        combinedListenerHandle.dispose();
        expect(combinedListenerHandle.disposed).toBe(true);

        state1.state = 2;
        state2.state = "hi there";
        state3.state = true;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith([1, "hello", false], [0, "hi", true]);
        expect(currentCombinedValue).toEqual([1, "hello", false]);
        expect(previousCombinedValue).toEqual([0, "hi", true]);

        vi.useRealTimers();
    });

    test("combined event listener with error thrown", async () => {
        vi.useFakeTimers();

        const state1 = new State(0);
        const state2 = new State("hi");
        const state3 = new State(true);

        let currentCombinedValue = [state1.state, state2.state, state3.state];
        let previousCombinedValue: typeof currentCombinedValue | [undefined, undefined, undefined] = [-1, -1, -1];
        let callNumber = 0;

        const onStateChange = {
            event(
                state: [number, string, boolean],
                previousState: [number, string, boolean] | [undefined, undefined, undefined]
            ) {
                if (callNumber++ === 0)
                    throw new Error("Ignore this error " + state);

                currentCombinedValue = state;
                previousCombinedValue = previousState;
            }
        };
        const onStateChangeSpy = vi.spyOn(onStateChange, "event");

        const combinedListenerHandle = State.createCombinedChangeListener([state1, state2, state3], (state, previousState) => {
            expectTypeOf(state).toEqualTypeOf<[number, string, boolean]>();
            expectTypeOf(previousState).toEqualTypeOf<[number, string, boolean] | [undefined, undefined, undefined]>();
            onStateChange.event(state, previousState);
        });

        state1.state = 1;
        state2.state = "hello";
        state3.state = false;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(1);
        expect(onStateChangeSpy).toHaveBeenCalledWith([1, "hello", false], [0, "hi", true]);
        expect(currentCombinedValue).toEqual([0, "hi", true]);
        expect(previousCombinedValue).toEqual([-1, -1, -1]);

        state1.state = 2;
        state2.state = "hi there";
        state3.state = true;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy).toHaveBeenLastCalledWith([2, "hi there", true], [1, "hello", false]);
        expect(currentCombinedValue).toEqual([2, "hi there", true]);
        expect(previousCombinedValue).toEqual([1, "hello", false]);

        combinedListenerHandle.dispose();

        state1.state = 1;
        state2.state = "hello";
        state3.state = false;

        await vi.advanceTimersToNextTimerAsync();
        expect(onStateChangeSpy).toHaveBeenCalledTimes(2);
        expect(onStateChangeSpy).toHaveBeenLastCalledWith([2, "hi there", true], [1, "hello", false]);
        expect(currentCombinedValue).toEqual([2, "hi there", true]);
        expect(previousCombinedValue).toEqual([1, "hello", false]);

        vi.useRealTimers();
    });
});
