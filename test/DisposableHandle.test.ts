import {describe, expect, test} from "vitest";
import {DisposableHandle} from "../src/index.js";

describe("DisposableHandle", () => {
    test("disposing only happens once", () => {
        let disposeTimes = 0;
        const handle = new DisposableHandle(() => {
            disposeTimes++;
        });

        expect(disposeTimes).toBe(0);
        expect(handle.disposed).toBe(false);

        handle.dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);

        handle.dispose();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);
    });

    test("Symbol.dispose works", () => {
        let disposeTimes = 0;
        const handle = new DisposableHandle(() => {
            disposeTimes++;
        });

        expect(disposeTimes).toBe(0);
        expect(handle.disposed).toBe(false);

        handle[Symbol.dispose]();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);

        handle[Symbol.dispose]();
        expect(disposeTimes).toBe(1);
        expect(handle.disposed).toBe(true);
    });

    test("Storing dispose function in a variable", () => {
        let disposeTimes = 0;
        const handle = new DisposableHandle(() => {
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
