import {MultiKeyMap, ReadonlyMultiKeyMap} from "./MultiKeyMap.js";

/**
 * A utility class that works like a `Map`,
 * but accepts multiple values as the key for each value,
 * and does not keep strong references to the values (allowing them to be garbage collected).
 *
 * When a value is garbage collected, it is automatically removed from the map.
 */
export class WeakValueMultiKeyMap<const Key extends readonly any[], const Value extends object> {
    /** @internal */ private readonly _map = new MultiKeyMap<Key, InternalWeakValue<Key, Value>>();
    /** @internal */ private readonly _registry: FinalizationRegistry<InternalWeakValue<Key, Value>>;

    public constructor(
        entries?: readonly (readonly [key: Key, value: Value])[] |
            MultiKeyMap<Key, Value> |
            ReadonlyMultiKeyMap<Key, Value> |
            WeakValueMultiKeyMap<Key, Value> |
            ReadonlyWeakValueMultiKeyMap<Key, Value> |
            null
    ) {
        this._registry = new FinalizationRegistry(this._finalize.bind(this));

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
    public set(key: Readonly<Key>, value: Value): this {
        const currentWeakValue = this._map.get(key);
        if (currentWeakValue != null)
            this._registry.unregister(currentWeakValue);

        const weakValue: InternalWeakValue<Key, Value> = {
            key: currentWeakValue?.key ?? key.slice() as any as Key,
            ref: new WeakRef(value)
        };
        this._registry.register(value, weakValue, weakValue);

        this._map.set(key, weakValue);
        return this;
    }

    /**
     * Get a value for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public get(key: Readonly<Key>): Value | undefined {
        const weakValue = this._map.get(key);
        if (weakValue == null)
            return undefined;

        const value = weakValue.ref.deref();
        /* c8 ignore start */
        if (value == null) {
            this._registry.unregister(weakValue);
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

        this._registry.unregister(weakValue);
        this._map.delete(key);
        return true;
    }

    /**
     * Clear all values from the map.
     */
    public clear(): void {
        for (const [, weakValue] of this._map.entries())
            this._registry.unregister(weakValue);

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
    public *entries(): Generator<[key: Key, value: Value]> {
        for (const [key, weakValue] of this._map.entries()) {
            const value = weakValue.ref.deref();
            if (value != null)
                yield [key, value];
            else {/* c8 ignore start */
                this._registry.unregister(weakValue);
                this._map.delete(key);
            } /* c8 ignore stop */
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
    public *values(): Generator<Value> {
        for (const [, value] of this.entries())
            yield value;
    }

    /**
     * Call a function for each entry in the map.
     */
    public forEach(callbackfn: (value: Value, key: Key, map: this) => void, thisArg?: any): void {
        for (const [key, value] of this.entries())
            callbackfn.call(thisArg, value, key, this);
    }

    public [Symbol.iterator](): Generator<[key: Key, value: Value]> {
        return this.entries();
    }

    /** @internal */
    private _finalize(entry: InternalWeakValue<Key, Value>) {
        if (this._map.get(entry.key) === entry)
            this._map.delete(entry.key);
    }
}

export type ReadonlyWeakValueMultiKeyMap<
    Key extends readonly any[], V extends object
> = Omit<WeakValueMultiKeyMap<Key, V>, "set" | "delete" | "clear" | "forEach"> & {
    forEach(callbackfn: (value: V, key: Key, map: ReadonlyWeakValueMultiKeyMap<Key, V>) => void, thisArg?: any): void
};

type InternalWeakValue<Key extends readonly any[], T extends object> = {
    key: Readonly<Key>,
    ref: WeakRef<T>
};
