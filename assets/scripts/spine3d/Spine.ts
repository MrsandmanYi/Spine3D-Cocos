import { _decorator, Component, math, Quat, Vec3 } from 'cc';
import { JsonAsset } from 'cc';
import { TextAsset } from 'cc';
const { ccclass, property, requireComponent,executeInEditMode,playOnFocus} = _decorator;
import { Texture2D } from 'cc';
import { SpineTexture } from './SpineTexture';
import { AtlasAttachmentLoader } from '@spine-core/AtlasAttachmentLoader';
import { SkeletonJson } from '@spine-core/SkeletonJson';
import { SkeletonData } from '@spine-core/SkeletonData';
import { Skeleton } from '@spine-core/Skeleton';
import { AnimationState } from '@spine-core/AnimationState';
import { AnimationStateData } from '@spine-core/AnimationStateData';
import { Vector2 } from '@spine-core/Utils';
import { SkeletonRenderer } from './SkeletonRenderer';
import { EDITOR, EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { SpineEditorCmd, SpineSocket, SpineTextureContainer } from './SpineInterface';
import { Enum } from 'cc';
import { Material } from 'cc';
import { TextureAtlas, TextureAtlasReader } from '@spine-core/TextureAtlas';
import { Mat4,Node } from 'cc';
import { Bone } from '@spine-core/Bone';
import { AssetLibrary } from 'cc';
import { Asset } from 'cc'; 
import { SkeletonBinary } from '@spine-core/SkeletonBinary';
import { BoneData } from '@spine-core/BoneData';
import { BufferAsset } from 'cc';
import { MeshAttachment } from '@spine-core/attachments/MeshAttachment';
import { RegionAttachment } from '@spine-core/index';

export type EnumType = Record<string, string | number>;
const socketBoneMatrix4 = new Mat4();
const tempMat4 = new Mat4();

const DefaultSpineMaterialPath = "db://assets/material/mat_spine3d.mtl";

Enum(SpineEditorCmd);

@ccclass('Spine')
@executeInEditMode(true)
@playOnFocus(true)
@requireComponent(SkeletonRenderer)
export class Spine extends Component {

    private skeletonRenderer : SkeletonRenderer = null;

    @property({type:Material})
    materialAsset : Material = null;
    @property({type:Asset})
    skeletonAsset : Asset = null;
    private skeletonUuid : string = "";
    @property({type:String})
    atlasAsset : string = "";
    @property({type:[SpineTextureContainer]})
    textures : SpineTextureContainer[] = [];

    @property({type:String})
    defaultSkin = "default";
    @property({type:String, readonly : true}) 
    skins : string[] = [];

    @property({type:String})
    animation = "undefined";
    @property({type:String})
    animations : string[] = [];

    @property({type:Number, range:[0,10]})
    timeScale = 1.0;


    // Sockets
    @property({type:[SpineSocket]})
    sockets : SpineSocket[] = [];
    @property({type:String, editorOnly:true})
    bones : string[] = [];
    protected _cachedSockets: Map<string, number> = new Map<string, number>();
    protected _socketNodes: Map<number, Node> = new Map();
    get socketNodes (): Map<number, Node> { return this._socketNodes; }

    // @property({type:String})
    // jsonPath : string = "spine-10001/459雪笠怪1";
    // @property({type:String})
    // atlasPath : string = "spine-10001/459雪笠怪2";

    private accumulator = 0;
    @property({type:Number, range:[15,60]})
    public fps = 30;
    @property({type:Number,range:[0.01,0.1],readonly:true})
    private fixedDeltaTime = 0.033; // 基础步长
    @property({type:Number, range:[1,10]})
    private maxSteps = 3; // 最大步数

    private renderTotalStepCount : number = -1;
    private renderStep : number = 0;

    private atlasAttachmentLoader : AtlasAttachmentLoader = null;
    private skeletonJson : SkeletonJson = null;
    private skeletonBinary : SkeletonBinary = null;
    private skeletonData : SkeletonData = null;
    private spineAtlas : TextureAtlas = null;
    private skeleton : Skeleton = null;

    private animationState : AnimationState = null;

    private spineSkeleton : any = null;
    
    @property({type:SpineEditorCmd})
    private CMD : SpineEditorCmd = SpineEditorCmd.None;
    @property({type:String})
    private CMDParam : string = "";
    @property({type:Boolean})
    private editorPreview : boolean = false;
    
    private editorPreviewPrev : boolean = false;
    
    // testUpdate(value){
    //     console.log("testUpdate",value);

    //     let geometry: primitives.IDynamicGeometry = {
    //         positions: new Float32Array([
    //             0, 0, 0,
    //             100, 0, 0,
    //             100, 100, 0,
    //             0, 100, 0,
    //         ]),
    //         indices16: new Uint16Array([
    //             0, 1, 2,
    //             0, 2, 3,
    //         ]),
    //     };
    //     const mesh = utils.MeshUtils.createDynamicMesh(0, geometry , undefined, null);
    //     let meshRenderer = this.addComponent(MeshRenderer);
    //     meshRenderer.mesh = mesh;
    //     mesh.updateSubMesh(0, geometry);
    //     meshRenderer.onGeometryChanged();

        
    // }

    // 编辑器
    async onFocusInEditor(): Promise<void> {

        if (!(EDITOR && EDITOR_NOT_IN_PREVIEW)) {
            return;
        }

        if (this.editorPreview) {
            this.editorPreviewPrev = true;
        }

        // 根据 skeletonAsset 所在路径加载到 Atlas，并加载Textures
        if (this.skeletonAsset == null) {
            console.log("skeletonAsset is null");
            return;
        }
        
        if (this.materialAsset == null) {
            // 载入默认的材质
            const defaultMatUuid = await Editor.Message.request('asset-db', 'query-uuid', DefaultSpineMaterialPath);
            this.materialAsset = await this.loadAsset(defaultMatUuid) as Material;
            // console.error("materialAsset is null");
            // return;
        }

        // todo 清空生成的材质

        let skeletonUrl = await Editor.Message.request('asset-db', 'query-url', this.skeletonAsset.uuid);

        const dotIndex = skeletonUrl.lastIndexOf(".");
        let atlasUrl = skeletonUrl.substring(0,dotIndex);
        atlasUrl += ".atlas";

        let atlasComplete = false;
        let pngCount = 0;
        this.textures.splice(0,this.textures.length);

        const atlasUUID = await Editor.Message.request('asset-db', 'query-uuid', atlasUrl);
        AssetLibrary.loadAsset(atlasUUID, async (err, asset) => {
            let atlasAsset = asset as TextAsset;
            this.atlasAsset = atlasAsset._file;
            // 加载图片
            //console.log("atlasAsset",this.atlasAsset);
            let reader = new TextureAtlasReader(atlasAsset._file);
            let s = true;

            let reader2 = new TextureAtlasReader(atlasAsset._file);
            let ss1 = true;
            while(ss1){
                let line = reader2.readLine();
                ss1 = line != null;
                if (ss1 && line.endsWith(".png")) {
                    pngCount++;
                }
            }
            
            //console.error("pngCount",pngCount);

            while(s){
                let line = reader.readLine();
                s = line != null;
                if (s && line.endsWith(".png")) {
                    line = line.trim();
                    const idx = skeletonUrl.lastIndexOf("/");
                    let textureUrl = skeletonUrl.substring(0,idx);
                    textureUrl = textureUrl + "/" + line;
                    console.log("start load texture:" + textureUrl);
                    //this.textures.splice(0,this.textures.length);
                    await Editor.Message.request('asset-db', 'query-uuid', textureUrl).then((uuid) => {
                        console.log("query-uuid texture:" + uuid);
                        AssetLibrary.loadAsset(uuid, async (err, asset) => {
                            //console.error("asset",asset);
                            let name = line.replace(".png","");
                            let spineTextureContainer = new SpineTextureContainer();
                            spineTextureContainer.name = name;
                            spineTextureContainer.texture = asset;

                            console.log("texture:",spineTextureContainer);
                            // 根据纹理创建材质，并保存到本地
                            console.log("create material:",this.materialAsset.uuid);
                            await Editor.Message.request("asset-db",'query-asset-info',this.materialAsset.uuid).then(async (matInfo)=>{
                                let matStr = await this.loadMaterialString(matInfo);
                                //console.error("matStr",matStr);
                                const texUuid = spineTextureContainer.texture.uuid.toString() + "@6c48a";
                                const obj = JSON.parse(matStr);
                                //console.error("obj",obj);
                                
                                if(obj["_props"] == null){
                                    obj["_props"] = [{}];

                                }
                                if(obj["_props"][0]["mainTexture"] == null){
                                    obj["_props"][0]["mainTexture"] = {};
                                }

                                obj["_props"][0]["mainTexture"]["__uuid__"] = texUuid;
                                obj["_props"][0]["mainTexture"]["__expectedType__"] = "cc.Texture2D";

                                let newMatStr = JSON.stringify(obj,null,2);
                                let materialName = name + "_material";
                                //console.log("materialName",materialName);
                                const projectPath = Editor.Project.path;
                                //console.error("projectPath",projectPath);
                                let skUrl = skeletonUrl.replace("db:/",projectPath);
                                const idx = skUrl.lastIndexOf("/");
                                skUrl = skUrl.substring(0,idx);
                                //console.error("skUrl",skUrl);
                                let materialPath = skUrl + "/" + materialName;
                                //console.error("materialPath",materialPath);

                                //await require("fs").writeFileSync(materialPath + ".mtl",newMatStr,{ encoding: "utf-8" })
                                const idx2 = skeletonUrl.lastIndexOf("/");
                                let cocosMatPath = skeletonUrl.substring(0,idx2);
                                cocosMatPath = cocosMatPath + "/" + materialName + ".mtl";
                                let matAssetInfo = await Editor.Message.request('asset-db', 'create-asset', cocosMatPath ,newMatStr,{overwrite : true});

                                const uuid2 = await Editor.Message.request("asset-db", "query-uuid", cocosMatPath)
                                //console.error("uuid2",uuid2);
                                AssetLibrary.loadAsset(uuid2, (err, asset) => {
                                    spineTextureContainer.material = asset;
                                    pngCount--;
                                    //console.error("pngCount2",pngCount);
                                    if (pngCount == 0) {
                                        atlasComplete = true;
                                        console.log("pngCount load complete")
                                    }
                                });
                                //console.log("matStr",matStr);
                                

                            });

                            this.textures.push(spineTextureContainer);
                        });
                    });
                }
            }

        });
        while(!atlasComplete){
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.processSkeleton();

        await new Promise(resolve => setTimeout(resolve, 100));
        await new Promise(resolve => setTimeout(resolve, 100));

        this._indexBones();
        this.processPreview();

        if (!this.editorPreview) {
            this.skeletonData = null;
            this.skeleton = null;
            this.animationState = null;
            this.spineSkeleton = null;
            this.skeletonJson = null;
            this.skeletonBinary = null;
            this.atlasAttachmentLoader = null;
            this.spineAtlas = null;
        }

        // const ppp = Editor.Project.path;
        // console.log(ppp);
        // console.log(Editor);
        // console.log(Editor.Message.request);
        // console.log("nnnn", this.skeletonAsset.uuid);
        
        //await this.testEE();
        // require('fs').readFile("C:/Users/yiyao/Pictures/hero_001_frog.json", (err, data) => {
        //     if (err) {
        //         console.error(err);
        //         return;
        //     }
        //     console.log(data);
        // });
    }

    async loadAsset(uuid : string) : Promise<Asset> {
        return new Promise((resolve,reject) => {
            AssetLibrary.loadAsset(uuid, (err, asset) => {
                if (err) {
                    reject(err);
                }
                resolve(asset);
            });
        });
    }

    async loadMaterialString(matInfo){
        let matStr = require("fs").readFileSync(matInfo.file,{ encoding: "utf-8" })
        return matStr;
    }

    onLostFocusInEditor(): void {
        // 把编辑器下预览的东西删除
        // this.clearPreview();
        // this.editorPreview = false;
        // this.editorPreviewPrev = false;
    }

    start() {

        if (EDITOR && EDITOR_NOT_IN_PREVIEW) {
            return;
        }

        this.initSpine();
    }
    
    update(deltaTime: number) {

        if (EDITOR && EDITOR_NOT_IN_PREVIEW) {
            if (this.skeletonAsset) {
                if (this.skeletonUuid != this.skeletonAsset.uuid) {
                    this.skeletonUuid = this.skeletonAsset.uuid;
                    this.onFocusInEditor();
                }
            }

            //this.processSkeleton();
            this.processCmd();

            this.processPreview();

            // 找骨骼索引
            this._indexBones();
        }

        this.fixedDeltaTime = 1.0 / this.fps;
        this.accumulator += deltaTime;
    
        let steps = 0;
        let tempRenderTotalStepCount : number = -1; 
        while (this.accumulator >= this.fixedDeltaTime && steps < this.maxSteps) {
            this.fixedUpdate(this.fixedDeltaTime);
            this.accumulator -= this.fixedDeltaTime;
            steps++;

            tempRenderTotalStepCount = 1;
            this.renderStep = 0;
            if (this.accumulator < this.fixedDeltaTime) {
                if (deltaTime * 2 < this.fixedDeltaTime) {
                    tempRenderTotalStepCount = 2;
                    this.renderStep = 0;
                }
            }
        }

        if (tempRenderTotalStepCount > 0) {
            // while (this.renderTotalStepCount != -1) {
            //     // 上次的还没更新完成，不用管
            //     //this.stepRenderer();
            // }
            this.renderTotalStepCount = tempRenderTotalStepCount;
        }

        this.stepRenderer();
    }

    stepRenderer(){
        if (this.skeletonRenderer == null) {
            return;
        }

        if (this.renderTotalStepCount > 0 && this.renderStep < this.renderTotalStepCount) {
            this.renderStep++;
            this.skeletonRenderer.onUpdate(this.renderStep,this.renderTotalStepCount);
            this.syncSockets();
            if (this.renderStep == this.renderTotalStepCount) {
                this.renderTotalStepCount = -1;
            }
        }
        else{
            this.renderTotalStepCount = -1;
        }
    }


    fixedUpdate(deltaTime: number) {
        // 在这里执行你的固定时间间隔的更新
        if (this.animationState && this.skeleton) {
            this.animationState.timeScale = this.timeScale;
            this.animationState.update(deltaTime);
            this.animationState.apply(this.skeleton);
            this.skeleton.updateWorldTransform();
        }
    }

    private initSkeletonData() {

        if (this.skeletonAsset == null) {
            console.error("skeletonAsset is null");
            return false;
        }

        if (this.atlasAsset == null) {
            console.error("atlasAsset is null");
            return false;
        }

        let atlas = new TextureAtlas(this.atlasAsset);
        atlas.pages.forEach((page) => {
            let texture = this.getTexture(page.name) as Texture2D;
            if (texture) {
                page.setTexture(new SpineTexture(texture));
            }
        });
        this.spineAtlas = atlas;

        this.atlasAttachmentLoader = new AtlasAttachmentLoader(this.spineAtlas);
        if (this.skeletonAsset instanceof JsonAsset) {
            this.skeletonJson = new SkeletonJson(this.atlasAttachmentLoader);
            this.skeletonData = this.skeletonJson.readSkeletonData(this.skeletonAsset.json["spine3d"]);
        }
        else if (this.skeletonAsset instanceof BufferAsset) 
        {
            this.skeletonBinary = new SkeletonBinary(this.atlasAttachmentLoader);
            this.skeletonData = this.skeletonBinary.readSkeletonData(new Uint8Array(this.skeletonAsset.buffer()));
        }

        this.skeleton = new Skeleton(this.skeletonData);
        return true;
    }
    
    private initSpine() {

        if(!this.initSkeletonData()){
            return;
        }

        if (this.isValidSkin(this.defaultSkin)) {
            this.skeleton.setSkinByName(this.defaultSkin);
        }
        else {
            this.skeleton.setSkinByName("default");
        }

        this.animationState = new AnimationState(new AnimationStateData(this.skeletonData));
        if (this.isValidAnimation(this.animation)) {
            this.animationState.setAnimation(0, this.animation, true);
        }
        else {
            //this.animationState.setAnimation(0, "attack", true);
        }
        this.animationState.timeScale = 1.0;
        this.animationState.apply(this.skeleton);
        this.skeleton.updateWorldTransform();
        var offset = new Vector2();
        var size = new Vector2();
        this.skeleton.getBounds(offset, size, []);
        this.spineSkeleton = {
            skeleton: this.skeleton,
            state: this.animationState,
            playTime: 0,
            bounds: {
                offset: offset,
                size: size
            }
        }

        this.skeletonRenderer = this.getComponent(SkeletonRenderer);
        this.skeletonRenderer.init(this.skeleton, {textures : this.textures});
        
        if (this.sockets) {
            this._socketNodes = new Map<number, Node>();
            this.sockets.forEach((socket) => {
                this._socketNodes.set(socket.boneIndex, socket.target);
            });
        }

    }

    private syncSockets() {
        if (!(this._socketNodes == null || this._socketNodes.size == 0)) {

            const matrixHandle = (boneNode: Node, bone: Bone): void => {
                //let pos = new Vec3(bone.worldX, bone.worldY, 0);
                let boneMatrix4 = socketBoneMatrix4;
                boneMatrix4.m00 = bone.a;
                boneMatrix4.m01 = bone.c;
                boneMatrix4.m04 = bone.b;
                boneMatrix4.m05 = bone.d;
                boneMatrix4.m12 = bone.worldX;
                boneMatrix4.m13 = bone.worldY;

                let spineMatrix4 = this.node.worldMatrix;
                Mat4.multiply(tempMat4, spineMatrix4, boneMatrix4);

                let worldPos = new Vec3();
                tempMat4.getTranslation(worldPos);
                worldPos.z = boneNode.worldPosition.z;
                boneNode.worldPosition = worldPos;

                boneNode.worldRotation = tempMat4.getRotation(new Quat());
                //boneNode.worldScale = tempMat4.getScale(new Vec3());
            };

            for (const boneIdx of this.socketNodes.keys()) {
                
                const boneNode = this.socketNodes.get(boneIdx);
                //const zPos = boneNode.position.z;
                // Node has been destroy
                if (!boneNode || !boneNode.isValid) {
                    this.socketNodes.delete(boneIdx);
                    continue;
                }
                const bone = this.getSkeletonBone(boneIdx);
                // Bone has been destroy
                if (!bone) {
                    boneNode.removeFromParent();
                    boneNode.destroy();
                    this.socketNodes.delete(boneIdx);
                    continue;
                }
                matrixHandle(boneNode, bone);
                //boneNode.position = new Vec3(boneNode.position.x, boneNode.position.y, zPos);
            }
        }
    }

    private getTexture(name : string) : Asset {
        for (let i = 0; i < this.textures.length; i++) {
            const texture = this.textures[i];
            if (texture.name + ".png" == name) {
                return texture.texture;
            }
        }
        return null;
    }

    private getSkeletonBone(boneIdx : number) : Bone {
        if (this.skeleton == null) {
            return null;
        }
        return this.skeleton.bones[boneIdx];
    }


    private getCacheBoneIndex(boneName : string) : number {
        if (this._cachedSockets.has(boneName)) {
            return this._cachedSockets.get(boneName);
        }
        return -1;
    }

    private isValidSkin(skinName : string) : boolean {
        if (skinName == null || skinName === "undefined") {
            return false;
        }
        for(let i = 0; i < this.skins.length; i++) {
            if (this.skins[i] == skinName) {
                return true;
            }
        }
        return false;
    }

    private isValidAnimation(animationName : string) : boolean {
        if (animationName == null || animationName === "undefined") {
            return false;
        }
        for(let i = 0; i < this.animations.length; i++) {
            if (this.animations[i] == animationName) {
                return true;
            }
        }
        return false;
    }


    private processCmd() {
        if (this.CMD === SpineEditorCmd.None) {
            return;
        }

        switch (this.CMD) {
            // case SpineEditorCmd.ProcessSkeleton:
            //     this.processSkeleton();
            //     break;
            // case SpineEditorCmd.InitSpine:
            //     this.initSpine();
            //     break;
            case SpineEditorCmd.SetAnimation:
                this.setAnimation(this.CMDParam,true);
                break;
            case SpineEditorCmd.SetSkin:
                //this.setSkin(this.CMDParam);
                break;
            default:
                break;
        }
        this.CMD = SpineEditorCmd.None;

    }

    processPreview(){
        if (!this.editorPreviewPrev && this.editorPreview) {
            this.clearPreview();
            this.initSpine();
        }

        if (this.editorPreviewPrev && !this.editorPreview) {
            this.clearPreview();
        }

        this.editorPreviewPrev = this.editorPreview;
    }

    private processSkeleton() {
        if (this.skeletonAsset == null) {
            console.log("skeletonAsset is null");
            return;
        }
        
        this.spineAtlas = new TextureAtlas(this.atlasAsset);
        this.spineAtlas.pages.forEach((page) => {
            let texture = this.getTexture(page.name) as Texture2D;
            if (texture) {
                page.setTexture(new SpineTexture(texture));
            }
        });

        this.atlasAttachmentLoader = new AtlasAttachmentLoader(this.spineAtlas);
        if (this.skeletonAsset instanceof JsonAsset) {
            this.skeletonJson = new SkeletonJson(this.atlasAttachmentLoader);
            this.skeletonData = this.skeletonJson.readSkeletonData(this.skeletonAsset.json["spine3d"]);
        }
        else if (this.skeletonAsset instanceof BufferAsset) 
        {
            this.skeletonBinary = new SkeletonBinary(this.atlasAttachmentLoader);
            this.skeletonData = this.skeletonBinary.readSkeletonData(new Uint8Array(this.skeletonAsset.buffer()));
        }
        //console.log("processSkeleton2",this.skeletonData);
       
        this._updateSkins();
        this._updateAnimations();
        this._initBones();

    }

    // update skin list for editor
    protected _updateSkins (): void {
        if (this.skeletonData) {
            const skins = this.skeletonData.skins;
            if (skins || skins.length > 0) {
                const skinNames = new Array<string>();
                for (let i = 0; i < skins.length; i++) {
                    const name = skins[i].name;
                    if (name == null || name === "undefined") {
                        continue;
                    }
                    skinNames.push(name);
                }
                this.skins = skinNames;
            }
            else{
                console.log("skins is null");
            }

            if (this.skins.indexOf(this.defaultSkin) == -1) {
                this.defaultSkin = this.skeletonData.skins[0].name;                
            }

            let maxVertexCountMap = new Map<any, number>();
            let maxTriangleCountMap = new Map<any, number>();
            
            skins.forEach((skin) => {
                let vertexCountMap = new Map<any, number>();
                let triangleCountMap = new Map<any, number>();

                for(let i = 0; i < skin.attachments.length; i++) {

                    let attachmentMap = skin.attachments[i];

                    for (let name in attachmentMap) {
                        let attachment = attachmentMap[name];
                        if (attachment instanceof MeshAttachment) {
                            let vc = vertexCountMap.get(attachment.region.texture._image);
                            if (vc == null) {
                                vc = 0;

                            }
                            let tc = triangleCountMap.get(attachment.region.texture._image);
                            if (tc == null) {
                                tc = 0;
                            }
                            let mesh = <MeshAttachment>attachment;
                            //console.error(mesh.worldVerticesLength)
                            vc += (mesh.worldVerticesLength >> 1);
                            tc += attachment.triangles.length;

                            vertexCountMap.set(attachment.region.texture._image,vc);
                            triangleCountMap.set(attachment.region.texture._image,tc);
                        }
                        else if (attachment instanceof RegionAttachment) {
                            let vc = vertexCountMap.get(attachment.region.texture._image);
                            if (vc == null) {
                                vc = 0;
                            }
                            let tc = triangleCountMap.get(attachment.region.texture._image);
                            if (tc == null) {
                                tc = 0;
                            }
                            vc += 4;
                            tc += 6;
                            vertexCountMap.set(attachment.region.texture._image,vc);
                            triangleCountMap.set(attachment.region.texture._image,tc);
                        }
                        else{
                            //console.error(attachment);
                        }
                    }

                   
                }
                
                vertexCountMap.forEach((value,key)=>{
                    let max = maxVertexCountMap.get(key);
                    if (max == null) {
                        max = 0;
                    }
                    if (max < value) {
                        max = value;
                    }
                    maxVertexCountMap.set(key,max);
                });

                triangleCountMap.forEach((value,key)=>{
                    let max = maxTriangleCountMap.get(key);
                    if (max == null) {
                        max = 0;
                    }
                    if (max < value) {
                        max = value;
                    }
                    maxTriangleCountMap.set(key,max);
                });
                
                
            });

            for (let i = this.textures.length-1; i >= 0; i--) {
                let texture = this.textures[i];

                let maxVertexCount = maxVertexCountMap.get(texture.texture);
                if (maxVertexCount == null) {
                    maxVertexCount = 0;
                }
                texture.vertexCount = maxVertexCount;

                let maxTriangleCount = maxTriangleCountMap.get(texture.texture);
                if (maxTriangleCount == null) {
                    maxTriangleCount = 0;
                }
                texture.indicCount = maxTriangleCount; 
            }
            console.log("textures",this.textures);
        }
        else {
            console.error('Spine: no json data');
        }
    }


    protected _updateAnimations (): void {
        if (this.skeletonData) {
            const animations = this.skeletonData.animations;
            if (animations || animations.length > 0) {
                const animNames = new Array<string>();

                for (let i = 0; i < animations.length; i++) {
                    const name = animations[i].name;
                    if (name == null || name === "undefined") {
                        continue;
                    }
                    animNames.push(name);
                }
                this.animations = animNames;
            }
            else{
                console.log("animations is null");
            }

            if (this.animations.indexOf(this.animation) == -1) {
                this.animation = this.skeletonData.animations[0].name;                
            }
        }
        else {
            console.error('Spine: no json data');
        }
    }

    protected _initBones (): void {
        if (this.skeletonData) {

            const bones = this.skeletonData.bones;
            const getBoneName = (bone: BoneData): string => {
                if (bone.parent == null) return bone.name || '<Unamed>';
                let parentBone = null;
                for(let i = 0; i < bones.length; i++) {
                    if (bones[i].name === bone.parent.name) {
                        parentBone = bones[i];
                    }
                }
                let name = `${getBoneName(parentBone)}/${bone.name}`;
                //console.error(name);
                return name;
            };

            if (bones || bones.length > 0) {
                const boneNames = new Array<string>();
                for (let i = 0; i < bones.length; i++) {
                    const name = bones[i].name;
                    if (name == null || name === "undefined") {
                        continue;
                    }

                    const boneName: string = getBoneName(bones[i]);
                    this._cachedSockets.set(boneName, i);
                    boneNames.push(boneName);
                }
                this.bones = boneNames;
            }
            else{
                console.log("bones is null");
            }
        }
        else {
            console.error('Spine: no json data');
        }
    }

    protected _indexBones (): void {
        if (this._cachedSockets) {
            if (this.sockets) {
                this.sockets.forEach((socket) => {
                    let index = this.getCacheBoneIndex(socket.path);
                    if (index != -1) {
                        socket.boneIndex = index;
                    }
                });
            }
        }
    }

    private clearPreview() {
        this.getComponent(SkeletonRenderer).clear();
    }


    // --------------------------- 对外接口 ----------------------------
    /**
     * 设置动画
     * @param animationName 
     * @param loop 
     * @param trackIndex 
     */
    public setAnimation(animationName : string, loop : boolean, trackIndex : number = 0) {
        if (this.animationState) {
            this.animationState.setAnimation(trackIndex, animationName, loop);
        }
        else{
            console.error("animationState is null");
        }
    }

    // /**
    //  * 设置皮肤
    //  * @param skinName 
    //  */
    // public setSkin(skinName : string) {
    //     if (this.animationState) {
    //         //this.animationState.clearTracks();
    //         this.skeleton.setSkinByName(skinName);
    //         this.animationState.apply(this.skeleton);
    //         this.skeleton.updateWorldTransform();
    //     }
    //     else{
    //         console.error("animationState is null");
    //     }
    // }
}


