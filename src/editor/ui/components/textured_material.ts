import { TTexelExtension, TTexelInterpolation } from '../../../runtime/util/type_util';
import { HTMLBuilder } from '../../../editor/ui/misc';
import { ComboboxComponent } from './combobox';
import { ConfigComponent } from './config';
import { ImageComponent } from './image';
import { TexturedMaterial } from '../../../runtime/materials';
import { OtSE_TextureReader } from '../../texture_reader';
import { OtS_Texture } from '../../../runtime/ots_texture';

export class TexturedMaterialComponent extends ConfigComponent<Promise<TexturedMaterial>, HTMLDivElement> {
    //private _localMaterial: TexturedMaterial;

    private _materialName: string;
    private _interpolation: TTexelInterpolation;
    private _extension: TTexelExtension;

    private _filteringElement: ComboboxComponent<'nearest' | 'linear'>;
    private _wrapElement: ComboboxComponent<'clamp' | 'repeat'>;
    private _imageComponent: ImageComponent;

    public constructor(material: TexturedMaterial) {
        super();
        
        this._materialName = material.name;
        //this._localMaterial = OtS_Util.copyTexturedMaterial(material);
        this._interpolation = material.texture.getInterpolation();
        this._extension = material.texture.getExtension();

        this._filteringElement = new ComboboxComponent<TTexelInterpolation>()
            .setLabel('materials.components.texture_filtering')
            .addItem({ payload: 'linear', displayLocKey: 'materials.components.linear' })
            .addItem({ payload: 'nearest', displayLocKey: 'materials.components.nearest' })
            .setDefaultValue(this._interpolation);

        this._wrapElement = new ComboboxComponent<'clamp' | 'repeat'>()
            .setLabel('materials.components.texture_wrap')
            .addItem({ payload: 'clamp', displayLocKey: 'materials.components.clamp' })
            .addItem({ payload: 'repeat', displayLocKey: 'materials.components.repeat' })
            .setDefaultValue(this._extension);

        this._imageComponent = new ImageComponent()
            .setLabel('materials.components.diffuse_map');

        this.setCanMinimise();
    }

    public override refresh() {
        super.refresh();

        this._imageComponent.refresh();
        this._filteringElement.refresh();
        this._wrapElement.refresh();
    }

    public override registerEvents(): void {
        this._imageComponent.registerEvents();
        this._filteringElement.registerEvents();
        this._wrapElement.registerEvents();

        this._imageComponent.addValueChangedListener((imageWrap) => {
            console.log(imageWrap);
        });

        this._filteringElement.addValueChangedListener((newFiltering) => {
            this._interpolation = newFiltering;
        });

        this._wrapElement.addValueChangedListener((newWrap) => {
            this._extension = newWrap;
        });
    }

    public override _generateInnerHTML(): string {
        const builder = new HTMLBuilder();

        {
            builder.add(this._imageComponent.generateHTML());
            builder.add(this._filteringElement.generateHTML());
            builder.add(this._wrapElement.generateHTML());
        }

        return builder.toString();
    }

    protected override _onValueChanged(): void {
    }

    protected override _onEnabledChanged(): void {
        super._onEnabledChanged();

        this._imageComponent.setEnabled(this.enabled);
        this._filteringElement.setEnabled(this.enabled);
        this._wrapElement.setEnabled(this.enabled);
    }

    public override finalise(): void {
        //super.finalise();

        this._imageComponent.finalise();
        this._filteringElement.finalise();
        this._wrapElement.finalise();
    }

    public override getValue(): Promise<TexturedMaterial> {
        return new Promise(async (res, rej) => {
            let texture: OtS_Texture;
            try {
                const image = await this._imageComponent.getValue();
                texture = OtSE_TextureReader.CreateFromImage(image.raw, image.filetype, this._interpolation, this._extension);
            } catch (err) {
                console.error(err);
                texture = OtS_Texture.CreateDebugTexture();
            }

            res({
                type: 'textured',
                name: this._materialName,
                texture: texture,
            });
        });
    }
}
