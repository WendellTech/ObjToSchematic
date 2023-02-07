import fs from 'fs';
import readVox from 'vox-reader';

import { RGBA_255, RGBAUtil } from '../colour';
import { Vector3 } from '../vector';
import { VoxelMesh } from '../voxel_mesh';
import { IFileImporter } from './base_importer';

export class VoxImporter extends IFileImporter<VoxelMesh> {
    public override load(): VoxelMesh {
        const fileBuffer = fs.readFileSync(this._filepath);

        const voxelMesh = new VoxelMesh({
            enableAmbientOcclusion: true,
            voxelOverlapRule: 'first',
        });

        const voxObject = readVox(fileBuffer);
        const colourPalette = voxObject.rgba.values as RGBA_255[];
        colourPalette.map((x) => RGBAUtil.fromRGBA255(x));

        const size = voxObject.size as { x: number, y: number, z: number };
        const halfSizeVector = new Vector3(size.x, size.z, size.y) // Swap y and z axis
            .divScalar(2)
            .floor();
        const voxels = voxObject.xyzi.values as { x: number, y: number, z: number, i: number }[];

        voxels.forEach((voxel) => {
            const position = new Vector3(voxel.x, voxel.z, voxel.y) // Swap y and z axis
                .sub(halfSizeVector);
            const colour = RGBAUtil.fromRGBA255(colourPalette[voxel.i]);

            voxelMesh.addVoxel(position, colour);
        });

        return voxelMesh;
    }
}
