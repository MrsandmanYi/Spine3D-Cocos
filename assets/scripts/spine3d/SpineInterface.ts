import { Material } from "cc";
import { Asset } from "cc";
import { Texture2D, Node } from "cc";
import { _decorator } from 'cc';
const { ccclass, property } = _decorator;

export const PREVIEW_NODE_NAME = "spine3d_preview_";

export enum SpineEditorCmd {
    None = 0,
    // ProcessSkeleton = 1,
    // InitSpine = 2,
    SetAnimation = 3,
    SetSkin = 4,
}

@ccclass('SpineTextureContainer')
export class SpineTextureContainer{
    @property({type: Material})
    material : Material | null = null;
    @property({type: Asset})
    texture : Asset;
    @property({type: String})
    name : string;

    @property({type: Number})
    vertexCount : number = 276;
    @property({type: Number})
    indicCount : number = 1029;
}

@ccclass('spine3d.SpineSocket')
export class SpineSocket {
    @property({type: String})
    path : string = "";
    @property({type: Node})
    target : Node | null = null;
    @property({type: Number, readonly:true})
    boneIndex : number = -1;
}



