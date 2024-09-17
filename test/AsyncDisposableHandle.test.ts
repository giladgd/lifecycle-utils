import {describe, expect, test} from "vitest";
import {AsyncDisposableHandle} from "../src/index.js";

describe("AsyncDisposableHandle", () => {
    test("disposing only happens once", async () => {
        let disposeTimes = 0;
        const handle = new AsyncDisposableHandle(async () => {
            disposeTimes++;
        });

        expect(disposeTimes).toBe(0);
        expect(handle.disposed).toBe(false);

        await handle.dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);

        await handle.dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);
    });

    test("marked as disposed before the callback finishes", async () => {
        let disposeTimes = 0;
        const handle = new AsyncDisposableHandle(async () => {
            disposeTimes++;
        });

        expect(disposeTimes).toBe(0);
        expect(handle.disposed).toBe(false);

        void handle.dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);

        void handle.dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);
    });

    test("Symbol.dispose works", async () => {
        let disposeTimes = 0;
        const handle = new AsyncDisposableHandle(async () => {
            disposeTimes++;
        });

        expect(disposeTimes).toBe(0);
        expect(handle.disposed).toBe(false);

        await handle[Symbol.asyncDispose]();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);

        await handle[Symbol.asyncDispose]();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);
    });

    test("Storing dispose function in a variable", () => {
        let disposeTimes = 0;
        const handle = new AsyncDisposableHandle(async () => {
            disposeTimes++;
        });

        expect(disposeTimes).toBe(0);
        expect(handle.disposed).toBe(false);

        const dispose = handle.dispose;
        dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);

        dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);
    });
});
