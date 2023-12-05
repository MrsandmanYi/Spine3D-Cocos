import { Mesh, MeshRenderer, math, primitives, utils } from "cc";
import { SpineMeshGeometry } from "./SpineMeshGeometry";



export class SpineBatcher {

    meshRenderer : MeshRenderer;

    mesh : Mesh;

    options : primitives.ICreateDynamicMeshOptions;

    geometry : primitives.IDynamicGeometry;

    currentVertexOffset : number = 0;
    currentIndicOffset : number = 0;

    constructor(vertexCount : number, indicCount : number) {
        this.options = {
            maxSubMeshes: 1,
            maxSubMeshVertices: vertexCount,
            maxSubMeshIndices: indicCount
        }

        this.geometry = {
            positions: new Float32Array(vertexCount * 3),
            normals: new Float32Array(vertexCount * 3),
            uvs: new Float32Array(vertexCount * 2),
            colors: new Float32Array(vertexCount * 4),
            indices32: new Uint32Array(indicCount),
            minPos: { x: 0, y: 0, z: 0 },
            maxPos: { x: 0, y: 0, z: 0 },
        }

        this.mesh = utils.MeshUtils.createDynamicMesh(0, this.geometry , undefined, this.options);
    }


    addGeometry(meshGeometry : SpineMeshGeometry) {
        
        //console.error("addGeometry", meshGeometry.slotName);

        let vertexOffset = this.currentVertexOffset;
        let indicOffset = this.currentIndicOffset;

        let vertexCount = meshGeometry.positions.length / 3;
        let indicCount = meshGeometry.indices32.length;

        this.geometry.positions.set(meshGeometry.positions, vertexOffset * 3);
        this.geometry.normals.set(meshGeometry.normals, vertexOffset * 3);
        this.geometry.uvs.set(meshGeometry.uvs, vertexOffset * 2);
        this.geometry.colors.set(meshGeometry.colors, vertexOffset * 4);

        for(let i = 0; i < indicCount; i++) {
            meshGeometry.indices32[i] += vertexOffset;
        }
        this.geometry.indices32.set(meshGeometry.indices32, indicOffset);

        meshGeometry.vertexOffset = vertexOffset;

        this.currentVertexOffset += vertexCount;
        this.currentIndicOffset += indicCount;
    }

    updateGeometry(vertexOffset: number, positions? : Float32Array, uvs? : Float32Array, colors? : Float32Array) {

        if (positions) {
            this.geometry.positions.set(positions, vertexOffset * 3);            
        }

        if (uvs) {
            this.geometry.uvs.set(uvs, vertexOffset * 2);
        }

        if (colors) {
            this.geometry.colors.set(colors, vertexOffset * 4);
        }
    }

    disableGeometry(vertexOffset : number, vertexCount : number) {
        for (let i = 0; i < vertexCount; i++) {
            this.geometry.positions[vertexOffset * 3 + i * 3] = 0;
            this.geometry.positions[vertexOffset * 3 + i * 3 + 1] = 0;
            this.geometry.positions[vertexOffset * 3 + i * 3 + 2] = 0;
        }
    }

    updateMesh() {

        let minPos = new math.Vec3(Infinity, Infinity, Infinity);
        let maxPos = new math.Vec3(-Infinity, -Infinity, -Infinity);

        for (let i = 0; i < this.geometry.positions.length; i += 3) {
            let x = this.geometry.positions[i];
            let y = this.geometry.positions[i + 1];
            let z = this.geometry.positions[i + 2];

            minPos.x = Math.min(minPos.x, x);
            minPos.y = Math.min(minPos.y, y);
            minPos.z = Math.min(minPos.z, z);

            maxPos.x = Math.max(maxPos.x, x);
            maxPos.y = Math.max(maxPos.y, y);
            maxPos.z = Math.max(maxPos.z, z);
        }
      
        this.geometry.minPos = minPos;
        this.geometry.maxPos = maxPos;

        this.meshRenderer.mesh.updateSubMesh(0, this.geometry);
        this.meshRenderer.onGeometryChanged();
    }

}