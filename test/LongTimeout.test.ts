import {describe, expect, test, vi} from "vitest";
import {clearLongTimeout, LongTimeout, setLongTimeout} from "../src/index.js";

describe("LongTimeout", () => {
    test("long timeout works", async () => {
        vi.useFakeTimers();

        const month = 1000 * 60 * 60 * 24 * 7 * 30;
        const week = 1000 * 60 * 60 * 24 * 7;

        let longTimeoutCalled = false;
        const longTimeout = new LongTimeout(() => {
            longTimeoutCalled = true;
        }, month);

        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        vi.advanceTimersByTime(week);
        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        vi.advanceTimersByTime(week);
        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        vi.advanceTimersByTime(month - 2 * week);
        expect(longTimeoutCalled).toBe(true);
        expect(longTimeout.disposed).toBe(true);

        vi.useRealTimers();
    });

    test("disposing a timeout works", async () => {
        vi.useFakeTimers();

        const month = 1000 * 60 * 60 * 24 * 7 * 30;

        let longTimeoutCalled = false;
        const longTimeout = new LongTimeout(() => {
            longTimeoutCalled = true;
        }, month);

        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        longTimeout[Symbol.dispose]();
        expect(longTimeout.disposed).toBe(true);

        vi.advanceTimersByTime(month);
        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(true);

        vi.useRealTimers();
    });

    test("setLongTimeout", async () => {
        vi.useFakeTimers();

        const month = 1000 * 60 * 60 * 24 * 7 * 30;
        const week = 1000 * 60 * 60 * 24 * 7;

        let longTimeoutCalled = false;
        const longTimeout = setLongTimeout(() => {
            longTimeoutCalled = true;
        }, month);

        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        vi.advanceTimersByTime(week);
        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        vi.advanceTimersByTime(week);
        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        vi.advanceTimersByTime(month - 2 * week);
        expect(longTimeoutCalled).toBe(true);
        expect(longTimeout.disposed).toBe(true);

        vi.useRealTimers();
    });

    test("clearLongTimeout", async () => {
        vi.useFakeTimers();

        const month = 1000 * 60 * 60 * 24 * 7 * 30;

        let longTimeoutCalled = false;
        const longTimeout = setLongTimeout(() => {
            longTimeoutCalled = true;
        }, month);

        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(false);

        clearLongTimeout(longTimeout);
        expect(longTimeout.disposed).toBe(true);

        vi.advanceTimersByTime(month);
        expect(longTimeoutCalled).toBe(false);
        expect(longTimeout.disposed).toBe(true);

        vi.useRealTimers();
    });

    test("clearLongTimeout of regular timeout", async () => {
        vi.useFakeTimers();

        const month = 1000 * 60 * 60 * 24 * 7 * 30;
        const minute = 1000 * 60;

        let timeoutCalled = false;
        const regularTimeoutHandle = setTimeout(() => {
            timeoutCalled = true;
        }, minute);

        expect(timeoutCalled).toBe(false);

        clearLongTimeout(regularTimeoutHandle);

        vi.advanceTimersByTime(month);
        expect(timeoutCalled).toBe(false);

        vi.useRealTimers();
    });
});
