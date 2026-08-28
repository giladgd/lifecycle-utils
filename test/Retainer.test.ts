import {describe, expect, expectTypeOf, test, vi} from "vitest";

import {Retainer, RetainerDrainHandle, RetainerHandle} from "../src/index.js";

describe("Retainer", () => {
    describe("basic behavior", () => {
        test("retain handles keep the retainer retained until each handle is disposed", async () => {
            const retainer = new Retainer();
            const handle1 = retainer.tryRetain();
            const handle2 = retainer.tryRetain();

            expect(handle1).toBeInstanceOf(RetainerHandle);
            expect(handle2).toBeInstanceOf(RetainerHandle);
            expect(retainer.activeRetains).toBe(2);
            expect(handle1!.disposed).toBe(false);
            expect(handle2!.disposed).toBe(false);
            expect(retainer.isDraining).toBe(false);

            let drainAcquired = false;
            const drainPromise = retainer.acquireDrain().then((drain) => {
                drainAcquired = true;
                return drain;
            });

            expect(retainer.isDraining).toBe(true);

            handle1!.dispose();
            await Promise.resolve();

            expect(handle1!.disposed).toBe(true);
            expect(handle2!.disposed).toBe(false);
            expect(drainAcquired).toBe(false);

            handle2!.dispose();

            const drain = await drainPromise;
            expect(handle2!.disposed).toBe(true);
            expect(drainAcquired).toBe(true);

            drain.dispose();
            expect(retainer.isDraining).toBe(false);
        });

        test("a drain waits for existing retains and blocks new retains immediately", async () => {
            const retainer = new Retainer();
            const handle = retainer.tryRetain()!;
            let drainAcquired = false;

            const drainPromise = retainer.acquireDrain().then((drain) => {
                drainAcquired = true;
                return drain;
            });

            expect(drainPromise.constructor).toBe(Promise);
            expect(retainer.isDraining).toBe(true);
            expect(drainAcquired).toBe(false);
            expect(retainer.tryRetain()).toBeUndefined();

            await Promise.resolve();
            expect(drainAcquired).toBe(false);

            handle.dispose();

            const drain = await drainPromise;
            expect(drain).toBeInstanceOf(RetainerDrainHandle);
            expect(drain.disposed).toBe(false);
            expect(drainAcquired).toBe(true);
            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            drain.dispose();

            expect(drain.disposed).toBe(true);
            expect(retainer.isDraining).toBe(false);

            const nextHandle = retainer.tryRetain();
            expect(nextHandle).toBeInstanceOf(RetainerHandle);
            nextHandle!.dispose();
        });

        test("a drain is acquired immediately when there are no active retains", async () => {
            const retainer = new Retainer();

            const drainPromise = retainer.acquireDrain();

            expect(drainPromise.constructor).toBe(Promise);
            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            const drain = await drainPromise;
            expect(drain).toBeInstanceOf(RetainerDrainHandle);
            expect(drain.disposed).toBe(false);

            drain.dispose();
            expect(retainer.isDraining).toBe(false);
        });

        test("multiple drain handles keep the retainer drained until the last handle is disposed", async () => {
            const retainer = new Retainer();

            const drain1 = await retainer.acquireDrain();
            const drain2 = await retainer.acquireDrain();
            const drain3 = await retainer.acquireDrain();

            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            drain2.dispose();
            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            drain1.dispose();
            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            drain3.dispose();
            expect(retainer.isDraining).toBe(false);

            const handle = retainer.tryRetain();
            expect(handle).toBeInstanceOf(RetainerHandle);
            handle!.dispose();
        });

        test("multiple pending drains are acquired together after the last retain is released", async () => {
            const retainer = new Retainer();
            const handle1 = retainer.tryRetain()!;
            const handle2 = retainer.tryRetain()!;

            let acquiredDrains = 0;
            const drainPromise1 = retainer.acquireDrain().then((drain) => {
                acquiredDrains++;
                return drain;
            });
            const drainPromise2 = retainer.acquireDrain().then((drain) => {
                acquiredDrains++;
                return drain;
            });

            expect(retainer.isDraining).toBe(true);
            expect(acquiredDrains).toBe(0);

            handle1.dispose();
            await Promise.resolve();
            expect(acquiredDrains).toBe(0);

            handle2.dispose();

            const [drain1, drain2] = await Promise.all([drainPromise1, drainPromise2]);
            expect(acquiredDrains).toBe(2);
            expect(retainer.isDraining).toBe(true);

            drain1.dispose();
            expect(retainer.isDraining).toBe(true);
            drain2.dispose();
            expect(retainer.isDraining).toBe(false);
        });
    });

    describe("draining state", () => {
        test("isDraining reflects pending and active drains", async () => {
            const retainer = new Retainer();

            expect(retainer.isDraining).toBe(false);

            const handle = retainer.tryRetain()!;
            expect(retainer.isDraining).toBe(false);

            const drainPromise = retainer.acquireDrain();
            expect(retainer.isDraining).toBe(true);

            handle.dispose();
            const drain = await drainPromise;
            expect(retainer.isDraining).toBe(true);

            drain.dispose();
            expect(retainer.isDraining).toBe(false);
        });

        test("isDraining remains true until all drain handles are disposed", async () => {
            const retainer = new Retainer();
            const drain1 = await retainer.acquireDrain();
            const drain2 = await retainer.acquireDrain();

            expect(retainer.isDraining).toBe(true);

            drain1.dispose();
            expect(retainer.isDraining).toBe(true);

            drain2.dispose();
            expect(retainer.isDraining).toBe(false);
        });

        test("isDraining returns to false when the only pending drain is aborted", async () => {
            const retainer = new Retainer();
            const controller = new AbortController();
            const error = new TestError("abort");
            const handle = retainer.tryRetain()!;
            const drainPromise = retainer.acquireDrain(controller.signal);

            expect(retainer.isDraining).toBe(true);

            controller.abort(error);
            await expect(drainPromise).rejects.toBe(error);

            expect(retainer.isDraining).toBe(false);

            handle.dispose();
        });
    });

    describe("errors and overloads", () => {
        test("tryRetain returns undefined while draining when no error is provided", async () => {
            const retainer = new Retainer();
            const drain = await retainer.acquireDrain();

            const handle = retainer.tryRetain();
            expectTypeOf(handle).toEqualTypeOf<RetainerHandle | undefined>();
            expect(handle).toBeUndefined();

            drain.dispose();
        });

        test("tryRetain throws the provided error while draining", async () => {
            const retainer = new Retainer();
            const error = new TestError("draining");
            const drain = await retainer.acquireDrain();

            expect(() => retainer.tryRetain(error)).toThrow(error);

            drain.dispose();
        });

        test("tryRetain only calls an error factory when retaining fails", async () => {
            const retainer = new Retainer();
            const error = new TestError("draining");
            const createError = vi.fn(() => error);

            const handle = retainer.tryRetain(createError);
            expectTypeOf(handle).toEqualTypeOf<RetainerHandle>();
            expect(createError).not.toHaveBeenCalled();

            handle.dispose();

            const drain = await retainer.acquireDrain();

            expect(() => retainer.tryRetain(createError)).toThrow(error);
            expect(createError).toHaveBeenCalledOnce();

            drain.dispose();
        });
    });

    describe("cancellation", () => {
        test("an already aborted signal rejects without starting a drain", async () => {
            const retainer = new Retainer();
            const controller = new AbortController();
            const error = new TestError("already aborted");
            const handle = retainer.tryRetain()!;
            controller.abort(error);

            const drainPromise = retainer.acquireDrain(controller.signal);

            expect(drainPromise.constructor).toBe(Promise);
            await expect(drainPromise).rejects.toBe(error);
            expect(retainer.isDraining).toBe(false);

            const secondHandle = retainer.tryRetain();
            expect(secondHandle).toBeInstanceOf(RetainerHandle);

            handle.dispose();
            secondHandle!.dispose();
        });

        test("aborting the only pending drain allows new retains while existing retains remain active", async () => {
            const retainer = new Retainer();
            const controller = new AbortController();
            const error = new TestError("abort");
            const handle1 = retainer.tryRetain()!;
            const drainPromise = retainer.acquireDrain(controller.signal);

            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            controller.abort(error);

            await expect(drainPromise).rejects.toBe(error);
            expect(retainer.isDraining).toBe(false);

            const handle2 = retainer.tryRetain();
            expect(handle2).toBeInstanceOf(RetainerHandle);

            handle1.dispose();
            handle2!.dispose();
        });

        test("aborting one pending drain keeps other pending drains active", async () => {
            const retainer = new Retainer();
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const error = new TestError("abort");
            const handle = retainer.tryRetain()!;
            const drainPromise1 = retainer.acquireDrain(controller1.signal);
            const drainPromise2 = retainer.acquireDrain(controller2.signal);

            controller1.abort(error);

            await expect(drainPromise1).rejects.toBe(error);
            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            handle.dispose();

            const drain2 = await drainPromise2;
            expect(retainer.isDraining).toBe(true);
            drain2.dispose();
            expect(retainer.isDraining).toBe(false);
        });

        test("aborting every pending drain reopens the retainer", async () => {
            const retainer = new Retainer();
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const error1 = new TestError("abort 1");
            const error2 = new TestError("abort 2");
            const handle = retainer.tryRetain()!;
            const drainPromise1 = retainer.acquireDrain(controller1.signal);
            const drainPromise2 = retainer.acquireDrain(controller2.signal);

            controller1.abort(error1);
            await expect(drainPromise1).rejects.toBe(error1);
            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            controller2.abort(error2);
            await expect(drainPromise2).rejects.toBe(error2);
            expect(retainer.isDraining).toBe(false);

            const secondHandle = retainer.tryRetain();
            expect(secondHandle).toBeInstanceOf(RetainerHandle);

            handle.dispose();
            secondHandle!.dispose();
        });

        test("aborting a signal after its pending drain is acquired does not affect the drain handle", async () => {
            const retainer = new Retainer();
            const controller = new AbortController();
            const handle = retainer.tryRetain()!;
            const drainPromise = retainer.acquireDrain(controller.signal);

            handle.dispose();
            const drain = await drainPromise;

            controller.abort(new TestError("ignored"));
            await Promise.resolve();

            expect(drain.disposed).toBe(false);
            expect(retainer.isDraining).toBe(true);
            expect(retainer.tryRetain()).toBeUndefined();

            drain.dispose();
            expect(retainer.isDraining).toBe(false);
        });

        test("aborting a signal after an immediate drain is acquired does not affect the drain handle", async () => {
            const retainer = new Retainer();
            const controller = new AbortController();
            const drain = await retainer.acquireDrain(controller.signal);

            controller.abort(new TestError("ignored"));
            await Promise.resolve();

            expect(drain.disposed).toBe(false);
            expect(retainer.isDraining).toBe(true);

            drain.dispose();
            expect(retainer.isDraining).toBe(false);
        });
    });

    describe("handles", () => {
        test("retain handle disposal is idempotent", async () => {
            const retainer = new Retainer();
            const handle = retainer.tryRetain()!;

            expect(handle.disposed).toBe(false);

            handle.dispose();
            expect(handle.disposed).toBe(true);

            handle.dispose();
            expect(handle.disposed).toBe(true);

            const drain = await retainer.acquireDrain();
            expect(drain).toBeInstanceOf(RetainerDrainHandle);
            drain.dispose();
        });

        test("retain handle Symbol.dispose works", async () => {
            const retainer = new Retainer();
            const handle = retainer.tryRetain()!;

            handle[Symbol.dispose]();

            expect(handle.disposed).toBe(true);

            handle[Symbol.dispose]();

            const drain = await retainer.acquireDrain();
            expect(drain).toBeInstanceOf(RetainerDrainHandle);
            drain.dispose();
        });

        test("retain handle dispose remains bound when detached from the handle", async () => {
            const retainer = new Retainer();
            const handle = retainer.tryRetain()!;
            const dispose = handle.dispose;

            dispose();

            expect(handle.disposed).toBe(true);

            const drain = await retainer.acquireDrain();
            expect(drain).toBeInstanceOf(RetainerDrainHandle);
            drain.dispose();
        });

        test("drain handle disposal is idempotent", async () => {
            const retainer = new Retainer();
            const drain = await retainer.acquireDrain();

            expect(drain.disposed).toBe(false);
            expect(retainer.isDraining).toBe(true);

            drain.dispose();
            expect(drain.disposed).toBe(true);
            expect(retainer.isDraining).toBe(false);

            drain.dispose();
            expect(drain.disposed).toBe(true);
            expect(retainer.isDraining).toBe(false);

            const handle = retainer.tryRetain();
            expect(handle).toBeInstanceOf(RetainerHandle);
            handle!.dispose();
        });

        test("drain handle Symbol.dispose works", async () => {
            const retainer = new Retainer();
            const drain = await retainer.acquireDrain();

            drain[Symbol.dispose]();

            expect(drain.disposed).toBe(true);
            expect(retainer.isDraining).toBe(false);

            drain[Symbol.dispose]();
            expect(retainer.isDraining).toBe(false);
        });

        test("drain handle dispose remains bound when detached from the handle", async () => {
            const retainer = new Retainer();
            const drain = await retainer.acquireDrain();
            const dispose = drain.dispose;

            dispose();

            expect(drain.disposed).toBe(true);
            expect(retainer.isDraining).toBe(false);
        });
    });

    describe("bound methods", () => {
        test("public methods remain bound when detached from the retainer", async () => {
            const retainer = new Retainer();
            const tryRetain = retainer.tryRetain;
            const acquireDrain = retainer.acquireDrain;

            const handle = tryRetain();
            expect(handle).toBeInstanceOf(RetainerHandle);
            handle!.dispose();

            const drain = await acquireDrain();
            expect(drain).toBeInstanceOf(RetainerDrainHandle);
            drain.dispose();
        });
    });
});

class TestError extends Error {}
