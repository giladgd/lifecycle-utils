import {describe, expect, test} from "vitest";
import {AsyncDisposeAggregator} from "../src/index.js";

describe("AsyncDisposeAggregator", () => {
    test("events are dispatched", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();

        const stub = new DisposeStub();
        const asyncStub = new AsyncDisposeStub();
        const symbolStub = new DisposeSymbolStub();
        const asyncSymbolStub = new AsyncDisposeSymbolStub();
        const stub2 = new DisposeStub();
        const stub3 = new DisposeStub();
        let functionDisposeCalled = false;

        expect(stub.disposed).toBe(false);
        expect(asyncStub.disposed).toBe(false);
        expect(symbolStub.disposed).toBe(false);
        expect(asyncSymbolStub.disposed).toBe(false);

        disposeAggregator.add(stub);
        disposeAggregator.add(asyncStub);

        expect(disposeAggregator.targetCount).toBe(2);

        disposeAggregator.add(symbolStub);
        disposeAggregator.add(asyncSymbolStub);
        disposeAggregator.add(() => {
            functionDisposeCalled = true;
        });
        disposeAggregator.add(Promise.resolve(stub2));

        expect(disposeAggregator.targetCount).toBe(6);

        await disposeAggregator.dispose();

        expect(stub.disposed).toBe(true);
        expect(asyncStub.disposed).toBe(true);
        expect(symbolStub.disposed).toBe(true);
        expect(asyncSymbolStub.disposed).toBe(true);
        expect(functionDisposeCalled).toBe(true);
        expect(stub2.disposed).toBe(true);
        expect(stub3.disposed).toBe(false);
    });

    test("Symbol.asyncDispose", async () => {
        const disposeAggregator = new AsyncDisposeAggregator();

        const stub = new DisposeStub();
        expect(stub.disposed).toBe(false);

        disposeAggregator.add(stub);
        expect(disposeAggregator.targetCount).toBe(1);

        await disposeAggregator[Symbol.asyncDispose]();
        expect(stub.disposed).toBe(true);
    });
});

class DisposeStub {
    public disposed: boolean = false;

    public dispose() {
        this.disposed = true;
    }
}

class AsyncDisposeStub {
    public disposed: boolean = false;

    public async dispose() {
        await new Promise((resolve) => setTimeout(resolve, 0));
        this.disposed = true;
    }
}

class DisposeSymbolStub {
    public disposed: boolean = false;

    public [Symbol.dispose]() {
        this.disposed = true;
    }
}

class AsyncDisposeSymbolStub {
    public disposed: boolean = false;

    public async [Symbol.asyncDispose]() {
        await new Promise((resolve) => setTimeout(resolve, 0));
        this.disposed = true;
    }
}
