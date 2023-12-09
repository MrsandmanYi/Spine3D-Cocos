import { _decorator, Component, instantiate, Node, Vec3 } from 'cc';
import { Spine } from '../spine3d/Spine';
import { SkeletonRenderer } from '../spine3d/SkeletonRenderer';
const { ccclass, property } = _decorator;

@ccclass('SpinePerformanceTest')
export class SpinePerformanceTest extends Component {

    @property({type: Node})
    public spineNode : Node | null = null;
    @property({type: Vec3})
    public offset : Vec3 = new Vec3(50,50,50);
    @property({type: Vec3})
    public count : Vec3 = new Vec3(3,3,3);
    @property({type: Number})
    public fps : number = 30;

    start() {

        let delay = 0;

        for(let x = 0; x < this.count.x; x++) {
            for(let y = 0; y < this.count.y; y++) {
                for(let z = 0; z < this.count.z; z++) {
                    setTimeout(() => {
                        let node = instantiate(this.spineNode);
                        node?.setParent(this.spineNode?.getParent());
                        node?.setPosition(this.offset.x * x, this.offset.y * y, this.offset.z * z);
                        node.getComponent(Spine).fps = this.fps;
                        node.active = true;
                    }, (delay++) * 10)
                }
            }
        }

    }

    update(deltaTime: number) {
        
    }
}


