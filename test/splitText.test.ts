import {describe, expect, test} from "vitest";
import {Separator, splitText} from "../src/index.js";

describe("splitText", () => {
    test("splitting text works", () => {
        const res = splitText("Hello <and> world [then] !", ["<and>", "[then]"]);

        expect(res).toEqual([
            "Hello ",
            Separator._create("<and>"),
            " world ",
            Separator._create("[then]"),
            " !"
        ]);
    });

    test("splitting text prioritizes first match", () => {
        const res1 = splitText("Hello <and> world [then] !", ["<and>", "<and> worl", "[then]"]);
        expect(res1).toEqual([
            "Hello ",
            Separator._create("<and>"),
            " world ",
            Separator._create("[then]"),
            " !"
        ]);

        const res2 = splitText("Hello <and> world [then] !", ["<and> worl", "<and>", "[then]"]);
        expect(res2).toEqual([
            "Hello ",
            Separator._create("<and> worl"),
            "d ",
            Separator._create("[then]"),
            " !"
        ]);

        const res3 = splitText("Hello <and> world [then] !", ["<and>", "llo <and>", "[then]"]);
        expect(res3).toEqual([
            "Hello ",
            Separator._create("<and>"),
            " world ",
            Separator._create("[then]"),
            " !"
        ]);

        const res4 = splitText("Hello <and> world [then] !", ["llo <and>", "<and>", "[then]"]);
        expect(res4).toEqual([
            "He",
            Separator._create("llo <and>"),
            " world ",
            Separator._create("[then]"),
            " !"
        ]);

        const res5 = splitText("Hello <and> world [then] !", ["llo <and> w", "<and>", "[then]"]);
        expect(res5).toEqual([
            "He",
            Separator._create("llo <and> w"),
            "orld ",
            Separator._create("[then]"),
            " !"
        ]);

        const res6 = splitText("Hello <and> world [then] !", ["<and>", "llo <and> w", "[then]"]);
        expect(res6).toEqual([
            "Hello ",
            Separator._create("<and>"),
            " world ",
            Separator._create("[then]"),
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
