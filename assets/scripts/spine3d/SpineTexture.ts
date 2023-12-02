import { Texture, TextureFilter, TextureWrap } from "@spine-core/Texture";
import { Texture2D } from "cc";


export class SpineTexture extends Texture{

    constructor(image : Texture2D){
        super(image);
    }

    setFilters(minFilter: TextureFilter, magFilter: TextureFilter): void {
        
    }
    setWraps(uWrap: TextureWrap, vWrap: TextureWrap): void {
        
    }
    dispose(): void {
        
    }

}