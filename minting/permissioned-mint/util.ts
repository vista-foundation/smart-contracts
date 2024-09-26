import {crc8} from "./crc8";
import {fromHex} from "@blaze-cardano/core";

/** Padded number in Hex. */
function checksum(num: string): string {
    return crc8(fromHex(num)).toString(16).padStart(2, "0");
}

function toLabel(num: number): string {
    if (num <= 0 || num > 65535) {
        throw new Error(
            `Label ${num} out of range: min label 1 - max label 65535.`,
        );
    }
    const numHex = num.toString(16).padStart(4, "0");
    return "0" + numHex + checksum(numHex) + "0";
}

function fromLabel(label: string): number | null {
    if (label.length !== 8 || !(label[0] === "0" && label[7] === "0")) {
        return null;
    }
    const numHex = label.slice(1, 5);
    const num = parseInt(numHex, 16);
    const check = label.slice(5, 7);
    return check === checksum(numHex) ? num : null;
}

export {
    crc8,
    toLabel,
    fromLabel
}