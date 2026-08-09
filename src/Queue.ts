export type QueueOptions = {
    /**
     * Minimum number of consumed entries before the internal array can be compacted.
     *
     * Compaction only occurs when at least half of the backing array has been consumed.
     *
     * Defaults to `4096`.
     */
    compactAt?: number
};

/**
 * An efficient queue implementation that allows you to enqueue and dequeue items in `O(1)` time complexity.
 *
 * ```typescript
 * import {Queue} from "lifecycle-utils";
 *
 * const queue = new Queue([1, 2, 3]);
 *
 * queue.push(4);
 * console.log(queue.shift()); // 1
 *
 * console.log(queue.first); // 2
 * console.log(queue.last); // 4
 * console.log(queue.length); // 3
 * console.log([...queue]); // [2, 3, 4]
 * ```
 */
export class Queue<const T> implements Iterable<T> {
    /** @internal */ private _items: Array<T | null>;
    /** @internal */ private _head = 0;
    /** @internal */ private readonly _compactAt: number;

    /**
     * Creates a new queue.
     *
     * **Time complexity:** `O(n)` with initial values, or `O(1)` without them.
     */
    public constructor(values?: Iterable<T>, options?: QueueOptions) {
        this._compactAt = options?.compactAt ?? 4096;

        if (values instanceof Queue)
            this._items = values._items.slice(values._head);
        else
            this._items = values == null
                ? []
                : Array.from(values);
    }

    /**
     * The number of values in the queue.
     *
     * **Time complexity:** `O(1)`.
     */
    public get length(): number {
        return this._items.length - this._head;
    }

    /**
     * Whether the queue is empty.
     *
     * **Time complexity:** `O(1)`.
     */
    public get isEmpty(): boolean {
        return this._head === this._items.length;
    }

    /**
     * The first (next) value in the queue, or `undefined` when the queue is empty.
     *
     * **Time complexity:** `O(1)`.
     */
    public get first(): T | undefined {
        if (this._head === this._items.length)
            return undefined;

        return this._items[this._head] as T;
    }

    /**
     * The last value in the queue, or `undefined` when the queue is empty.
     *
     * **Time complexity:** `O(1)`.
     */
    public get last(): T | undefined {
        if (this._head === this._items.length)
            return undefined;

        return this._items[this._items.length - 1] as T;
    }

    /**
     * Adds a value to the end of the queue.
     *
     * **Time complexity:** `O(1)` amortized.
     */
    public push(item: T): void {
        this._items.push(item);
    }

    /**
     * Removes and returns the first (next) value in the queue.
     *
     * Returns `undefined` when the queue is empty.
     *
     * **Time complexity:** `O(1)` amortized, with occasional `O(n)` compaction.
     */
    public shift(): T | undefined {
        if (this._head === this._items.length)
            return undefined;

        const item = this._items[this._head];
        this._items[this._head] = null;
        this._head++;

        if (this._head >= this._compactAt && this._head * 2 >= this._items.length) {
            this._items = this._items.slice(this._head);
            this._head = 0;
        }

        return item as T;
    }

    /**
     * Returns the value at the given index without removing it.
     *
     * Negative indexes count backwards from the end of the queue.
     *
     * **Time complexity:** `O(1)`.
     */
    public at(index: number): T | undefined {
        index = Math.trunc(index) || 0;

        if (index < 0)
            index += this.length;

        if (index < 0 || index >= this.length)
            return undefined;

        return this._items[this._head + index] as T;
    }

    /**
     * Deletes values from the queue starting at `start` and ending before `end`.
     *
     * When `end` is omitted, only the value at `start` is deleted.
     * Negative indexes count backwards from the end of the queue.
     *
     * Returns the number of deleted values.
     *
     * **Time complexity:** `O(k)` when deleting from either end, where `k` is the number of deleted values,
     * and `O(n)` when deleting from the middle.
     */
    public delete(start: number, end?: number): number {
        const length = this.length;

        start = Math.trunc(start) || 0;
        if (start < 0)
            start = Math.max(length + start, 0);
        else
            start = Math.min(start, length);

        if (end == null)
            end = Math.min(start + 1, length);
        else {
            end = Math.trunc(end) || 0;

            if (end < 0)
                end = Math.max(length + end, 0);
            else
                end = Math.min(end, length);
        }

        if (end <= start)
            return 0;

        const deleteCount = end - start;

        if (deleteCount === length) {
            this._items = [];
            this._head = 0;
            return deleteCount;
        }

        if (start === 0) {
            this._items.fill(null, this._head, this._head + deleteCount);
            this._head += deleteCount;

            if (this._head >= this._compactAt && this._head * 2 >= this._items.length) {
                this._items = this._items.slice(this._head);
                this._head = 0;
            }

            return deleteCount;
        }

        if (end === length) {
            this._items.length = this._head + start;
            return deleteCount;
        }

        this._items.splice(this._head + start, deleteCount);
        return deleteCount;
    }

    /**
     * Returns the index of the first occurrence of a value in the queue, or `-1` when it is not found.
     *
     * **Time complexity:** `O(n)`.
     */
    public indexOf(item: T, fromIndex = 0): number {
        const length = this.length;

        if (length === 0)
            return -1;

        fromIndex = Math.trunc(fromIndex) || 0;

        if (fromIndex >= length)
            return -1;

        if (fromIndex < 0)
            fromIndex = Math.max(length + fromIndex, 0);

        const index = this._items.indexOf(item, this._head + fromIndex);
        if (index < 0)
            return -1;

        return index - this._head;
    }

    /**
     * Returns the index of the last occurrence of a value in the queue, or `-1` when it is not found.
     *
     * **Time complexity:** `O(n)`.
     */
    public lastIndexOf(item: T, fromIndex?: number): number {
        const length = this.length;

        if (length === 0)
            return -1;

        if (fromIndex == null)
            fromIndex = length - 1;
        else
            fromIndex = Math.trunc(fromIndex) || 0;

        if (fromIndex >= 0)
            fromIndex = Math.min(fromIndex, length - 1);
        else
            fromIndex += length;

        if (fromIndex < 0)
            return -1;

        const index = this._items.lastIndexOf(item, this._head + fromIndex);
        if (index < this._head)
            return -1;

        return index - this._head;
    }

    /**
     * Returns an iterator over index-value pairs in the queue.
     *
     * **Time complexity:** `O(n)` for a full iteration and `O(1)` per value.
     */
    public *entries(): IterableIterator<[number, T]> {
        let index = 0;
        while (index < this.length) {
            yield [index, this._items[this._head + index] as T];
            index++;
        }
    }

    /**
     * Returns an iterator over the values in the queue from first to last.
     *
     * **Time complexity:** `O(n)` for a full iteration and `O(1)` per value.
     */
    public *values(): IterableIterator<T> {
        let index = 0;
        while (index < this.length) {
            yield this._items[this._head + index] as T;
            index++;
        }
    }

    /**
     * Returns the queue values as a new array.
     *
     * **Time complexity:** `O(n)`.
     */
    public toArray(): T[] {
        return this._items.slice(this._head) as T[];
    }

    /**
     * Removes all values from the queue.
     *
     * **Time complexity:** `O(1)`.
     */
    public clear(): void {
        this._items = [];
        this._head = 0;
    }

    /**
     * Returns an iterator over the values in the queue from first to last.
     *
     * **Time complexity:** `O(1)` to create the iterator, and `O(n)` for a full iteration.
     */
    public [Symbol.iterator](): IterableIterator<T> {
        return this.values();
    }
}
