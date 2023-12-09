import { _decorator, Component, instantiate, Node, Vec3 ,sp} from 'cc'; 
const { ccclass, property } = _decorator;

@ccclass('CocosSpinePerformanceTest')
export class CocosSpinePerformanceTest extends Component {

    @property({type: Node})
    public spineNode : Node | null = null;
    @property({type: Vec3})
    public offset : Vec3 = new Vec3(50,50,50);
    @property({type: Vec3})
    public count : Vec3 = new Vec3(3,3,3);

    public skeletonArray : sp.Skeleton[] = [];

    private accumulator = 0;
    @property({type:Number, range:[15,60]})
    public fps = 30;
    @property({type:Number,range:[0.01,0.1],readonly:true})
    private fixedDeltaTime = 0.033; // 基础步长
    @property({type:Number, range:[1,10]})
    private maxSteps = 3; // 最大步数

    start() {
        let delay = 0;
        for(let x = 0; x < this.count.x; x++) {
            for(let y = 0; y < this.count.y; y++) {
                for(let z = 0; z < this.count.z; z++) {

                    setTimeout(() => {
                        let node = instantiate(this.spineNode);
                        node?.setParent(this.spineNode?.getParent());
                        node?.setPosition(this.offset.x * x, this.offset.y * y, this.offset.z * z);
                        node.active = true;
                        const sk = node.getComponent(sp.Skeleton);
                        this.skeletonArray.push(sk);
                    }, (delay++) * 10)
                }
            }
        }

    }

    update(deltaTime: number) {

        // this.fixedDeltaTime = 1.0 / this.fps;
        // this.accumulator += deltaTime;
    
        // let steps = 0;
        // while (this.accumulator >= this.fixedDeltaTime && steps < this.maxSteps) {
        //     this.fixedUpdate(this.fixedDeltaTime);
        //     this.accumulator -= this.fixedDeltaTime;
        //     steps++;
        // }
    }

    fixedUpdate(deltaTime: number) {
        // this.skeletonArray.forEach((skeleton) => {
        //     skeleton.updateAnimation(deltaTime);
        // });
    }
}


