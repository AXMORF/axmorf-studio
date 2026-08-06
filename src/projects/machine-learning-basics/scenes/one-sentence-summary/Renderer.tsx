import type {FC} from "react";
import {AbsoluteFill, interpolate} from "remotion";


type RendererProps = Readonly<{meaningId: string; sceneFrame: number}>;

const NAVY = "#101A33";
const IVORY = "#FFF7E8";
const CYAN = "#43D7E8";
const CORAL = "#FF6B6B";
const LIME = "#B7F36B";

const Renderer: FC<RendererProps> = ({meaningId, sceneFrame}) => {
  if (meaningId !== "one-sentence-summary") throw new Error("Unexpected meaningId.");
  const progress=interpolate(sceneFrame,[5,145],[0,4],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const flow=interpolate(sceneFrame,[150,195],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const nodes=[{label:"数据",note:"很多例子",y:210,color:CYAN},{label:"训练",note:"调整并纠错",y:500,color:CORAL},{label:"模型",note:"学到的规则",y:790,color:LIME},{label:"预测",note:"面对新情况",y:1080,color:IVORY}];
  return (
    <AbsoluteFill style={{backgroundColor:NAVY}}>
      <svg style={{fontSize:36}} width="100%" height="100%" viewBox="0 0 900 1470">
        <text x="450" y="105" textAnchor="middle" fill={IVORY} fontSize={72} fontWeight={900}>机器学习，一条因果链</text>
        <path d="M450 315V1080" stroke={IVORY} strokeWidth="10" opacity="0.18" />
        {nodes.map((node,index)=>(
          <g style={{fontSize:36}} key={node.label} opacity={interpolate(progress,[index,index+0.7],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}>
            <rect x="180" y={node.y} width="540" height="180" rx="54" fill={node.color} />
            <circle cx="255" cy={node.y+90} r="42" fill={NAVY} opacity="0.22" />
            <text x="350" y={node.y+82} fill={NAVY} fontSize={58} fontWeight={900}>{node.label}</text>
            <text x="350" y={node.y+137} fill={NAVY} fontSize={38} fontWeight={700}>{node.note}</text>
          </g>
        ))}
        <circle cx="450" cy={280+flow*890} r="24" fill={NAVY} stroke={CYAN} strokeWidth="10" opacity={flow>0?1:0} />
        <text x="450" y="1360" textAnchor="middle" fill={LIME} fontSize={48} fontWeight={850}>用数据训练模型，对新情况做预测</text>
      </svg>
    </AbsoluteFill>
  );
};

export default Renderer;
