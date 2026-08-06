import {afterEach, describe, expect, test, vi} from "vitest";
import {registerFinalizer, type RegisterFinalizer} from "../src/index.js";

const gc = (globalThis as typeof globalThis & {gc?: () => void}).gc;

if (gc == null)
    throw new Error("Tests must run with --expose-gc");

async function forceGcUntil(assertion: () => void | Promise<void>): Promise<void> {
    await vi.waitFor(async () => {
        gc!();
        await new Promise<void>((resolve) => setImmediate(resolve));
        await assertion();
    }, {
        interval: 1,
        timeout: 1000
    });
}

describe("registerFinalizer", () => {
    describe("finalizer types", () => {
        test("run a function finalizer", async () => {
            const finalizer = vi.fn();
            const handle = registerFinalizer({}, finalizer);

            expect(handle.finalized).toBe(false);

            await forceGcUntil(() => {
                expect(finalizer).toHaveBeenCalledTimes(1);
                expect(handle.finalized).toBe(true);
            });

            expect(handle.finalized).toBe(true);
        });

        test("run a dispose method finalizer", async () => {
            const dispose = vi.fn();
            const handle = registerFinalizer({}, {dispose});

            await forceGcUntil(() => {
                expect(dispose).toHaveBeenCalledTimes(1);
                expect(handle.finalized).toBe(true);
            });
        });

        test("run a Symbol.dispose finalizer", async () => {
            const dispose = vi.fn();
            const handle = registerFinalizer({}, {[Symbol.dispose]: dispose});

            await forceGcUntil(() => {
                expect(dispose).toHaveBeenCalledTimes(1);
                expect(handle.finalized).toBe(true);
            });
        });

        test("run a Symbol.asyncDispose finalizer", async () => {
            const asyncDispose = vi.fn(async () => undefined);
            const handle = registerFinalizer({}, {[Symbol.asyncDispose]: asyncDispose});

            await forceGcUntil(() => {
                expect(asyncDispose).toHaveBeenCalledTimes(1);
                expect(handle.finalized).toBe(true);
            });
        });

        test("run a promised finalizer", async () => {
            const finalizer = vi.fn();
            const handle = registerFinalizer({}, Promise.resolve(finalizer));

            await forceGcUntil(() => {
                expect(finalizer).toHaveBeenCalledTimes(1);
                expect(handle.finalized).toBe(true);
            });
        });
    });

    describe("finalization state", () => {
        test("remain pending until asynchronous finalization completes", async () => {
            let completeFinalizer!: () => void;

            const blocker = new Promise<void>((resolve) => {
                completeFinalizer = resolve;
            });

            const started = vi.fn();
            const handle = registerFinalizer({}, async () => {
                started();
                await blocker;
            });

            await forceGcUntil(() => {
                expect(started).toHaveBeenCalledTimes(1);
            });

            expect(handle.finalized).toBe(false);

            completeFinalizer();

            await vi.waitFor(() => {
                expect(handle.finalized).toBe(true);
            }, {
                interval: 1,
                timeout: 1000
            });
        });
    });

    describe("cancellation", () => {
        test("cancel finalization using dispose", async () => {
            const finalizer = vi.fn();
            const collectionObserver = vi.fn();

            const [handle, observerHandle] = (() => {
                const target = {};

                return [
                    registerFinalizer(target, finalizer),
                    registerFinalizer(target, collectionObserver)
                ] as const;
            })();

            const dispose = handle.dispose;
            dispose();
            dispose();

            expect(handle.finalized).toBe(true);

            await forceGcUntil(() => {
                expect(collectionObserver).toHaveBeenCalledTimes(1);
                expect(observerHandle.finalized).toBe(true);
            });

            expect(finalizer).not.toHaveBeenCalled();
        });

        test("cancel finalization using Symbol.dispose", async () => {
            const finalizer = vi.fn();
            const collectionObserver = vi.fn();

            const [handle, observerHandle] = (() => {
                const target = {};

                return [
                    registerFinalizer(target, finalizer),
                    registerFinalizer(target, collectionObserver)
                ] as const;
            })();

            const dispose = handle[Symbol.dispose];
            dispose();

            expect(handle.finalized).toBe(true);

            await forceGcUntil(() => {
                expect(collectionObserver).toHaveBeenCalledTimes(1);
                expect(observerHandle.finalized).toBe(true);
            });

            expect(finalizer).not.toHaveBeenCalled();
        });
    });

    describe("error handling", () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        test("log an error thrown by a synchronous finalizer", async () => {
            const error = new Error("Finalizer failed");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

            const handle = registerFinalizer({}, () => {
                throw error;
            });

            await forceGcUntil(() => {
                expect(consoleError).toHaveBeenCalledWith(error);
                expect(handle.finalized).toBe(true);
            });
        });

        test("log an error thrown by an asynchronous finalizer", async () => {
            const error = new Error("Async finalizer failed");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

            const handle = registerFinalizer({}, async () => {
                throw error;
            });

            await forceGcUntil(() => {
                expect(consoleError).toHaveBeenCalledWith(error);
                expect(handle.finalized).toBe(true);
            });
        });

        test("log a rejected promised finalizer", async () => {
            const error = new Error("Finalizer resolution failed");
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
            const finalizer = Promise.reject<never>(error);

            // prevent Vitest from reporting it before finalization consumes it
            void finalizer.catch(() => undefined);

            const handle = registerFinalizer({}, finalizer);

            await forceGcUntil(() => {
                expect(consoleError).toHaveBeenCalledWith(error);
                expect(handle.finalized).toBe(true);
            });
        });
    });

    describe("invalid runtime values", () => {
        test("ignore an undefined finalizer", async () => {
            const handle = registerFinalizer({},
                undefined as unknown as RegisterFinalizer
            );

            expect(handle.finalized).toBe(false);

            await forceGcUntil(() => {
                expect(handle.finalized).toBe(true);
            });
        });
    });
});
