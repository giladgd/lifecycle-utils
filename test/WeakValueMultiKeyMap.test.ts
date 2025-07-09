import {describe, expect, test} from "vitest";
import {WeakValueMultiKeyMap} from "../src/WeakValueMultiKeyMap.js";
import {waitForGarbageCollection} from "./utils/gc.js";

describe("WeakValueMultiKeyMap", () => {
    test("sanity", {timeout: 1000 * 60 * 3}, async () => {
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

        expect(map.get(["rootB"]) === obj2).toBe(true);
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
        expect(map.get(["rootC"]) === obj4).toBe(true);
        map.delete(["rootC"]);
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
});
