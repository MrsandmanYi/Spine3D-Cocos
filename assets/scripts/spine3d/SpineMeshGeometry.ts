import { Texture } from "@spine-core/Texture";
import { primitives } from "cc";


export interface SpineMeshGeometry {

    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    indices32: Uint32Array;
    colors: Float32Array;

    minPos: {
        x: number;
        y: number;
        z: number;
    };
    maxPos: {
        x: number;
        y: number;
        z: number;
    };
    
    texture : Texture;
    //slotName : string; // key
    vertexOffset : number;

}