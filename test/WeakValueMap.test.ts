import {describe, expect, test} from "vitest";
import {WeakValueMap} from "../src/index.js";
import {waitForGarbageCollection} from "./utils/gc.js";

describe("WeakValueMap", () => {
    test("sanity", async () => {
        const map = new WeakValueMap<string, object>();

        let obj1: {} | null = {};
        let obj2: {} | null = {};
        let obj3: {} | null = {};
        const obj4: {} | null = {};

        map.set("rootA", obj1);
        map.set("rootB", {});
        map.set("rootB", obj2);
        map.set("rootC", obj3);
        map.set("rootD", obj4);

        {
            const expectedEntries = [
                ["rootA", obj1],
                ["rootB", obj2],
                ["rootC", obj3],
                ["rootD", obj4]
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
                "rootA",
                "rootB",
                "rootC",
                "rootD"
            ]);
            expect([...map.values()]).to.eql([
                obj1,
                obj2,
                obj3,
                obj4
            ]);
            expect([...map.entries()]).to.eql([
                ["rootA", obj1],
                ["rootB", obj2],
                ["rootC", obj3],
                ["rootD", obj4]
            ]);
        }

        expect(map.size).toBe(4);
        await waitForGarbageCollection(obj1, () => {
            obj1 = null;
        });
        expect(map.size).toBe(3);
        expect(map.has("rootA")).toBe(false);

        expect(map.get("rootB")).toBe(obj2);
        await waitForGarbageCollection(obj2, () => {
            obj2 = null;
        });
        expect(map.size).toBe(2);
        expect(map.has("rootB")).toBe(false);

        expect(map.has("rootC")).toBe(true);
        await waitForGarbageCollection(obj3, () => {
            obj3 = null;
        });
        expect(map.size).toBe(1);
        expect(map.has("rootC")).toBe(false);

        expect(map.has("rootD")).toBe(true);
        expect(map.get("rootD")).toBe(obj4);
        expect(map.delete("rootD")).toBe(true);
        expect(map.delete("rootD")).toBe(false);
        expect(map.size).toBe(0);
        expect(map.has("rootD")).toBe(false);

        map.set("rootD", obj4);
        expect(map.size).toBe(1);
        expect([...map]).to.eql([
            ["rootD", obj4]
        ]);
        const map2 = new WeakValueMap(map);

        map.clear();
        expect(map.size).toBe(0);
        expect([...map]).to.eql([]);
        expect(map.has("rootD")).toBe(false);

        expect(map2.size).toBe(1);
        expect([...map2]).to.eql([
            ["rootD", obj4]
        ]);
    });

    test("allows the same object to be used as both the key and value", () => {
        const map = new WeakValueMap<object, object>();
        const value = {};

        expect(() => map.set(value, value)).not.toThrow();
        expect(map.get(value)).toBe(value);
    });

    test("maintains independent finalization registrations", async () => {
        let value: object | null = {};

        const replacementAfterSet = {};
        const replacedMap = new WeakValueMap<string, object>();
        replacedMap.set("key", value);
        replacedMap.set("key", replacementAfterSet);

        const duplicateValueMap = new WeakValueMap<string, object>();
        duplicateValueMap.set("a", value);
        duplicateValueMap.set("b", value);
        expect(duplicateValueMap.delete("a")).toBe(true);

        const replacementAfterDelete = {};
        const deletedMap = new WeakValueMap<string, object>();
        deletedMap.set("key", value);
        expect(deletedMap.delete("key")).toBe(true);
        deletedMap.set("key", replacementAfterDelete);

        const replacementAfterClear = {};
        const clearedMap = new WeakValueMap<string, object>();
        clearedMap.set("key", value);
        clearedMap.clear();
        clearedMap.set("key", replacementAfterClear);

        await waitForGarbageCollection(value, () => {
            value = null;
        });

        expect(replacedMap.size).toBe(1);
        expect(replacedMap.get("key")).toBe(replacementAfterSet);

        expect(duplicateValueMap.size).toBe(0);
        expect(duplicateValueMap.has("b")).toBe(false);

        expect(deletedMap.size).toBe(1);
        expect(deletedMap.get("key")).toBe(replacementAfterDelete);

        expect(clearedMap.size).toBe(1);
        expect(clearedMap.get("key")).toBe(replacementAfterClear);
    });
});
