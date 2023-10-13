import { AppMath } from "./math";
import { TBrand } from "./util/type_util";

export namespace AppUtil {
    export namespace Text {
        export function capitaliseFirstLetter(text: string) {
            return text.charAt(0).toUpperCase() + text.slice(1);
        }

        /**
         * Namespaces a block name if it is not already namespaced
         * For example `namespaceBlock('stone')` returns `'minecraft:stone'`
         */
        export function namespaceBlock(blockName: string): AppTypes.TNamespacedBlockName {
            // https://minecraft.fandom.com/wiki/Resource_location#Namespaces
            return isNamespacedBlock(blockName) ? blockName : ('minecraft:' + blockName);
        }

        export function isNamespacedBlock(blockName: string): boolean {
            return blockName.includes(':');
        }
    }

    export namespace Array {

        /**
         * An optimised function for repeating a subarray contained within a buffer multiple times by
         * repeatedly doubling the subarray's length.
         */
        export function repeatedFill(buffer: Float32Array, start: number, startLength: number, desiredCount: number) {
            const pow = AppMath.largestPowerOfTwoLessThanN(desiredCount);

            let len = startLength;
            for (let i = 0; i < pow; ++i) {
                buffer.copyWithin(start + len, start, start + len);
                len *= 2;
            }

            const finalLength = desiredCount * startLength;
            buffer.copyWithin(start + len, start, start + finalLength - len);
        }
    }
}

/* eslint-disable */
export enum EAction {
    Settings = 0,
    Import = 1,
    Materials = 2,
    Voxelise = 3,
    Assign = 4,
    Export = 5,
    MAX = 6,
}
/* eslint-enable */

export namespace AppTypes {
    export type TNamespacedBlockName = string;
}

export type UV = { u: number, v: number };

export type TOptional<T> = T | undefined;

export function getRandomID(): string {
    return (Math.random() + 1).toString(36).substring(7);
}