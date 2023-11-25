import {describe, expect, test} from "vitest";
import {DisposeAggregator} from "../src/index.js";

describe("DisposeAggregator", () => {
    test("events are dispatched", () => {
        const disposeAggregator = new DisposeAggregator();

        const stub = new DisposeStub();
        const symbolStub = new DisposeSymbolStub();
        const stub2 = new DisposeStub();
        let functionDisposeCalled = false;

        expect(stub.disposed).toBe(false);
        expect(symbolStub.disposed).toBe(false);

        disposeAggregator.add(stub);

        expect(disposeAggregator.targetCount).toBe(1);

        disposeAggregator.add(symbolStub);
        disposeAggregator.add(() => {
            functionDisposeCalled = true;
        });

        expect(disposeAggregator.targetCount).toBe(3);

        disposeAggregator.dispose();

        expect(stub.disposed).toBe(true);
        expect(symbolStub.disposed).toBe(true);
        expect(functionDisposeCalled).toBe(true);
        expect(stub2.disposed).toBe(false);
    });

    test("WeakRef, Symbol.dispose", () => {
        const disposeAggregator = new DisposeAggregator();

        const stub = new DisposeStub();
        expect(stub.disposed).toBe(false);

        disposeAggregator.add(new WeakRef(stub));
        expect(disposeAggregator.targetCount).toBe(1);

        disposeAggregator[Symbol.dispose]();
        expect(stub.disposed).toBe(true);
    });
});

class DisposeStub {
    public disposed: boolean = false;

    public dispose() {
        this.disposed = true;
    }
}

class DisposeSymbolStub {
    public disposed: boolean = false;

    public [Symbol.dispose]() {
        this.disposed = true;
    }
}
