/**
 * Split a text by multiple separators, and return a result of the text and separators.
 * For example, `splitText("Hello <and> world [then] !", ["<and>", "[then]"])`
 *   will return `["Hello ", new Separator("<and>"), " world ", new Separator("[then]"), " !"]`
 * @param {string} text
 * @param {Array<string | Separator>} separators
 * @returns {(string | Separator)[]}
 */
export function splitText<const S extends string[]>(text: string, separators: S): (string | Separator<S[number]>)[] {
    if (separators.length === 0)
        return [text];

    const [firstSeparator, ...otherSeparators] = separators;

    let res: (string | Separator<S[number]>)[] = [];

    let lastSplitIndex = 0;
    let splitIndex = text.indexOf(firstSeparator);

    while (splitIndex >= 0) {
        res.push(text.slice(lastSplitIndex, splitIndex));
        res.push(new Separator(firstSeparator));

        lastSplitIndex = splitIndex + firstSeparator.length;
        splitIndex = text.indexOf(firstSeparator, lastSplitIndex);
    }

    if (lastSplitIndex < text.length)
        res.push(text.slice(lastSplitIndex));

    if (otherSeparators.length > 0) {
        res = res
            .filter((item) => item !== "")
            .flatMap((item) => {
                if (typeof item === "string")
                    return splitText(item, otherSeparators);
                else
                    return item;
            });
    }

    if (res.length === 0 && text.length === 0)
        res.push("");

    return res;
}

export class Separator<S extends string> {
    public readonly separator: S;

    /**
     * @internal
     * @param {string} separator
     */
    public constructor(separator: S) {
        this.separator = separator;
    }
}
