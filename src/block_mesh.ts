import fs from 'fs';

import { BlockAssignerFactory, TBlockAssigners } from './assigners/assigners';
import { Atlas } from './atlas';
import { AtlasPalette } from './block_assigner';
import { BlockInfo } from './block_atlas';
import { ChunkedBufferGenerator, TBlockMeshBufferDescription } from './buffer';
import { Palette } from './palette';
import { ProgressManager } from './progress';
import { StatusHandler } from './status';
import { ColourSpace } from './util';
import { AppError, ASSERT } from './util/error_util';
import { LOGF } from './util/log_util';
import { AppPaths, PathUtil } from './util/path_util';
import { Vector3 } from './vector';
import { Voxel, VoxelMesh } from './voxel_mesh';
import { AssignParams } from './worker_types';

interface Block {
    voxel: Voxel;
    blockInfo: BlockInfo;
}

export type FallableBehaviour = 'replace-falling' | 'replace-fallable' | 'place-string' | 'do-nothing';

export interface BlockMeshParams {
    textureAtlas: Atlas,
    blockPalette: Palette,
    blockAssigner: TBlockAssigners,
    colourSpace: ColourSpace,
    fallable: FallableBehaviour,
}

export class BlockMesh {
    private _blocksUsed: string[];
    private _blocks: Block[];
    private _voxelMesh: VoxelMesh;
    private _fallableBlocks: string[];
    private _atlas: Atlas;
    private _lighting: Map<string, number>;

    public static createFromVoxelMesh(voxelMesh: VoxelMesh, blockMeshParams: AssignParams.Input) {
        const blockMesh = new BlockMesh(voxelMesh);
        blockMesh._assignBlocks(blockMeshParams);
        blockMesh._calculateLighting();
        return blockMesh;
    }

    private constructor(voxelMesh: VoxelMesh) {
        this._blocksUsed = [];
        this._blocks = [];
        this._voxelMesh = voxelMesh;
        this._atlas = Atlas.getVanillaAtlas()!;
        this._lighting = new Map<string, number>();
        //this._recreateBuffer = true;

        const fallableBlocksString = fs.readFileSync(PathUtil.join(AppPaths.Get.resources, 'fallable_blocks.json'), 'utf-8');
        this._fallableBlocks = JSON.parse(fallableBlocksString).fallable_blocks;
    }

    private _assignBlocks(blockMeshParams: AssignParams.Input) {
        const atlas = Atlas.load(blockMeshParams.textureAtlas);
        ASSERT(atlas !== undefined, 'Could not load atlas');
        this._atlas = atlas;

        const palette = Palette.load(blockMeshParams.blockPalette);
        ASSERT(palette !== undefined, 'Could not load palette');

        const atlasPalette = new AtlasPalette(atlas, palette);
        const allBlockCollection = atlasPalette.createBlockCollection([]);
        const nonFallableBlockCollection = atlasPalette.createBlockCollection(this._fallableBlocks);

        const blockAssigner = BlockAssignerFactory.GetAssigner(blockMeshParams.blockAssigner);

        let countFalling = 0;
        const taskHandle = ProgressManager.Get.start('Assigning');
        const voxels = this._voxelMesh.getVoxels();
        for (let voxelIndex = 0; voxelIndex < voxels.length; ++voxelIndex) {
            ProgressManager.Get.progress(taskHandle, voxelIndex / voxels.length);

            const voxel = voxels[voxelIndex];

            let block = blockAssigner.assignBlock(
                atlasPalette,
                voxel.colour,
                voxel.position,
                blockMeshParams.resolution,
                blockMeshParams.colourSpace,
                allBlockCollection,
            );

            const isFallable = this._fallableBlocks.includes(block.name);
            const isSupported = this._voxelMesh.isVoxelAt(Vector3.add(voxel.position, new Vector3(0, -1, 0)));

            if (isFallable && !isSupported) {
                ++countFalling;
            }

            let shouldReplace = (blockMeshParams.fallable === 'replace-fallable' && isFallable);
            shouldReplace ||= (blockMeshParams.fallable === 'replace-falling' && isFallable && !isSupported);

            if (shouldReplace) {
                const replacedBlock = blockAssigner.assignBlock(
                    atlasPalette,
                    voxel.colour,
                    voxel.position,
                    blockMeshParams.resolution,
                    ColourSpace.RGB,
                    nonFallableBlockCollection,
                );
                block = replacedBlock;
            }

            this._blocks.push({
                voxel: voxel,
                blockInfo: block,
            });
            if (!this._blocksUsed.includes(block.name)) {
                this._blocksUsed.push(block.name);
            }
        }
        ProgressManager.Get.end(taskHandle);

        if (blockMeshParams.fallable === 'do-nothing' && countFalling > 0) {
            StatusHandler.Get.add('warning', `${countFalling.toLocaleString()} blocks will fall under gravity when this structure is placed`);
        }
    }

    // Face order: ['north', 'south', 'up', 'down', 'east', 'west']
    public getBlockLighting(position: Vector3) {
        /*
        return {
            up: this._lighting.get(new Vector3(0, 1, 0).add(position).stringify()) ?? 15,
            north: this._lighting.get(new Vector3(1, 0, 0).add(position).stringify()) ?? 15,
            east: this._lighting.get(new Vector3(0, 0, 1).add(position).stringify()) ?? 15,
            south: this._lighting.get(new Vector3(-1, 0, 0).add(position).stringify()) ?? 15,
            west: this._lighting.get(new Vector3(0, 0, -1).add(position).stringify()) ?? 15,
            down: this._lighting.get(new Vector3(0, -1, 0).add(position).stringify()) ?? 15,
        };
        */
        return [
            this._lighting.get(new Vector3(1, 0, 0).add(position).stringify()) ?? 15,
            this._lighting.get(new Vector3(-1, 0, 0).add(position).stringify()) ?? 15,
            this._lighting.get(new Vector3(0, 1, 0).add(position).stringify()) ?? 15,
            this._lighting.get(new Vector3(0, -1, 0).add(position).stringify()) ?? 15,
            this._lighting.get(new Vector3(0, 0, 1).add(position).stringify()) ?? 15,
            this._lighting.get(new Vector3(0, 0, -1).add(position).stringify()) ?? 15,
        ];
    }

    private _calculateLighting() {
        this._lighting.clear();
        const blocksBounds = this._voxelMesh.getBounds();

        // Todo replace with Buffer as each value should only 4-bits instead of 64-bits.
        const tmp = new Vector3(0, 0, 0);
        for (let x = blocksBounds.min.x - 1; x <= blocksBounds.max.x + 1; ++x) {
            tmp.x = x;
            for (let y = blocksBounds.min.y - 1; y <= blocksBounds.max.y + 1; ++y) {
                tmp.y = y;
                for (let z = blocksBounds.min.z - 1; z <= blocksBounds.max.z + 1; ++z) {
                    tmp.z = z;
                    this._lighting.set(tmp.stringify(), 0);
                }
            }
        }

        // TODO: Cache stringify
        const actions: { pos: Vector3, value: number }[] = []; // = [{ pos: blocksBounds.min, value: 15 }];

        // Add initial light emitters to top of mesh to simulate sunlight
        for (let x = blocksBounds.min.x - 1; x <= blocksBounds.max.x + 1; ++x) {
            for (let z = blocksBounds.min.z - 1; z <= blocksBounds.max.z + 1; ++z) {
                actions.push({
                    pos: new Vector3(x, blocksBounds.max.y + 1, z),
                    value: 15,
                });
            }
        }

        while (actions.length > 0) {
            const action = actions.pop();
            ASSERT(action !== undefined);
            const newLightValue = action.value;

            const currentLightValue = this._lighting.get(action.pos.stringify());
            // We're trying to update the lighting value of an out-of-bounds block, skip.
            if (currentLightValue === undefined) {
                continue;
            }

            // Update lighting values only if the new value is lighter than the current brightness.
            if (newLightValue > currentLightValue && !this._voxelMesh.isVoxelAt(action.pos)) {
                this._lighting.set(action.pos.stringify(), newLightValue);

                actions.push({ pos: new Vector3(0, 1, 0).add(action.pos), value: newLightValue - 1 }); // up
                actions.push({ pos: new Vector3(1, 0, 0).add(action.pos), value: newLightValue - 1 });
                actions.push({ pos: new Vector3(0, 0, 1).add(action.pos), value: newLightValue - 1 });
                actions.push({ pos: new Vector3(-1, 0, 0).add(action.pos), value: newLightValue - 1 });
                actions.push({ pos: new Vector3(0, 0, -1).add(action.pos), value: newLightValue - 1 });
                actions.push({ pos: new Vector3(0, -1, 0).add(action.pos), value: newLightValue === 15 ? 15 : newLightValue - 1 }); // down
            }
        }
    }

    public getBlocks(): Block[] {
        return this._blocks;
    }

    public getBlockPalette() {
        return this._blocksUsed;
    }

    public getVoxelMesh() {
        if (!this._voxelMesh) {
            throw new AppError('Could not get voxel mesh');
        }
        return this._voxelMesh;
    }

    public getAtlas() {
        return this._atlas;
    }

    /*
    private _buffer?: TBlockMeshBufferDescription;
    public getBuffer(): TBlockMeshBufferDescription {
        //ASSERT(this._renderParams, 'Called BlockMesh.getBuffer() without setting render params');
        if (this._buffer === undefined) {
            this._buffer = BufferGenerator.fromBlockMesh(this);
            //this._recreateBuffer = false;
        }
        return this._buffer;
    }
    */

    private _bufferChunks: Array<TBlockMeshBufferDescription & { moreBlocksToBuffer: boolean, progress: number }> = [];
    public getChunkedBuffer(chunkIndex: number): TBlockMeshBufferDescription & { moreBlocksToBuffer: boolean, progress: number } {
        if (this._bufferChunks[chunkIndex] === undefined) {
            LOGF(`[BlockMesh]: getChunkedBuffer: ci: ${chunkIndex} not cached`);
            this._bufferChunks[chunkIndex] = ChunkedBufferGenerator.fromBlockMesh(this, chunkIndex);
        } else {
            LOGF(`[BlockMesh]: getChunkedBuffer: ci: ${chunkIndex} not cached`);
        }
        return this._bufferChunks[chunkIndex];
    }

    public getAllChunkedBuffers() {
        return this._bufferChunks;
    }
}
