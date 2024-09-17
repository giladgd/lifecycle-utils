/**
 * An object that provides an async `.dispose()` method that can called only once.
 *
 * Calling `.dispose()` will call the provided `onDispose` function only once.
 * Any subsequent calls to `.dispose()` will do nothing.
 */
export class AsyncDisposableHandle {
    /** @internal */ private _onDispose: (() => Promise<void>) | undefined;

    public constructor(onDispose: () => Promise<void>) {
        this._onDispose = onDispose;

        this.dispose = this.dispose.bind(this);
        this[Symbol.asyncDispose] = this[Symbol.asyncDispose].bind(this);
    }

    public get disposed() {
        return this._onDispose == null;
    }

    public async [Symbol.asyncDispose]() {
        await this.dispose();
    }

    public async dispose() {
        if (this._onDispose != null) {
            const onDispose = this._onDispose;
            delete this._onDispose;

            await onDispose();
        }
    }
}
