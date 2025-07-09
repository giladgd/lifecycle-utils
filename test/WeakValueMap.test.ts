import {describe, expect, test} from "vitest";
import {WeakValueMap} from "../src/WeakValueMap.js";
import {waitForGarbageCollection} from "./utils/gc.js";

describe("WeakValueMap", () => {
    test("sanity", {timeout: 1000 * 60 * 3}, async () => {
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
            map.forEach(function (this: null, value, keys, mapArg) {
                expect(this === null).toBe(true);
                expect(mapArg).toBe(map);

                const firstEntry = expectedEntries.shift();
                expect(firstEntry).not.toBe(undefined);
                expect(keys).to.eql(firstEntry![0]);
                expect(value).toBe(firstEntry![1]);
            }, null);
            map.forEach(function (this: typeof map, value, keys, mapArg) {
                expect(this === map).toBe(true);
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

        expect(map.get("rootB") === obj2).toBe(true);
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
        expect(map.get("rootD") === obj4).toBe(true);
        map.delete("rootD");
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
});
