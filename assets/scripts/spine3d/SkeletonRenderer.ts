import { Material, geometry, gfx } from 'cc';
import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;
import { Skeleton } from '@spine-core/Skeleton';
import { SkeletonClipping } from '@spine-core/SkeletonClipping';
import { RegionAttachment } from '@spine-core/attachments/RegionAttachment';
import { Color, NumberArrayLike, Utils } from '@spine-core/Utils';
import { Texture } from '@spine-core/Texture';
import { MeshAttachment } from '@spine-core/attachments/MeshAttachment';
import { primitives } from 'cc';
import { utils } from 'cc';
import { MeshRenderer } from 'cc';
import { EDITOR, EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { PREVIEW_NODE_NAME, SpineTextureContainer } from './SpineInterface';
import { Vec3 } from 'cc';
import { SpineMeshGeometry } from './SpineMeshGeometry';
import { SpineBatcher } from './SpineBatcher';
import { Slot } from '@spine-core/Slot';
import { Attachment } from '@spine-core/attachments/Attachment';

export class DynamicGeometryInfo{

    private _lastActive : boolean;

    constructor(){
        this._lastActive = true;
    }

    get lastActive() : boolean{
        return this._lastActive;
    }
    set lastActive(value : boolean){
        this._lastActive = value;
    }

    index : number = 0;
    geometry : primitives.IDynamicGeometry = null;
    meshRenderer : MeshRenderer = null;
    drawRangeInfo : gfx.DrawInfo = null;
    spineBatcher : SpineBatcher = null;
    lastColor : Color = new Color(0,0,0,0);
    finalColorChanged : boolean = true;
}

@ccclass('SkeletonRenderer')
export class SkeletonRenderer extends Component{

    //static QUAD_TRIANGLES : Uint32Array = new Uint32Array([0, 1, 2, 2, 3, 0]);

    static Disable_Geometry: primitives.IDynamicGeometry = {
        positions: new Float32Array(0),
        indices32: new Uint32Array(0)
    }

    protected skeleton : Skeleton = null;
    
    protected clipper: SkeletonClipping = new SkeletonClipping();

    @property({type:Number, range:[0.01,2,0.01]})
    protected meshOffset = 0.2;
    @property({type:Boolean})
    protected twoColorTint : boolean = false;
    @property({type:Boolean})
    protected premultipliedAlpha = false;
    @property({type:Boolean})
    protected isBatch = true;
    @property({type:Boolean})
    protected isChangeUVs = false;

    @property({type:Number, readonly:true})
    protected drawCallCount : number = 0;
    @property({type:Number, readonly:true})
    protected triangleCount : number = 0;
    @property({type:Number, readonly:true})
    protected vertexCount : number = 0;

    protected textures : SpineTextureContainer[] = [];

    protected dMeshGeometries: primitives.IDynamicGeometry[] = [];
    protected dMeshGeometryMap = new Map<Attachment, DynamicGeometryInfo>();

    protected slot2AttachmentMap = new Map<Slot, Attachment>();   // 当前显示的Attachment

    protected spineBatcherMap = new Map<string, SpineBatcher>();

    protected vertexSize = 3;

    protected previewNode : Node = null;
    // DEBUG
    // @property(CameraComponent)
    // cameraComp: CameraComponent = null!
    // mainCamera : renderer.scene.Camera;
    // @property(Boolean)
    // private showBoundingBox = true;
    // @property(CCColor)
    // private boundingBoxColor = new CCColor(255, 255, 255, 255);

    protected onLoad(): void {
        // if (this.cameraComp) {
        //     this.mainCamera = this.cameraComp.camera;
        //     this.mainCamera.initGeometryRenderer();
        // }
    }

    init(skeleton : Skeleton, params : {textures : SpineTextureContainer[]}){

        if (EDITOR && EDITOR_NOT_IN_PREVIEW) {
            // 非运行模式下
            this.previewNode = new Node(PREVIEW_NODE_NAME);
            this.previewNode.parent = this.node;
        }

        this.skeleton = skeleton;
        this.textures = params.textures;

        if (this.isBatch) {
            this.textures.forEach((value, index) => {
                let spineBatcher = new SpineBatcher(value.vertexCount,value.indicCount);
                let rendererNode = new Node(value.name + "_renderer");
                if (EDITOR && EDITOR_NOT_IN_PREVIEW) {
                    rendererNode.parent = this.previewNode;
                }
                else{
                    rendererNode.parent = this.node;
                }
                rendererNode.setWorldPosition(this.node.worldPosition);
                let renderer : MeshRenderer = rendererNode.addComponent(MeshRenderer);
                renderer.mesh = spineBatcher.mesh;
                renderer.sharedMaterials = new Array(1).fill(value.material);
                spineBatcher.meshRenderer = renderer;
                this.spineBatcherMap.set(value.texture.uuid,spineBatcher);
            });
    
            let slots = skeleton.slots;
            for (let i = 0, n = slots.length; i < n; i++) {
                let slot = slots[i];
                let spineMeshGeometry = this.getMeshData(slot, i);
                if (spineMeshGeometry == null) {
                    continue;
                }
                let spineBatcher = this.spineBatcherMap.get(spineMeshGeometry.texture.getImage().uuid);
                if (spineBatcher == null) {
                    continue;
                }
                spineBatcher.addGeometry(spineMeshGeometry);

                let gInfo = new DynamicGeometryInfo();
                gInfo.index = this.dMeshGeometries.length - 1;
                gInfo.geometry = spineMeshGeometry;
                gInfo.meshRenderer = spineBatcher.meshRenderer;
                gInfo.spineBatcher = spineBatcher;
                this.dMeshGeometryMap.set(slot.getAttachment(),gInfo);
                this.slot2AttachmentMap.set(slot,slot.getAttachment());
            }

            this.spineBatcherMap.forEach((value, key) => {
                value.updateMesh();
            });
        }
        else{
            // 根据Slot创建动态Mesh，一个Slot创建一个子Mesh
            let slots = skeleton.slots;
            for (let i = 0, n = slots.length; i < n; i++) {
                let slot = slots[i];
                if(this.createMeshGeometry(slot, i)!=null){
                    
                }
            }

            this.dMeshGeometryMap.forEach((value, key) => {
                value.meshRenderer.onGeometryChanged();
            });
        }


    }

    clear(){
        if (!this.dMeshGeometryMap) {
            return;
        }
        this.dMeshGeometryMap.forEach((value, key) => {
            if (value.meshRenderer && value.meshRenderer.node) {
                value.meshRenderer.node.destroy();
                value.meshRenderer = null;           
            }
        });
        this.dMeshGeometryMap.clear();
        this.dMeshGeometries.splice(0,this.dMeshGeometries.length);

        this.spineBatcherMap.clear();

        if (EDITOR && EDITOR_NOT_IN_PREVIEW) {
            if (this.node.getChildByName(PREVIEW_NODE_NAME)) {
                this.node.getChildByName(PREVIEW_NODE_NAME).destroy();   
            }
        }
    }

    private createMeshGeometry(slot : Slot, drawOrder : number) : DynamicGeometryInfo{
        const vertexSize = this.vertexSize;
        let skeleton = this.skeleton;

        let spineMeshGeometry = this.getMeshData(slot, drawOrder);
        if (spineMeshGeometry == null) {
            return null;
        }

        let rendererNode = new Node(slot.getAttachment().name + "_renderer");
        if (EDITOR && EDITOR_NOT_IN_PREVIEW) {
            rendererNode.parent = this.previewNode;
        }
        else{
            rendererNode.parent = this.node;
        }
        rendererNode.setWorldPosition(this.node.worldPosition);


        let options: primitives.ICreateDynamicMeshOptions = {
            maxSubMeshes: 1,
            maxSubMeshVertices: spineMeshGeometry.positions.length / vertexSize,
            maxSubMeshIndices: spineMeshGeometry.indices32.length
        };

        let renderer : MeshRenderer = rendererNode.addComponent(MeshRenderer);
        if (spineMeshGeometry.texture!=null) {
            for(let i = 0, n = this.textures.length; i < n; i++){
                if (this.textures[i].texture.uuid == spineMeshGeometry.texture.getImage().uuid) {
                    renderer.sharedMaterials = new Array(1).fill(this.textures[i].material);
                    break;
                }
            }    
        }

        let geometry : primitives.IDynamicGeometry = {
            positions: spineMeshGeometry.positions,
            normals: spineMeshGeometry.normals,
            uvs: spineMeshGeometry.uvs,
            indices32: spineMeshGeometry.indices32,
            colors: spineMeshGeometry.colors,
            minPos : spineMeshGeometry.minPos,
            maxPos : spineMeshGeometry.maxPos
        };

        const mesh = utils.MeshUtils.createDynamicMesh(0, geometry , undefined, options);
        renderer.mesh = mesh;
        mesh.updateSubMesh(0, geometry);

        this.dMeshGeometries.push(geometry);
        if (slot.data) {
            let gInfo = new DynamicGeometryInfo();
            gInfo.index = this.dMeshGeometries.length - 1;
            gInfo.geometry = geometry;
            gInfo.meshRenderer = renderer;
            this.dMeshGeometryMap.set(slot.getAttachment(),gInfo); 
            this.slot2AttachmentMap.set(slot,slot.getAttachment());  
            return gInfo;            
        }
        else {
            console.error("Slot data is null");
        }
        return null;
    }

    // TODO 现在会产生两倍的顶点内存，要使用索引来优化
    protected getMeshData(slot, drawOrder : number) :  SpineMeshGeometry{

        const vertexSize = this.vertexSize;
        let skeleton = this.skeleton;

        let attachment = slot.getAttachment();
        if (attachment == null ) {
            //console.error("Slot attachment is null");
            return null;
        }

        if (!(attachment instanceof RegionAttachment) && !(attachment instanceof MeshAttachment)) {
            // 裁剪组件暂不支持，性能消耗大。
            console.error("Slot attachment not supported: " + attachment + " (" + attachment.name + ")");
            return null;
        }
      
        let sVertices: Float32Array;
        let sNumVertices : number;
        let sNumFloats : number;
        let sTriangles: Uint32Array;
        let sUVs : Float32Array;
        let sTexture : Texture;
        let sAttachmentColor : Color;

        if (attachment instanceof RegionAttachment) {
            let region = <RegionAttachment>attachment;
            sVertices = Utils.newFloatArray(vertexSize * 4) as Float32Array;  // TODO 索引优化
            region.computeWorldVertices(slot,sVertices, 0, vertexSize);
            sNumVertices = 4;
            sNumFloats = vertexSize << 2;
            sTriangles =  new Uint32Array([0, 1, 2, 2, 3, 0]);
            sUVs = region.uvs as Float32Array;
            sTexture = region.region.texture;
            sAttachmentColor = region.color;
        }
        else if (attachment instanceof MeshAttachment) {
            let mesh = <MeshAttachment>attachment;
            sNumVertices = mesh.worldVerticesLength >> 1;
            sNumFloats = sNumVertices * vertexSize;
            sVertices = Utils.newFloatArray(sNumFloats) as Float32Array; // TODO 索引优化
            mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, sVertices, 0, vertexSize);
            sTriangles = new Uint32Array(mesh.triangles);
            sUVs = mesh.uvs as Float32Array;
            sTexture = mesh.region.texture;
            sAttachmentColor = mesh.color;
        }

        let finalColor = new Color(1,1,1,1);
        let darkColor = new Color(1,1,1,1);    // TODO 背面颜色
        let slotBlendMode = slot.data.blendMode;  // TODO 需要改变材质的渲染模式

        let texExists = false;

        if (sTexture) {
            texExists = true;
            //console.error(sTexture.getImage());

            let slotColor = slot.color;
            finalColor.r = sAttachmentColor.r * slotColor.r * skeleton.color.r;
            finalColor.g = sAttachmentColor.g * slotColor.g * skeleton.color.g;
            finalColor.b = sAttachmentColor.b * slotColor.b * skeleton.color.b;
            finalColor.a = sAttachmentColor.a * slotColor.a * skeleton.color.a;
            
            if (this.premultipliedAlpha) {
                finalColor.r *= finalColor.a;
                finalColor.g *= finalColor.a;
                finalColor.b *= finalColor.a;
            }

            if (!slot.darkColor)
                darkColor.set(0, 0, 0, 1.0);
            else {
                if (this.premultipliedAlpha) {
                    darkColor.r = slot.darkColor.r * finalColor.a;
                    darkColor.g = slot.darkColor.g * finalColor.a;
                    darkColor.b = slot.darkColor.b * finalColor.a;
                } else {
                    darkColor.setFromColor(slot.darkColor);
                }
                darkColor.a = this.premultipliedAlpha ? 1.0 : 0.0;
            }
        }
        
        if (slot.bone && slot.bone.active == false) {
            finalColor.a = 0;
        }

        let normals = new Float32Array(sVertices.length);
        normals.fill(0);

        let colors = new Float32Array((sVertices.length / vertexSize) * 4);
        colors.fill(1);

        let pIdx = 0; 
        for(let j = 0, m = sVertices.length / vertexSize; j < m; j++){
            normals[pIdx] = 0;
            pIdx++;
            normals[pIdx] = 0;
            pIdx++;
            sVertices[pIdx] = -this.meshOffset * drawOrder;  // 加个偏移防止深度冲突
            normals[pIdx] = 1;
            pIdx++;

            colors[j] = finalColor.r;
            colors[j+1] = finalColor.g;
            colors[j+2] = finalColor.b;
            colors[j+3] = finalColor.a;
        }

        let minMax = this.getMinMaxPos(sVertices,vertexSize);

        return {
            
            positions: sVertices,
            normals: normals,
            uvs: sUVs,
            indices32: sTriangles,
            colors: colors,
            
            vertexOffset : 0,
            
            minPos: minMax.minPos,
            maxPos: minMax.maxPos,
            
            texture : sTexture
        };
    }


    onUpdate(currentStep : number = 1, totalStep : number = 1): void {

        this.updateSkeleton(currentStep,totalStep);

        // if (this.mainCamera) {
        //     const meshRenderer = this.meshRenderer;
        //     const worldBound = meshRenderer.model!.worldBounds;
        //     if (worldBound) {
        //         let renderer = this.mainCamera.geometryRenderer;
        //         renderer.addBoundingBox(worldBound, this.boundingBoxColor, true, true, false);
        //     }    
        // }
    }


    updateSkeleton(currentStep : number = 1, totalStep : number = 1) {
        if (!this.skeleton) {
            console.error("skeleton is null");
            return;
        }

        const vertexSize = this.vertexSize;

        let slots = this.skeleton.drawOrder;
        let geometryInfo = null;

        let beginIndex = Math.floor((slots.length / totalStep) * (currentStep - 1));
        let endIndex = Math.ceil((slots.length / totalStep) * currentStep);
        endIndex = Math.min(endIndex,slots.length);

        let updateSlotCount = 0

        for (let i = beginIndex, n = endIndex; i < n; i++) { 
            geometryInfo = null;
            let slot = slots[i];
            if (slot == null) {
                console.error(`slot ${i} is null`);
                continue;
            }


            const drawOrder = i;
            let attachment = slot.getAttachment();
            if (attachment) {
                geometryInfo = this.dMeshGeometryMap.get(slot.getAttachment());
            }

            const lastAttachment = this.slot2AttachmentMap.get(slot);
            if (lastAttachment && attachment != lastAttachment) {
                
                const lastDynamicGeometry =  this.dMeshGeometryMap.get(lastAttachment);
                if (lastDynamicGeometry) {
                    lastDynamicGeometry.lastActive = false;
                    if (!this.isBatch) {
                        // if (lastDynamicGeometry.meshRenderer) {
                        //     lastDynamicGeometry.meshRenderer.mesh.updateSubMesh(0, SkeletonRenderer.Disable_Geometry);
                        // }
                    }
                    else{
                        lastDynamicGeometry.spineBatcher.disableGeometry((lastDynamicGeometry.geometry as SpineMeshGeometry).vertexOffset,
                        lastDynamicGeometry.geometry.positions.length / vertexSize);
                    }
                }
            }

            if (attachment && attachment != lastAttachment) {
                this.slot2AttachmentMap.set(slot,attachment);                
            }

            if (geometryInfo) {
                let gActive = geometryInfo.lastActive;

                if (attachment == null) {
                    if (geometryInfo.lastActive == false) {
                        continue;
                    }
                }

                if(slot.bone){
                    if (slot.bone.active == false) {
                        if (geometryInfo.lastActive == false) {
                            continue;                        
                        }
                    }
                    geometryInfo.lastActive = slot.bone.active;
                }
    
                if (slot.bone) {
                    geometryInfo.lastActive = attachment!= null && slot.bone.active;              
                }
                else{
                    geometryInfo.lastActive = attachment!= null;
                }

                if (geometryInfo && geometryInfo.lastActive == false && gActive == true) {
                    //let geometry = geometryInfo.geometry;
                    // for(let j = 0, m = geometry.colors.length; j < m; j+=4){
                    //     geometry.colors[j+3] = 0;
                    // }
                    geometryInfo.meshRenderer.mesh.updateSubMesh(0, SkeletonRenderer.Disable_Geometry);
                    continue;
                }
            }


            if (geometryInfo == null && !(attachment instanceof RegionAttachment) && !(attachment instanceof MeshAttachment)) {
                // 裁剪组件暂不支持，性能消耗大。
                //console.error("Slot attachment not supported: " + attachment + " (" + attachment.name + ")");
                continue;
            }

            if (geometryInfo == null) {
                //console.error(`Slot data ${this.getAttachUniqueName(slot)} not found`); 
                if (!this.isBatch) {
                    this.createMeshGeometry(slot, drawOrder);                    
                }
                else{
                    let spineMeshGeometry = this.getMeshData(slot, drawOrder);
                    if (spineMeshGeometry == null) {
                        continue;
                    }
                    let spineBatcher = this.spineBatcherMap.get(spineMeshGeometry.texture.getImage().uuid);
                    if (spineBatcher == null) {
                        continue;
                    }
                    spineBatcher.addGeometry(spineMeshGeometry);
                    let gInfo = new DynamicGeometryInfo();
                    gInfo.index = this.dMeshGeometries.length - 1;
                    gInfo.geometry = spineMeshGeometry;
                    gInfo.meshRenderer = spineBatcher.meshRenderer;
                    gInfo.spineBatcher = spineBatcher;
                    this.dMeshGeometryMap.set(slot.getAttachment(),gInfo);
                    this.slot2AttachmentMap.set(slot,slot.getAttachment());
                }
                
                continue;
            }


            let geometry = geometryInfo.geometry;
            let sAttachmentColor : Color;
            let sTexture : Texture;

            

            if (attachment instanceof RegionAttachment) {
                let region = <RegionAttachment>attachment;
                region.computeWorldVertices(slot, geometry.positions, 0, vertexSize);
                sTexture = region.region.texture;
                sAttachmentColor = region.color;
            }
            else if (attachment instanceof MeshAttachment) {
                let mesh = <MeshAttachment>attachment;
                mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, geometry.positions, 0, vertexSize);
                sTexture = mesh.region.texture;
                sAttachmentColor = mesh.color;
            }

            let finalColor = new Color(1,1,1,1);
            let darkColor = new Color(1,1,1,1);    // TODO 背面颜色
            let slotBlendMode = slot.data.blendMode;  // TODO 需要改变材质的渲染模式

            let finalColorChanged = false;

            if (sTexture) {
                
                let slotColor = slot.color;
                finalColor.r = sAttachmentColor.r * slotColor.r * this.skeleton.color.r;
                finalColor.g = sAttachmentColor.g * slotColor.g * this.skeleton.color.g;
                finalColor.b = sAttachmentColor.b * slotColor.b * this.skeleton.color.b;
                finalColor.a = sAttachmentColor.a * slotColor.a * this.skeleton.color.a;

                if (this.premultipliedAlpha) {
                    finalColor.r *= finalColor.a;
                    finalColor.g *= finalColor.a;
                    finalColor.b *= finalColor.a;
                }

				if (!slot.darkColor)
					darkColor.set(0, 0, 0, 1.0);
				else {
					if (this.premultipliedAlpha) {
						darkColor.r = slot.darkColor.r * finalColor.a;
						darkColor.g = slot.darkColor.g * finalColor.a;
						darkColor.b = slot.darkColor.b * finalColor.a;
					} else {
						darkColor.setFromColor(slot.darkColor);
					}
					darkColor.a = this.premultipliedAlpha ? 1.0 : 0.0;
				}

                if (geometryInfo.lastColor.r != finalColor.r || 
                    geometryInfo.lastColor.g != finalColor.g || 
                    geometryInfo.lastColor.b != finalColor.b || 
                    geometryInfo.lastColor.a != finalColor.a) {

                    finalColorChanged = true;
                }

                if (finalColorChanged) {
                    for(let j = 0, m = geometry.colors.length; j < m; j+=4){
                        geometry.colors[j] = finalColor.r;
                        geometry.colors[j+1] = finalColor.g;
                        geometry.colors[j+2] = finalColor.b;
                        geometry.colors[j+3] = finalColor.a;
                    }
                }
            }
            geometryInfo.finalColorChanged = finalColorChanged;

            if (!this.isBatch) {
                if(geometryInfo.lastActive == false){
                    finalColor.a = 0;
                }
            }

            for(let j = 0, m = geometry.positions.length / vertexSize; j < m; j++){
                geometry.positions[j*vertexSize + 2] = -this.meshOffset * drawOrder;  // 加个偏移防止深度冲突
            }

            let minMax = this.getMinMaxPos(geometry.positions,vertexSize);
            geometry.minPos = minMax.minPos;
            geometry.maxPos = minMax.maxPos;

            //this.meshRenderer.mesh.updateSubMesh(geometryInfo.index, geometry);
            updateSlotCount++;

            if (this.isBatch) {
                const spineMeshGeometry : SpineMeshGeometry= geometryInfo.geometry as SpineMeshGeometry;
                if (geometryInfo.lastActive) {
                    if (!this.isChangeUVs && !geometryInfo.finalColorChanged) {
                        geometryInfo.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,null,null);
                    }
                    else if (!this.isChangeUVs && geometryInfo.finalColorChanged) {
                        geometryInfo.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,null,spineMeshGeometry.colors);
                    }
                    else if(this.isChangeUVs && !geometryInfo.finalColorChanged){
                        geometryInfo.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,spineMeshGeometry.uvs,null);
                    }
                    else{
                        geometryInfo.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,spineMeshGeometry.uvs,spineMeshGeometry.colors);
                    }
                }
                else{
                    //console.error("disableGeometry",spineMeshGeometry.slotName);
                    geometryInfo.spineBatcher.disableGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions.length / vertexSize);
                }

                // triangleCount += value.geometry.indices32.length / 3;
                // vertexCount += value.geometry.positions.length / vertexSize;
            }

        
           
        }

        //console.error(`step ${currentStep} updateSlotCount ${updateSlotCount}`);

        if (currentStep == totalStep) {
            let drawCall = 0;
            let triangleCount = 0;
            let vertexCount = 0;

            if (!this.isBatch) {
                
                this.dMeshGeometryMap.forEach((value, key) => {
                    if (value.lastActive) {
                        if (value.meshRenderer.enabled == false) {
                            value.meshRenderer.enabled = true;
                        }
                        value.meshRenderer.mesh.updateSubMesh(0, value.geometry);
                        value.meshRenderer.onGeometryChanged();
                        drawCall++;
                        triangleCount += value.geometry.indices32.length / 3;
                        vertexCount += value.geometry.positions.length / vertexSize;
                    }
                    else{
                        if (value.meshRenderer.enabled == true) {
                            value.meshRenderer.enabled = false;
                        }
                    }
                
                });

            }
            else{
                // this.dMeshGeometryMap.forEach((value, key) => {
                //     const spineMeshGeometry : SpineMeshGeometry= value.geometry as SpineMeshGeometry;
                //     if (value.lastActive) {
                //         if (!this.isChangeUVs && !value.finalColorChanged) {
                //             value.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,null,null);
                //         }
                //         else if (!this.isChangeUVs && value.finalColorChanged) {
                //             value.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,null,spineMeshGeometry.colors);
                //         }
                //         else if(this.isChangeUVs && !value.finalColorChanged){
                //             value.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,spineMeshGeometry.uvs,null);
                //         }
                //         else{
                //             value.spineBatcher.updateGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions,spineMeshGeometry.uvs,spineMeshGeometry.colors);
                //         }
                //     }
                //     else{
                //         //console.error("disableGeometry",spineMeshGeometry.slotName);
                //         value.spineBatcher.disableGeometry(spineMeshGeometry.vertexOffset,spineMeshGeometry.positions.length / vertexSize);
                //     }
                
                //     triangleCount += value.geometry.indices32.length / 3;
                //     vertexCount += value.geometry.positions.length / vertexSize;
                // });

                this.spineBatcherMap.forEach((value, key) => {
                    drawCall++;
                    value.updateMesh();
                });
            }

            this.drawCallCount = drawCall;
            this.triangleCount = triangleCount;
            this.vertexCount = vertexCount;
        }
    }

    getMinMaxPos(sVertices,vertexSize) : {minPos : Vec3, maxPos : Vec3}{
        let maxPos = new Vec3(Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY);
        let minPos = new Vec3(Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY);
        for(let j = 0, m = sVertices.length / vertexSize; j < m; j++){
            let x = sVertices[j*vertexSize];
            let y = sVertices[j*vertexSize + 1];
            let z = sVertices[j*vertexSize + 2];
            if (x < minPos.x) {
                minPos.x = x;
            }
            if (y < minPos.y) {
                minPos.y = y;
            }
            if (z < minPos.z) {
                minPos.z = z;
            }
            if (x > maxPos.x) {
                maxPos.x = x;
            }
            if (y > maxPos.y) {
                maxPos.y = y;
            }
            if (z > maxPos.z) {
                maxPos.z = z;
            }
        }
        return {minPos : minPos, maxPos : maxPos};
    }

    updateSubMesh() : void{
        //this.meshRenderer.mesh.readAttribute(0, 'a_position',);
        // accessAttribute // 如果在数据传递时出现性能问题，可能需要将这个C++方法暴露出来，直接访问buffer
    }


}
