import {afterEach, describe, expect, test, vi} from "vitest";
import {registerFinalizer, type RegisterFinalizer} from "../src/index.js";
import {waitForGarbageCollection} from "./utils/gc.js";

describe("registerFinalizer", () => {
    describe("finalizer types", () => {
        test("run a function finalizer", async () => {
            let target: object | null = {};
            const finalizer = vi.fn();
            const handle = registerFinalizer(target, finalizer);

            expect(handle.finalized).toBe(false);

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(finalizer).toHaveBeenCalledTimes(1);
            expect(handle.finalized).toBe(true);
        });

        test("run a dispose method finalizer", async () => {
            let target: object | null = {};
            const dispose = vi.fn();
            const handle = registerFinalizer(target, {dispose});

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(dispose).toHaveBeenCalledTimes(1);
            expect(handle.finalized).toBe(true);
        });

        test("run a Symbol.dispose finalizer", async () => {
            let target: object | null = {};
            const dispose = vi.fn();
            const handle = registerFinalizer(target, {[Symbol.dispose]: dispose});

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(dispose).toHaveBeenCalledTimes(1);
            expect(handle.finalized).toBe(true);
        });

        test("run a Symbol.asyncDispose finalizer", async () => {
            let target: object | null = {};
            const asyncDispose = vi.fn(async () => undefined);
            const handle = registerFinalizer(target, {[Symbol.asyncDispose]: asyncDispose});

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(asyncDispose).toHaveBeenCalledTimes(1);
            expect(handle.finalized).toBe(true);
        });

        test("run a promised finalizer", async () => {
            let target: object | null = {};
            const finalizer = vi.fn();
            const handle = registerFinalizer(target, Promise.resolve(finalizer));

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(finalizer).toHaveBeenCalledTimes(1);
            expect(handle.finalized).toBe(true);
        });
    });

    describe("finalization state", () => {
        test("remain pending until asynchronous finalization completes", async () => {
            let target: object | null = {};
            let completeFinalizer!: () => void;
            let signalFinalizerStarted!: () => void;

            const blocker = new Promise<void>((resolve) => {
                completeFinalizer = resolve;
            });
            const finalizerStarted = new Promise<void>((resolve) => {
                signalFinalizerStarted = resolve;
            });

            const started = vi.fn();
            const handle = registerFinalizer(target, async () => {
                started();
                signalFinalizerStarted();
                await blocker;
            });
            const collection = waitForGarbageCollection(target, () => {
                target = null;
            });

            await finalizerStarted;

            expect(started).toHaveBeenCalledTimes(1);
            expect(handle.finalized).toBe(false);

            completeFinalizer();
            await collection;

            expect(handle.finalized).toBe(true);
        });
    });

    describe("cancellation", () => {
        test("cancel finalization using dispose", async () => {
            let target: object | null = {};
            const finalizer = vi.fn();
            const collectionObserver = vi.fn();
            const handle = registerFinalizer(target, finalizer);
            const observerHandle = registerFinalizer(target, collectionObserver);
            const dispose = handle.dispose;
            dispose();
            dispose();

            expect(handle.finalized).toBe(true);

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(collectionObserver).toHaveBeenCalledTimes(1);
            expect(observerHandle.finalized).toBe(true);
            expect(finalizer).not.toHaveBeenCalled();
        });

        test("cancel finalization using Symbol.dispose", async () => {
            let target: object | null = {};
            const finalizer = vi.fn();
            const collectionObserver = vi.fn();
            const handle = registerFinalizer(target, finalizer);
            const observerHandle = registerFinalizer(target, collectionObserver);

            const dispose = handle[Symbol.dispose];
            dispose();

            expect(handle.finalized).toBe(true);

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(collectionObserver).toHaveBeenCalledTimes(1);
            expect(observerHandle.finalized).toBe(true);
            expect(finalizer).not.toHaveBeenCalled();
        });
    });

    describe("error handling", () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        test("log an error thrown by a synchronous finalizer", async () => {
            let target: object | null = {};
            const error = new Error("Finalizer failed");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

            const handle = registerFinalizer(target, () => {
                throw error;
            });
            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(consoleError).toHaveBeenCalledWith(error);
            expect(handle.finalized).toBe(true);
        });

        test("log an error thrown by an asynchronous finalizer", async () => {
            let target: object | null = {};
            const error = new Error("Async finalizer failed");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
            const handle = registerFinalizer(target, async () => {
                throw error;
            });

            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(consoleError).toHaveBeenCalledWith(error);
            expect(handle.finalized).toBe(true);
        });

        test("log a rejected promised finalizer", async () => {
            let target: object | null = {};
            const error = new Error("Finalizer resolution failed");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
            const finalizer = Promise.reject<never>(error);

            // prevent Vitest from reporting it before finalization consumes it
            void finalizer.catch(() => undefined);

            const handle = registerFinalizer(target, finalizer);
            await waitForGarbageCollection(target, () => {
                target = null;
            });

            expect(consoleError).toHaveBeenCalledWith(error);
            expect(handle.finalized).toBe(true);
        });
    });

    describe("invalid runtime values", () => {
        test("ignore an undefined finalizer", async () => {
            let target: object | null = {};
            const handle = registerFinalizer(target,
                undefined as unknown as RegisterFinalizer
            );

            expect(handle.finalized).toBe(false);
            await waitForGarbageCollection(target, () => {
                target = null;
            });
            expect(handle.finalized).toBe(true);
        });
    });
});
