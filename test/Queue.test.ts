import {describe, expect, test} from "vitest";

import {Queue} from "../src/Queue.js";

describe("Queue", () => {
    test("sanity", () => {
        const queue = new Queue<number>();

        expect(queue.length).toBe(0);
        expect(queue.isEmpty).toBe(true);
        expect(queue.first).toBe(undefined);
        expect(queue.last).toBe(undefined);
        expect(queue.shift()).toBe(undefined);

        queue.push(1);
        queue.push(2);
        queue.push(3);

        expect(queue.length).toBe(3);
        expect(queue.isEmpty).toBe(false);
        expect(queue.first).toBe(1);
        expect(queue.last).toBe(3);

        expect(queue.shift()).toBe(1);
        expect(queue.length).toBe(2);
        expect(queue.first).toBe(2);
        expect(queue.last).toBe(3);

        queue.push(4);

        expect(queue.toArray()).to.eql([2, 3, 4]);

        expect(queue.shift()).toBe(2);
        expect(queue.shift()).toBe(3);
        expect(queue.shift()).toBe(4);

        expect(queue.length).toBe(0);
        expect(queue.isEmpty).toBe(true);
        expect(queue.first).toBe(undefined);
        expect(queue.last).toBe(undefined);
        expect(queue.shift()).toBe(undefined);
    });

    test("constructing with initial values works", () => {
        const queue = new Queue<number>([1, 2, 3]);

        expect(queue.length).toBe(3);
        expect(queue.isEmpty).toBe(false);
        expect(queue.first).toBe(1);
        expect(queue.last).toBe(3);
        expect(queue.toArray()).to.eql([1, 2, 3]);
    });

    test("constructing from an iterable works", () => {
        const queue = new Queue<number>(new Set([1, 2, 3]));

        expect(queue.toArray()).to.eql([1, 2, 3]);
    });

    test("constructing from another queue works", () => {
        class QueueWithThrowingIterator<T> extends Queue<T> {
            public override *[Symbol.iterator](): IterableIterator<T> {
                throw new Error("Queue iterator should not be used");
            }
        }

        const queue = new QueueWithThrowingIterator<number>([1, 2, 3, 4]);

        expect(queue.shift()).toBe(1);
        expect(queue.shift()).toBe(2);

        const copy = new Queue(queue);

        expect(copy.toArray()).to.eql([3, 4]);

        queue.push(5);
        copy.push(6);

        expect(queue.toArray()).to.eql([3, 4, 5]);
        expect(copy.toArray()).to.eql([3, 4, 6]);

        expect(queue.shift()).toBe(3);

        expect(queue.toArray()).to.eql([4, 5]);
        expect(copy.toArray()).to.eql([3, 4, 6]);
    });

    test("null and undefined values work", () => {
        const queue = new Queue<number | null | undefined>([
            1,
            null,
            undefined,
            2
        ]);

        expect(queue.shift()).toBe(1);

        expect(queue.length).toBe(3);
        expect(queue.first).toBe(null);
        expect(queue.last).toBe(2);
        expect(queue.indexOf(null)).toBe(0);
        expect(queue.lastIndexOf(null)).toBe(0);
        expect(queue.toArray()).to.eql([null, undefined, 2]);

        expect(queue.shift()).toBe(null);
        expect(queue.length).toBe(2);
        expect(queue.first).toBe(undefined);

        expect(queue.shift()).toBe(undefined);
        expect(queue.length).toBe(1);
        expect(queue.first).toBe(2);

        expect(queue.shift()).toBe(2);
        expect(queue.length).toBe(0);
        expect(queue.isEmpty).toBe(true);
    });

    test("at works", () => {
        const queue = new Queue<number>([10, 20, 30, 40]);

        expect(queue.shift()).toBe(10);

        expect(queue.at(0)).toBe(20);
        expect(queue.at(1)).toBe(30);
        expect(queue.at(2)).toBe(40);
        expect(queue.at(3)).toBe(undefined);
        expect(queue.at(100)).toBe(undefined);

        expect(queue.at(-1)).toBe(40);
        expect(queue.at(-2)).toBe(30);
        expect(queue.at(-3)).toBe(20);
        expect(queue.at(-4)).toBe(undefined);
        expect(queue.at(-100)).toBe(undefined);

        expect(queue.at(1.8)).toBe(30);
        expect(queue.at(-1.8)).toBe(40);
        expect(queue.at(NaN)).toBe(20);
        expect(queue.at(Infinity)).toBe(undefined);
        expect(queue.at(-Infinity)).toBe(undefined);
    });

    test("delete works", () => {
        const queue = new Queue<number>([0, 1, 2, 3, 4, 5]);

        expect(queue.delete(2)).toBe(1);
        expect(queue.toArray()).to.eql([0, 1, 3, 4, 5]);

        expect(queue.delete(-1)).toBe(1);
        expect(queue.toArray()).to.eql([0, 1, 3, 4]);

        expect(queue.delete(0)).toBe(1);
        expect(queue.toArray()).to.eql([1, 3, 4]);

        expect(queue.delete(20)).toBe(0);
        expect(queue.toArray()).to.eql([1, 3, 4]);

        expect(queue.delete(1, 1)).toBe(0);
        expect(queue.delete(2, 1)).toBe(0);
        expect(queue.toArray()).to.eql([1, 3, 4]);
    });

    test("deleting ranges works", () => {
        const queue = new Queue<number>([0, 1, 2, 3, 4, 5, 6, 7]);

        expect(queue.delete(2, 5)).toBe(3);
        expect(queue.toArray()).to.eql([0, 1, 5, 6, 7]);

        expect(queue.delete(1, -1)).toBe(3);
        expect(queue.toArray()).to.eql([0, 7]);

        expect(queue.delete(-1)).toBe(1);
        expect(queue.toArray()).to.eql([0]);

        expect(queue.delete(0, 100)).toBe(1);
        expect(queue.toArray()).to.eql([]);
        expect(queue.isEmpty).toBe(true);
    });

    test("deleting ranges with out of bounds indexes works", () => {
        const queue = new Queue<number>([0, 1, 2, 3, 4]);

        expect(queue.delete(-100, 2)).toBe(2);
        expect(queue.toArray()).to.eql([2, 3, 4]);

        expect(queue.delete(100)).toBe(0);
        expect(queue.toArray()).to.eql([2, 3, 4]);

        expect(queue.delete(1, 100)).toBe(2);
        expect(queue.toArray()).to.eql([2]);

        expect(queue.delete(0, -100)).toBe(0);
        expect(queue.toArray()).to.eql([2]);
    });

    test("delete normalizes indexes", () => {
        const queue1 = new Queue<number>([0, 1, 2, 3]);

        expect(queue1.delete(1.8, 3.8)).toBe(2);
        expect(queue1.toArray()).to.eql([0, 3]);

        const queue2 = new Queue<number>([0, 1, 2]);

        expect(queue2.delete(NaN)).toBe(1);
        expect(queue2.toArray()).to.eql([1, 2]);

        const queue3 = new Queue<number>([0, 1, 2]);

        expect(queue3.delete(Infinity)).toBe(0);
        expect(queue3.toArray()).to.eql([0, 1, 2]);

        const queue4 = new Queue<number>([0, 1, 2]);

        expect(queue4.delete(-Infinity, 1)).toBe(1);
        expect(queue4.toArray()).to.eql([1, 2]);

        const queue5 = new Queue<number>([0, 1, 2]);

        expect(queue5.delete(1, -Infinity)).toBe(0);
        expect(queue5.toArray()).to.eql([0, 1, 2]);

        const queue6 = new Queue<number>([0, 1, 2]);

        expect(queue6.delete(0, Infinity)).toBe(3);
        expect(queue6.toArray()).to.eql([]);
    });

    test("delete with an explicit undefined end deletes one value", () => {
        const queue = new Queue<number>([0, 1, 2]);

        expect(queue.delete(1, undefined)).toBe(1);
        expect(queue.toArray()).to.eql([0, 2]);
    });

    test("deleting from an empty queue works", () => {
        const queue = new Queue<number>();

        expect(queue.delete(0)).toBe(0);
        expect(queue.delete(-1)).toBe(0);
        expect(queue.delete(0, 10)).toBe(0);

        expect(queue.toArray()).to.eql([]);
    });

    test("deleting from a queue with consumed values works", () => {
        const queue = new Queue<number>([0, 1, 2, 3, 4, 5]);

        expect(queue.shift()).toBe(0);
        expect(queue.shift()).toBe(1);

        expect(queue.delete(1, 3)).toBe(2);
        expect(queue.toArray()).to.eql([2, 5]);

        queue.push(6);

        expect(queue.length).toBe(3);
        expect(queue.first).toBe(2);
        expect(queue.last).toBe(6);
        expect(queue.toArray()).to.eql([2, 5, 6]);
    });

    test("deleting all remaining values from a consumed queue works", () => {
        const queue = new Queue<number>([0, 1, 2, 3]);

        expect(queue.shift()).toBe(0);

        expect(queue.delete(0, 100)).toBe(3);

        expect(queue.length).toBe(0);
        expect(queue.isEmpty).toBe(true);
        expect(queue.first).toBe(undefined);
        expect(queue.last).toBe(undefined);
        expect(queue.toArray()).to.eql([]);

        queue.push(4);

        expect(queue.toArray()).to.eql([4]);
    });

    test("indexOf works", () => {
        const queue = new Queue<number | null>([
            0,
            2,
            1,
            2,
            3,
            2,
            null,
            2
        ]);

        expect(queue.shift()).toBe(0);

        expect(queue.indexOf(2)).toBe(0);
        expect(queue.indexOf(2, undefined)).toBe(0);
        expect(queue.indexOf(2, 1)).toBe(2);
        expect(queue.indexOf(2, 3)).toBe(4);
        expect(queue.indexOf(2, -2)).toBe(6);
        expect(queue.indexOf(2, -100)).toBe(0);
        expect(queue.indexOf(2, 7)).toBe(-1);
        expect(queue.indexOf(2, 100)).toBe(-1);

        expect(queue.indexOf(2, NaN)).toBe(0);
        expect(queue.indexOf(2, Infinity)).toBe(-1);
        expect(queue.indexOf(2, -Infinity)).toBe(0);
        expect(queue.indexOf(2, 1.8)).toBe(2);
        expect(queue.indexOf(2, -1.8)).toBe(6);

        expect(queue.indexOf(null)).toBe(5);
        expect(queue.indexOf(10)).toBe(-1);
    });

    test("lastIndexOf works", () => {
        const queue = new Queue<number | null>([
            0,
            2,
            1,
            2,
            3,
            2,
            null,
            2
        ]);

        expect(queue.shift()).toBe(0);

        expect(queue.lastIndexOf(2)).toBe(6);
        expect(queue.lastIndexOf(2, undefined)).toBe(6);
        expect(queue.lastIndexOf(2, 4)).toBe(4);
        expect(queue.lastIndexOf(2, 3)).toBe(2);
        expect(queue.lastIndexOf(2, -2)).toBe(4);
        expect(queue.lastIndexOf(2, -7)).toBe(0);
        expect(queue.lastIndexOf(2, -8)).toBe(-1);
        expect(queue.lastIndexOf(2, -100)).toBe(-1);
        expect(queue.lastIndexOf(2, 100)).toBe(6);

        expect(queue.lastIndexOf(2, NaN)).toBe(0);
        expect(queue.lastIndexOf(2, Infinity)).toBe(6);
        expect(queue.lastIndexOf(2, -Infinity)).toBe(-1);
        expect(queue.lastIndexOf(2, 1.8)).toBe(0);
        expect(queue.lastIndexOf(2, -1.8)).toBe(6);

        expect(queue.lastIndexOf(null)).toBe(5);
        expect(queue.lastIndexOf(10)).toBe(-1);
    });

    test("indexOf and lastIndexOf on an empty queue work", () => {
        const queue = new Queue<number>();

        expect(queue.indexOf(1)).toBe(-1);
        expect(queue.lastIndexOf(1)).toBe(-1);
    });

    test("indexOf and lastIndexOf ignore consumed null tombstones", () => {
        const queue = new Queue<number | null>([1, 2, null, 3]);

        expect(queue.shift()).toBe(1);

        expect(queue.indexOf(null)).toBe(1);
        expect(queue.lastIndexOf(null)).toBe(1);

        expect(queue.delete(1)).toBe(1);

        expect(queue.toArray()).to.eql([2, 3]);
        expect(queue.indexOf(null)).toBe(-1);
        expect(queue.lastIndexOf(null)).toBe(-1);
    });

    test("indexOf and lastIndexOf use strict equality", () => {
        const queue = new Queue<number>([1, NaN, 2, NaN]);

        expect(queue.indexOf(NaN)).toBe(-1);
        expect(queue.lastIndexOf(NaN)).toBe(-1);
    });

    test("values iterator works", () => {
        const queue = new Queue<number>([1, 2, 3, 4]);

        expect(queue.shift()).toBe(1);
        expect(queue.delete(1)).toBe(1);

        expect([...queue.values()]).to.eql([2, 4]);
    });

    test("entries iterator works", () => {
        const queue = new Queue<number>([1, 2, 3, 4]);

        expect(queue.shift()).toBe(1);
        expect(queue.delete(1)).toBe(1);

        expect([...queue.entries()]).to.eql([
            [0, 2],
            [1, 4]
        ]);
    });

    test("default iterator iterates over values", () => {
        const queue = new Queue<number>([1, 2, 3, 4]);

        expect(queue.shift()).toBe(1);

        expect([...queue]).to.eql([2, 3, 4]);
    });

    test("values iterator includes values pushed after iteration starts", () => {
        const queue = new Queue<number>([1, 2, 3]);
        const iterator = queue.values();

        expect(iterator.next()).to.eql({
            value: 1,
            done: false
        });

        queue.push(4);

        expect([...iterator]).to.eql([2, 3, 4]);
    });

    test("entries iterator includes values pushed after iteration starts", () => {
        const queue = new Queue<number>([1, 2, 3]);
        const iterator = queue.entries();

        expect(iterator.next()).to.eql({
            value: [0, 1],
            done: false
        });

        queue.push(4);

        expect([...iterator]).to.eql([
            [1, 2],
            [2, 3],
            [3, 4]
        ]);
    });

    test("iterators reflect deletions after iteration starts", () => {
        const queue = new Queue<number>([1, 2, 3, 4]);
        const iterator = queue.values();

        expect(iterator.next()).to.eql({
            value: 1,
            done: false
        });

        expect(queue.delete(1)).toBe(1);

        expect([...iterator]).to.eql([3, 4]);
    });

    test("toArray returns an independent array", () => {
        const queue = new Queue<number>([1, 2, 3]);

        expect(queue.shift()).toBe(1);

        const values = queue.toArray();

        values[0] = 10;
        values.push(4);

        expect(values).to.eql([10, 3, 4]);
        expect(queue.toArray()).to.eql([2, 3]);
    });

    test("clear works", () => {
        const queue = new Queue<number>([1, 2, 3]);

        expect(queue.shift()).toBe(1);

        queue.clear();

        expect(queue.length).toBe(0);
        expect(queue.isEmpty).toBe(true);
        expect(queue.first).toBe(undefined);
        expect(queue.last).toBe(undefined);
        expect(queue.toArray()).to.eql([]);

        queue.push(4);

        expect(queue.length).toBe(1);
        expect(queue.first).toBe(4);
        expect(queue.last).toBe(4);
        expect(queue.shift()).toBe(4);
    });

    test("queue can be reused after being emptied", () => {
        const queue = new Queue<number>([1, 2, 3]);

        expect(queue.shift()).toBe(1);
        expect(queue.shift()).toBe(2);
        expect(queue.shift()).toBe(3);

        expect(queue.length).toBe(0);
        expect(queue.isEmpty).toBe(true);

        queue.push(4);
        queue.push(5);

        expect(queue.length).toBe(2);
        expect(queue.isEmpty).toBe(false);
        expect(queue.first).toBe(4);
        expect(queue.last).toBe(5);
        expect(queue.toArray()).to.eql([4, 5]);

        expect(queue.shift()).toBe(4);
        expect(queue.shift()).toBe(5);

        expect(queue.length).toBe(0);
        expect(queue.isEmpty).toBe(true);
    });

    test("shift compaction works", () => {
        const queue = new Queue<number>([0, 1, 2, 3, 4, 5], {
            compactAt: 2
        });

        expect(queue.shift()).toBe(0);
        expect(queue.toArray()).to.eql([1, 2, 3, 4, 5]);

        expect(queue.shift()).toBe(1);
        expect(queue.toArray()).to.eql([2, 3, 4, 5]);

        expect(queue.shift()).toBe(2);
        expect(queue.toArray()).to.eql([3, 4, 5]);

        queue.push(6);

        expect(queue.length).toBe(4);
        expect(queue.first).toBe(3);
        expect(queue.last).toBe(6);
        expect(queue.toArray()).to.eql([3, 4, 5, 6]);

        expect(queue.shift()).toBe(3);
        expect(queue.shift()).toBe(4);

        expect(queue.toArray()).to.eql([5, 6]);
    });

    test("delete compaction works", () => {
        const queue = new Queue<number>([0, 1, 2, 3, 4, 5], {
            compactAt: 2
        });

        expect(queue.delete(0, 2)).toBe(2);
        expect(queue.toArray()).to.eql([2, 3, 4, 5]);

        expect(queue.delete(0)).toBe(1);
        expect(queue.toArray()).to.eql([3, 4, 5]);

        queue.push(6);

        expect(queue.length).toBe(4);
        expect(queue.first).toBe(3);
        expect(queue.last).toBe(6);
        expect(queue.toArray()).to.eql([3, 4, 5, 6]);
    });
});
