import {describe, expect, test} from "vitest";
import {Separator, splitText} from "../src/index.js";

describe("splitText", () => {
    test("splitting text works", () => {
        const res = splitText("Hello <and> world [then] !", ["<and>", "[then]"]);

        expect(res).toEqual([
            "Hello ",
            new Separator("<and>"),
            " world ",
            new Separator("[then]"),
            " !"
        ]);
    });

    test("splitting text with separators that do not exist in the text works", () => {
        const res = splitText("Hello <and> world [then] !", ["<yo>", "[what]"]);

        expect(res).toEqual(["Hello <and> world [then] !"]);
    });

    test("splitting empty text works", () => {
        const res = splitText("", ["<yo>", "[what]"]);

        expect(res).toEqual([""]);
    });

    test("splitting space text works", () => {
        const res = splitText(" ", ["<yo>", "[what]"]);

        expect(res).toEqual([" "]);
    });

    test("splitting empty text with no separators works", () => {
        const res = splitText("", []);

        expect(res).toEqual([""]);
    });

    test("splitting space text with no separators works", () => {
        const res = splitText(" ", []);

        expect(res).toEqual([" "]);
    });
});
