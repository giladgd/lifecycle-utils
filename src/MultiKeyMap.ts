const valueSymbol = Symbol();

/**
 * A utility class that works like a `Map`, but accepts multiple values as the key for each value.
 */
export class MultiKeyMap<const Key extends readonly any[], const V> {
    /** @internal */ public readonly _map: InternalMap<Key> = new Map();
    /** @internal */ private readonly _keys = new Map<Key, V>();

    public constructor(entries?: readonly (readonly [key: Key, value: V])[] | MultiKeyMap<Key, V> | null) {
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
        let map: InternalMap<Key> = this._map;

        for (let i = 0; i < key.length; i++) {
            const keyItem = key[i];
            let nextMap = map.get(keyItem);

            if (nextMap == null) {
                nextMap = new Map();
                map.set(keyItem, nextMap);
            }

            map = nextMap;
        }

        const valueKey = map.has(valueSymbol)
            ? map.get(valueSymbol)!
            : key.slice() as readonly any[] as Key;
        this._keys.set(valueKey, value);
        map.set(valueSymbol, valueKey);

        return this;
    }

    /**
     * Get a value for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public get(key: Readonly<Key>): V | undefined {
        let map: InternalMap<Key> | undefined = this._map;

        for (let i = 0; i < key.length && map != null; i++)
            map = map.get(key[i]);

        if (map == null)
            return undefined;

        const valueKey = map.get(valueSymbol);
        if (valueKey == null)
            return undefined;

        return this._keys.get(valueKey);
    }

    /**
     * Check if a value exists for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public has(key: Readonly<Key>): boolean {
        let map: InternalMap<Key> | undefined = this._map;

        for (let i = 0; i < key.length && map != null; i++) {
            map = map.get(key[i]);
        }

        return map != null && map.has(valueSymbol);
    }

    /**
     * Delete the value for a given key.
     *
     * Time complexity: O(1), given that the length of the key is constant.
     */
    public delete(key: Readonly<Key>): boolean {
        let map: InternalMap<Key> | undefined = this._map;
        const stack: [accessMap: InternalMap<Key>, accessKey: Key[number]][] = [];

        for (let i = 0; i < key.length && map != null; i++) {
            stack.push([map, key[i]]);
            map = map.get(key[i]);
        }

        if (map == null)
            return false;

        const valueKey = map.get(valueSymbol);
        if (valueKey == null)
            return false;

        map.delete(valueSymbol)
        this._keys.delete(valueKey);

        for (let i = stack.length - 1; i >= 0; i--) {
            const [accessMap, accessKey] = stack[i];

            if (map.size !== 0)
                break;

            accessMap.delete(accessKey);
            map = accessMap;
        }

        return true;
    }

    /**
     * Clear all values from the map.
     */
    public clear(): void {
        this._map.clear();
        this._keys.clear();
    }

    /**
     * Get the number of entries in the map.
     */
    public get size(): number {
        return this._keys.size;
    }

    /**
     * Get an iterator for all entries in the map.
     */
    public *entries(): Generator<[key: Key, value: V]> {
        for (const [key, value] of this._keys)
            yield [key.slice() as readonly any[] as Key, value];
    }

    /**
     * Get an iterator for all keys in the map.
     */
    public *keys(): Generator<Key> {
        for (const key of this._keys.keys())
            yield key.slice() as readonly any[] as Key;
    }

    /**
     * Get an iterator for all values in the map.
     */
    public *values(): Generator<V> {
        for (const value of this._keys.values())
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
}

export type ReadonlyMultiKeyMap<Key extends readonly any[], V> = Omit<MultiKeyMap<Key, V>, "set" | "delete" | "clear">;

type InternalMap<Key extends readonly any[]> = Map<Key, InternalMap<Key>> & Map<typeof valueSymbol, Key>;
