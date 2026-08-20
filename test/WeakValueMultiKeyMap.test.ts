import {describe, expect, test} from "vitest";
import {WeakValueMultiKeyMap} from "../src/index.js";
import {waitForGarbageCollection} from "./utils/gc.js";

describe("WeakValueMultiKeyMap", () => {
    test("sanity", async () => {
        const map = new WeakValueMultiKeyMap<[string, string?], object>();

        let obj1: {} | null = {};
        let obj2: {} | null = {};
        let obj3: {} | null = {};
        const obj4: {} | null = {};

        map.set(["rootA", "num"], obj1);
        map.set(["rootB"], {});
        map.set(["rootB"], obj2);
        map.set(["rootB", "num2"], obj3);
        map.set(["rootC"], obj4);

        {
            const expectedEntries = [
                [["rootA", "num"], obj1],
                [["rootB"], obj2],
                [["rootB", "num2"], obj3],
                [["rootC"], obj4]
            ];
            map.forEach(function (this: null, value, key, mapArg) {
                expect(this).toBe(null);
                expect(mapArg).toBe(map);
                const firstEntry = expectedEntries.shift();
                expect(firstEntry).not.toBe(undefined);
                expect(key).to.eql(firstEntry![0]);
                expect(value).toBe(firstEntry![1]);
            }, null);
            map.forEach(function (this: undefined, _value, _key, mapArg) {
                expect(this).toBe(undefined);
                expect(mapArg).toBe(map);
            });
            expect([...map.keys()]).to.eql([
                ["rootA", "num"],
                ["rootB"],
                ["rootB", "num2"],
                ["rootC"]
            ]);
            expect([...map.values()]).to.eql([
                obj1,
                obj2,
                obj3,
                obj4
            ]);
            expect([...map.entries()]).to.eql([
                [["rootA", "num"], obj1],
                [["rootB"], obj2],
                [["rootB", "num2"], obj3],
                [["rootC"], obj4]
            ]);
        }

        expect(map.size).toBe(4);
        await waitForGarbageCollection(obj1, () => {
            obj1 = null;
        });
        expect(map.size).toBe(3);
        expect(map.has(["rootA", "num"])).toBe(false);

        expect(map.get(["rootB"])).toBe(obj2);
        await waitForGarbageCollection(obj2, () => {
            obj2 = null;
        });
        expect(map.size).toBe(2);
        expect(map.has(["rootB"])).toBe(false);

        expect(map.has(["rootB", "num2"])).toBe(true);
        await waitForGarbageCollection(obj3, () => {
            obj3 = null;
        });
        expect(map.size).toBe(1);
        expect(map.has(["rootB", "num2"])).toBe(false);

        expect(map.has(["rootC"])).toBe(true);
        expect(map.get(["rootC"])).toBe(obj4);
        expect(map.delete(["rootC"])).toBe(true);
        expect(map.delete(["rootC"])).toBe(false);
        expect(map.size).toBe(0);
        expect(map.has(["rootC"])).toBe(false);

        map.set(["rootC"], obj4);
        expect(map.size).toBe(1);
        expect([...map]).to.eql([
            [["rootC"], obj4]
        ]);
        const map2 = new WeakValueMultiKeyMap(map);

        map.clear();
        expect(map.size).toBe(0);
        expect([...map]).to.eql([]);
        expect(map.has(["rootC"])).toBe(false);

        expect(map2.size).toBe(1);
        expect([...map2]).to.eql([
            [["rootC"], obj4]
        ]);
    });

    test("maintains independent finalization registrations and a stable key snapshot", async () => {
        let value: object | null = {};

        const replacementAfterSet = {};
        const replacedMap = new WeakValueMultiKeyMap<[string], object>();
        replacedMap.set(["key"], value);
        replacedMap.set(["key"], replacementAfterSet);

        const duplicateValueMap = new WeakValueMultiKeyMap<[string], object>();
        duplicateValueMap.set(["a"], value);
        duplicateValueMap.set(["b"], value);
        expect(duplicateValueMap.delete(["a"])).toBe(true);

        const replacementAfterDelete = {};
        const deletedMap = new WeakValueMultiKeyMap<[string], object>();
        deletedMap.set(["key"], value);
        expect(deletedMap.delete(["key"])).toBe(true);
        deletedMap.set(["key"], replacementAfterDelete);

        const replacementAfterClear = {};
        const clearedMap = new WeakValueMultiKeyMap<[string], object>();
        clearedMap.set(["key"], value);
        clearedMap.clear();
        clearedMap.set(["key"], replacementAfterClear);

        const key: [string, string] = ["root", "child"];
        const mutatedKeyMap = new WeakValueMultiKeyMap<[string, string], object>();
        mutatedKeyMap.set(key, value);
        key[0] = "changed";
        key[1] = "changed";

        await waitForGarbageCollection(value, () => {
            value = null;
        });

        expect(replacedMap.size).toBe(1);
        expect(replacedMap.get(["key"])).toBe(replacementAfterSet);

        expect(duplicateValueMap.size).toBe(0);
        expect(duplicateValueMap.has(["b"])).toBe(false);

        expect(deletedMap.size).toBe(1);
        expect(deletedMap.get(["key"])).toBe(replacementAfterDelete);

        expect(clearedMap.size).toBe(1);
        expect(clearedMap.get(["key"])).toBe(replacementAfterClear);

        expect(mutatedKeyMap.size).toBe(0);
        expect(mutatedKeyMap.has(["root", "child"])).toBe(false);
    });

    test("keeps the stable key snapshot when replacing through an equivalent key", async () => {
        const map = new WeakValueMultiKeyMap<[string, string], object>();
        const originalKey: [string, string] = ["root", "child"];
        const replacementKey: [string, string] = ["root", "child"];
        let originalValue: object | null = {};
        let replacementValue: object | null = {};

        map.set(originalKey, originalValue);
        originalKey[0] = "changed-original";

        map.set(replacementKey, replacementValue);
        replacementKey[1] = "changed-replacement";

        await waitForGarbageCollection(originalValue, () => {
            originalValue = null;
        });

        expect(map.size).toBe(1);
        expect(map.get(["root", "child"])).toBe(replacementValue);

        await waitForGarbageCollection(replacementValue, () => {
            replacementValue = null;
        });

        expect(map.size).toBe(0);
        expect(map.has(["root", "child"])).toBe(false);
    });
});
