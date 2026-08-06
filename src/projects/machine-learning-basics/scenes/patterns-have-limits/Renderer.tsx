import type {FC} from "react";
import {AbsoluteFill, interpolate} from "remotion";


type RendererProps = Readonly<{meaningId: string; sceneFrame: number}>;

const NAVY = "#101A33";
const IVORY = "#FFF7E8";
const CYAN = "#43D7E8";
const CORAL = "#FF6B6B";
const LIME = "#B7F36B";

const Renderer: FC<RendererProps> = ({meaningId, sceneFrame}) => {
  if (meaningId !== "patterns-have-limits") throw new Error("Unexpected meaningId.");
  const bias = interpolate(sceneFrame,[20,230],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const guards = interpolate(sceneFrame,[255,430],[0,3],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  return (
    <AbsoluteFill style={{backgroundColor:NAVY}}>
      <svg style={{fontSize:36}} width="100%" height="100%" viewBox="0 0 900 1470">
        <text x="450" y="105" textAnchor="middle" fill={IVORY} fontSize={64} fontWeight={850}>模型学到的是数据里的模式</text>
        <rect x="75" y="220" width="235" height="540" rx="38" fill="#192849" stroke={CYAN} strokeWidth="6" />
        <text x="192" y="290" textAnchor="middle" fill={CYAN} fontSize={46} fontWeight={850}>训练数据</text>
        {[0,1,2,3,4,5,6].map((index)=><rect key={index} x="120" y={335+index*48} width="145" height="34" rx="17" fill={index<6?CYAN:CORAL} opacity={0.35+bias*0.65} />)}
        <text x="192" y="710" textAnchor="middle" fill={CORAL} fontSize={38} fontWeight={800}>比例不均</text>
        <path d="M325 480h105" stroke={CORAL} strokeWidth="12" strokeDasharray="105" strokeDashoffset={105-105*bias} />
        <circle cx="520" cy="480" r="120" fill={LIME} opacity="0.78" />
        <text x="520" y="495" textAnchor="middle" fill={NAVY} fontSize={56} fontWeight={900}>模型</text>
        <path d="M640 480h100" stroke={CORAL} strokeWidth="12" strokeDasharray="100" strokeDashoffset={100-100*bias} />
        <g style={{fontSize:36}} opacity={bias}>
          <line x1="745" y1="390" x2="810" y2="590" stroke={CORAL} strokeWidth="12" strokeLinecap="round" />
          <line x1="700" y1="535" x2="845" y2="485" stroke={IVORY} strokeWidth="9" strokeLinecap="round" />
          <circle cx="722" cy="545" r="38" fill={CORAL} />
          <circle cx="823" cy="510" r="20" fill={CYAN} />
          <text x="770" y="680" textAnchor="middle" fill={CORAL} fontSize={40} fontWeight={850}>结果也会偏</text>
        </g>
        <rect x="75" y="820" width="750" height="480" rx="45" fill={IVORY} opacity="0.08" />
        <text x="450" y="900" textAnchor="middle" fill={IVORY} fontSize={48} fontWeight={800}>人需要持续把关</text>
        {[{label:"好数据",color:CYAN},{label:"合适目标",color:LIME},{label:"持续验证",color:IVORY}].map((item,index)=>(
          <g style={{fontSize:36}} key={item.label} opacity={interpolate(guards,[index,index+0.75],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}>
            <rect x="135" y={955+index*100} width="630" height="78" rx="28" fill={item.color} />
            <circle cx="190" cy={994+index*100} r="20" fill={NAVY} />
            <path d={`M178 ${994+index*100}l10 10 22-25`} fill="none" stroke={IVORY} strokeWidth="7" strokeLinecap="round" />
            <text x="450" y={1010+index*100} textAnchor="middle" fill={NAVY} fontSize={46} fontWeight={900}>{item.label}</text>
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

export default Renderer;
