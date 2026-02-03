import {describe, expect, expectTypeOf, test} from "vitest";
import {scopeExit} from "../src/index.js";

describe("ScopeExit", () => {
    describe("called when disposed", () => {
        test("sync", async () => {
            let called = false;
            const handle = scopeExit(() => {
                called = true;
            });

            expect(called).toBe(false);
            handle[Symbol.dispose]();
            expect(called).toBe(true);
        });

        test("async", async () => {
            let called = false;
            const handle = scopeExit(async () => {
                await Promise.resolve();
                called = true;
            });

            expect(called).toBe(false);
            await handle[Symbol.asyncDispose]();
            expect(called).toBe(true);
        });
    });

    describe("called on scope exist", () => {
        test("with using", async () => {
            let called = false;
            {
                using handle = scopeExit(() => {
                    called = true;
                });

                expect(called).toBe(false);
            }
            expect(called).toBe(true);
        });

        describe("with await using", () => {
            test("async", async () => {
                let called = false;
                {
                    await using handle = scopeExit(async () => {
                        await Promise.resolve();
                        called = true;
                    });

                    expect(called).toBe(false);
                }
                expect(called).toBe(true);
            });

            test("sync", async () => {
                let called = false;
                {
                    await using handle = scopeExit(() => {
                        called = true;
                    });

                    expect(called).toBe(false);
                }
                expect(called).toBe(true);
            });
        });
    });

    describe("skip prevents call", () => {
        describe("dispose", () => {
            test("sync", async () => {
                let called = false;
                const handle = scopeExit(() => {
                    called = true;
                });

                expect(called).toBe(false);
                handle.skip();
                handle[Symbol.dispose]();
                expect(called).toBe(false);
            });

            test("async", async () => {
                let called = false;
                const handle = scopeExit(async () => {
                    await Promise.resolve();
                    called = true;
                });

                expect(called).toBe(false);
                handle.skip();
                await handle[Symbol.asyncDispose]();
                expect(called).toBe(false);
            });
        });

        describe("scope exit", () => {
            test("with using", async () => {
                let called = false;
                {
                    using handle = scopeExit(() => {
                        called = true;
                    });

                    expect(called).toBe(false);
                    handle.skip();
                }
                expect(called).toBe(false);
            });

            describe("with await using", () => {
                test("async", async () => {
                    let called = false;
                    {
                        await using handle = scopeExit(async () => {
                            await Promise.resolve();
                            called = true;
                        });

                        expect(called).toBe(false);
                        handle.skip();
                    }
                    expect(called).toBe(false);
                });

                test("async", async () => {
                    let called = false;
                    {
                        await using handle = scopeExit(() => {
                            called = true;
                        });

                        expect(called).toBe(false);
                        handle.skip();
                    }
                    expect(called).toBe(false);
                });
            });
        });
    });

    describe("explicit call", () => {
        describe("dispose", () => {
            test("sync", async () => {
                let calledCount = 0;
                const handle = scopeExit(() => {
                    calledCount++;
                });

                expect(calledCount).toBe(0);
                handle.call();
                expect(calledCount).toBe(1);
                handle[Symbol.dispose]();
                expect(calledCount).toBe(1);
            });

            test("async", async () => {
                let calledCount = 0;
                const handle = scopeExit(async () => {
                    await Promise.resolve();
                    calledCount++;
                });

                expect(calledCount).toBe(0);
                await handle.call();
                expect(calledCount).toBe(1);
                await handle[Symbol.asyncDispose]();
                expect(calledCount).toBe(1);
            });
        });

        describe("scope exit", () => {
            test("with using", async () => {
                let calledCount = 0;
                {
                    using handle = scopeExit(() => {
                        calledCount++;
                    });

                    expect(calledCount).toBe(0);
                    handle.call();
                    expect(calledCount).toBe(1);
                }
                expect(calledCount).toBe(1);
            });

            describe("with await using", () => {
                test("async", async () => {
                    let calledCount = 0;
                    {
                        await using handle = scopeExit(async () => {
                            await Promise.resolve();
                            calledCount++;
                        });

                        expect(calledCount).toBe(0);
                        await handle.call();
                        expect(calledCount).toBe(1);
                    }
                    expect(calledCount).toBe(1);
                });

                test("async", async () => {
                    let calledCount = 0;
                    {
                        await using handle = scopeExit(() => {
                            calledCount++;
                        });

                        expect(calledCount).toBe(0);
                        handle.call();
                        expect(calledCount).toBe(1);
                    }
                    expect(calledCount).toBe(1);
                });
            });
        });
    });

    test("type checks", async () => {
        const handle1 = scopeExit(() => {
            // do nothing
        });
        expectTypeOf(handle1.called).toBeBoolean();
        expectTypeOf(handle1.skipped).toBeBoolean();
        expectTypeOf(handle1.call()).toBeVoid();
        expectTypeOf(handle1.skip()).toBeVoid();
        expectTypeOf(handle1[Symbol.dispose]()).toBeVoid();

        const handle2 = scopeExit(async () => {
            await Promise.resolve();
        });
        expectTypeOf(handle2.called).toBeBoolean();
        expectTypeOf(handle2.skipped).toBeBoolean();
        expectTypeOf(handle2.call()).toEqualTypeOf<Promise<void> | void>();
        expectTypeOf(handle2.skip()).toBeVoid();
        expectTypeOf(handle2[Symbol.asyncDispose]()).toEqualTypeOf<Promise<void>>();
    });
});
