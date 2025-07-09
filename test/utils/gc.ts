// inspired by https://github.com/jestjs/jest/blob/fd3d6cf9fe416b549a74b6577e5e1ea1130e3659/packages/jest-leak-detector/src/index.ts

import {getHeapSnapshot, setFlagsFromString} from "v8";
import {runInNewContext} from "vm";

const trackers = new Set<FinalizationRegistry<any>>();

export function waitForGarbageCollection<T extends object>(value: T, afterTrackCallback: () => any): Promise<any> {
    const [tracker, promise] = createFinalizationRegistryAndPromise();
    tracker.register(value, undefined);

    afterTrackCallback();

    return Promise.all([
        runGarbageCollector(tracker),
        promise
    ]);
}

function createFinalizationRegistryAndPromise(): [FinalizationRegistry<void>, Promise<void>] {
    let tracker: FinalizationRegistry<void>;
    const promise = new Promise<void>((accept) => {
        tracker = new FinalizationRegistry(() => {
            trackers.delete(tracker);
            accept();
        });
        trackers.add(tracker); // keep a reference to the tracker to keep it functional
    });

    return [tracker!, promise];
}

async function runGarbageCollector(tracker: FinalizationRegistry<void>) {
    const isGarbageCollectorHidden = globalThis.gc == null;

    setFlagsFromString("--expose-gc");
    runInNewContext("gc")();

    if (isGarbageCollectorHidden)
        setFlagsFromString("--no-expose-gc");

    for (let i = 0; i < 10; i++)
        await new Promise((accept) => setImmediate(accept));

    if (trackers.has(tracker)) {
        getHeapSnapshot();

        for (let i = 0; i < 10; i++)
            await new Promise((accept) => setImmediate(accept));
    }
}

