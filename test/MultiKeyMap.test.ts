import {describe, expect, test} from "vitest";
import {MultiKeyMap} from "../src/MultiKeyMap.js";

describe("MultiKeyMap", () => {
    test("sanity", async () => {
        const map = new MultiKeyMap<[string, string?], number | boolean | null | undefined>();

        map.set(["rootA", "num"], 10);
        map.set(["rootA"], true);
        map.set(["rootA", "null"], null);
        map.set(["rootB", "undefined"], undefined);
        map.set(["rootA", "num"], 4);
        map.set(["rootA", "num2"], 8);

        const map2 = new MultiKeyMap(map);

        expect(map.get(["rootA", "num"])).toBe(4);
        expect(map.get(["rootA"])).toBe(true);
        expect(map.get(["rootA", "null"])).toBe(null);
        expect(map.get(["rootB", "undefined"])).toBe(undefined);
        expect(map.get(["rootA", "num2"])).toBe(8);
        expect([...map.keys()]).to.eql([
            ["rootA", "num"],
            ["rootA"],
            ["rootA", "null"],
            ["rootB", "undefined"],
            ["rootA", "num2"]
        ]);
        expect([...map.values()]).to.eql([
            4,
            true,
            null,
            undefined,
            8
        ]);
        expect([...map.entries()]).to.eql([
            [["rootA", "num"], 4],
            [["rootA"], true],
            [["rootA", "null"], null],
            [["rootB", "undefined"], undefined],
            [["rootA", "num2"], 8]
        ]);
        const expectedEntries = [
            [["rootA", "num"], 4],
            [["rootA"], true],
            [["rootA", "null"], null],
            [["rootB", "undefined"], undefined],
            [["rootA", "num2"], 8]
        ];
        map.forEach(function (this: null, value, keys, mapArg) {
            expect(this === null).toBe(true);
            expect(mapArg).toBe(map);

            const firstEntry = expectedEntries.shift();
            expect(firstEntry).not.toBe(undefined);
            expect(keys).to.eql(firstEntry![0]);
            expect(value).toBe(firstEntry![1]);
        }, null);
        expect(expectedEntries.length).toBe(0);

        map.forEach(function (this: typeof map, value, keys, mapArg) {
            expect(this === map).toBe(true);
            expect(mapArg).toBe(map);
        });

        expect(map.size).toBe(5);
        expect(map.has(["rootB"])).toBe(false);
        expect(map.has(["rootB", "undefined"])).toBe(true);
        expect(map.has(["rootA", "null"])).toBe(true);
        expect(map.has(["rootA", "num2"])).toBe(true);

        map.delete(["rootA", "num"]);
        expect(map.get(["rootA", "num"])).toBe(undefined);
        expect(map.has(["rootA", "num"])).toBe(false);
        expect(map.size).toBe(4);

        map.delete(["rootB"]);
        expect(map.size).toBe(4);

        map.delete(["rootA"]);
        expect(map.size).toBe(3);
        expect(map.has(["rootA"])).toBe(false);
        expect(map.get(["rootA"])).toBe(undefined);

        map.delete(["rootB", "undefined"]);
        expect(map.has(["rootB", "undefined"])).toBe(false);
        expect(map.size).toBe(2);
        expect(map._map.size).toBe(1);

        map.delete(["rootA", "null"]);
        expect(map.size).toBe(1);
        expect(map._map.size).toBe(1);

        map.delete(["rootA", "num2"]);
        expect(map.size).toBe(0);
        expect(map._map.size).toBe(0);

        expect(map2.size).toBe(5);
        map2.clear();
        expect(map2.size).toBe(0);
        expect(map2._map.size).toBe(0);
    });
});
