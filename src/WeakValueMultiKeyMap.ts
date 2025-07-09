import {MultiKeyMap, ReadonlyMultiKeyMap} from "./MultiKeyMap.js";

/**
 * A utility class that works like a `Map`,
 * but accepts multiple values as the key for each value,
 * and does not keep strong references to the values (allowing them to be garbage collected).
 *
 * When a value is garbage collected, it is automatically removed from the map.
 */
export class WeakValueMultiKeyMap<const Key extends readonly any[], const V extends object> {
    /** @internal */ private readonly _map = new MultiKeyMap<Key, InternalWeakValue<V>>();

    public constructor(
        entries?: readonly (readonly [key: Key, value: V])[] |
            MultiKeyMap<Key, V> |
            ReadonlyMultiKeyMap<Key, V> |
            WeakValueMultiKeyMap<Key, V> |
            ReadonlyWeakValueMultiKeyMap<Key, V> |
            null
    ) {
        if (entries != null) {
            for (const [key, value] of entries)
                this.set(key, value);
        }
    }

    /**
     * Add or update a value for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public set(key: Readonly<Key>, value: V): this {
        const currentWeakValue = this._map.get(key);
        if (currentWeakValue != null) {
            const currentValue = currentWeakValue.ref.deref();

            if (currentValue != null)
                currentWeakValue.tracker.unregister(currentValue);
        }

        const weakValue: InternalWeakValue<V> = {
            ref: new WeakRef(value),
            tracker: null as any // will be set below
        };
        weakValue.tracker = new FinalizationRegistry<Readonly<Key>>(this._finalize.bind(this, weakValue));
        weakValue.tracker.register(value, key.slice());

        this._map.set(key, weakValue);
        return this;
    }

    /**
     * Get a value for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public get(key: Readonly<Key>): V | undefined {
        const weakValue = this._map.get(key);
        if (weakValue == null)
            return undefined;

        const value = weakValue.ref.deref();
        /* c8 ignore start */
        if (value == null) {
            this._map.delete(key);
            return undefined;
        } /* c8 ignore stop */

        return value;
    }

    /**
     * Check if a value exists for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public has(key: Readonly<Key>): boolean {
        return this.get(key) != null;
    }

    /**
     * Delete the value for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public delete(key: Readonly<Key>): boolean {
        const weakValue = this._map.get(key);
        if (weakValue == null)
            return false;

        const value = weakValue.ref.deref();
        if (value != null)
            weakValue.tracker.unregister(value);

        this._map.delete(key);
        return true;
    }

    /**
     * Clear all values from the map.
     */
    public clear(): void {
        for (const [, weakValue] of this._map.entries()) {
            const value = weakValue.ref.deref();
            if (value != null)
                weakValue.tracker.unregister(value);
        }
        this._map.clear();
    }

    /**
     * Get the number of entries in the map.
     */
    public get size(): number {
        return this._map.size;
    }

    /**
     * Get an iterator for all entries in the map.
     */
    public *entries(): Generator<[key: Key, value: V]> {
        for (const [key, weakValue] of this._map.entries()) {
            const value = weakValue.ref.deref();
            if (value != null)
                yield [key, value];
        }
    }

    /**
     * Get an iterator for all keys in the map.
     */
    public *keys(): Generator<Key> {
        for (const [key] of this.entries())
            yield key;
    }

    /**
     * Get an iterator for all values in the map.
     */
    public *values(): Generator<V> {
        for (const [, value] of this.entries())
            yield value;
    }

    /**
     * Call a function for each entry in the map.
     */
    public forEach(callbackfn: (value: V, key: Key, map: this) => void, thisArg?: any): void {
        for (const [key, value] of this.entries()) {
            if (thisArg !== undefined)
                callbackfn.call(thisArg, value, key, this);
            else
                callbackfn.call(this, value, key, this);
        }
    }

    public [Symbol.iterator](): Generator<[key: Key, value: V]> {
        return this.entries();
    }

    /** @internal */
    private _finalize(value: InternalWeakValue<V>, key: Readonly<Key>) {
        const weakValue = this._map.get(key);
        if (weakValue === value)
            this._map.delete(key);
    }
}

export type ReadonlyWeakValueMultiKeyMap<
    Key extends readonly any[], V extends object
> = Omit<WeakValueMultiKeyMap<Key, V>, "set" | "delete" | "clear">;

type InternalWeakValue<T extends object> = {
    ref: WeakRef<T>,
    tracker: FinalizationRegistry<readonly any[]>
};
