import type {FC} from "react";
import {AbsoluteFill, interpolate} from "remotion";


type RendererProps = Readonly<{meaningId: string; sceneFrame: number}>;

const NAVY = "#101A33";
const IVORY = "#FFF7E8";
const CYAN = "#43D7E8";
const CORAL = "#FF6B6B";
const LIME = "#B7F36B";

const Renderer: FC<RendererProps> = ({meaningId, sceneFrame}) => {
  if (meaningId !== "training-model-prediction") throw new Error("Unexpected meaningId.");
  const training = interpolate(sceneFrame, [15, 210], [0, 1], {extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const model = interpolate(sceneFrame, [215, 290], [0, 1], {extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const prediction = interpolate(sceneFrame, [305, 440], [0, 1], {extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  const errorWidth = 310 - training * 245;
  return (
    <AbsoluteFill style={{backgroundColor:NAVY}}>
      <svg style={{fontSize:36}} width="100%" height="100%" viewBox="0 0 900 1470">
        <text x="450" y="105" textAnchor="middle" fill={IVORY} fontSize={64} fontWeight={850}>训练：看例子，再纠正</text>
        <path d="M180 410 C180 215 720 215 720 410 C720 590 180 590 180 410" fill="none" stroke={CYAN} strokeWidth="12" strokeDasharray="30 18" strokeDashoffset={-sceneFrame*5} />
        {[0,1,2,3,4].map((index) => {
          const phase=(training*5+index)%5;
          return <circle key={index} cx={180+phase*108} cy={phase<2.5 ? 300 : 520} r="22" fill={CYAN} opacity={training} />;
        })}
        <circle cx="450" cy="415" r="155" fill={LIME} opacity={0.16+model*0.7} stroke={LIME} strokeWidth="9" />
        <text x="450" y="405" textAnchor="middle" fill={model>0.5?NAVY:IVORY} fontSize={66} fontWeight={900}>模型</text>
        <text x="450" y="465" textAnchor="middle" fill={model>0.5?NAVY:IVORY} fontSize={38}>参数逐步稳定</text>
        {[300,450,600].map((x,index)=>(
          <g style={{fontSize:36}} key={x}>
            <line x1={x} y1="640" x2={x} y2="790" stroke={IVORY} strokeWidth="8" strokeLinecap="round" />
            <circle cx={x} cy={740-index*35-training*30} r="28" fill={index===1?CORAL:CYAN} />
          </g>
        ))}
        <text x="165" y="885" fill={CORAL} fontSize={42} fontWeight={800}>错误</text>
        <rect x="285" y="842" width="310" height="50" rx="25" fill={IVORY} opacity="0.14" />
        <rect x="285" y="842" width={errorWidth} height="50" rx="25" fill={CORAL} />
        <g style={{fontSize:36}} opacity={prediction}>
          <rect x="120" y="1010" width="190" height="190" rx="34" fill="#192849" stroke={CYAN} strokeWidth="7" />
          <text x="215" y="1100" textAnchor="middle" fill={CYAN} fontSize={46} fontWeight={850}>新图片</text>
          <text x="215" y="1160" textAnchor="middle" fill={IVORY} fontSize={42}>?</text>
          <path d="M340 1105h155" stroke={LIME} strokeWidth="12" strokeLinecap="round" strokeDasharray="155" strokeDashoffset={155-155*prediction} />
          <rect x="530" y="1010" width="250" height="190" rx="34" fill={LIME} />
          <text x="655" y="1085" textAnchor="middle" fill={NAVY} fontSize={48} fontWeight={900}>预测：像猫</text>
          <rect x="570" y="1125" width="170" height="30" rx="15" fill={NAVY} opacity="0.2" />
          <rect x="570" y="1125" width={170*prediction} height="30" rx="15" fill={NAVY} />
        </g>
        <text x="450" y="1335" textAnchor="middle" fill={LIME} fontSize={56} fontWeight={850}>训练 → 模型 → 预测</text>
      </svg>
    </AbsoluteFill>
  );
};

export default Renderer;
