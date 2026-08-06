import type {FC} from "react";
import {AbsoluteFill, interpolate} from "remotion";


type RendererProps = Readonly<{meaningId: string; sceneFrame: number}>;

const NAVY = "#101A33";
const IVORY = "#FFF7E8";
const CYAN = "#43D7E8";
const CORAL = "#FF6B6B";
const LIME = "#B7F36B";

const Renderer: FC<RendererProps> = ({meaningId, sceneFrame}) => {
  if (meaningId !== "rules-versus-examples") throw new Error("Unexpected meaningId.");
  const upper = interpolate(sceneFrame, [20, 125], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const lower = interpolate(sceneFrame, [145, 285], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const exampleXs = [160, 240, 320, 400];
  return (
    <AbsoluteFill style={{backgroundColor: NAVY}}>
      <svg style={{fontSize:36}} width="100%" height="100%" viewBox="0 0 900 1470">
        <text x="450" y="105" textAnchor="middle" fill={IVORY} fontSize={68} fontWeight={850}>两种做法，顺序相反</text>
        <rect x="70" y="180" width="760" height="465" rx="48" fill="#192849" stroke={CORAL} strokeWidth="6" />
        <text x="120" y="255" fill={CORAL} fontSize={48} fontWeight={800}>传统程序</text>
        <rect x={110 + upper * 50} y="330" width="210" height="130" rx="28" fill={IVORY} opacity={upper} />
        <text x={215 + upper * 50} y="410" textAnchor="middle" fill={NAVY} fontSize={48} fontWeight={800}>人写规则</text>
        <path d="M390 395h120" stroke={CORAL} strokeWidth="12" strokeLinecap="round" strokeDasharray="120" strokeDashoffset={120 - 120 * upper} />
        <rect x="535" y="325" width="225" height="145" rx="30" fill="none" stroke={IVORY} strokeWidth="7" />
        <text x="648" y="415" textAnchor="middle" fill={IVORY} fontSize={46} fontWeight={700}>电脑执行</text>
        <text x="450" y="575" textAnchor="middle" fill={IVORY} fontSize={42}>规则 → 执行 → 结果</text>
        <rect x="70" y="710" width="760" height="600" rx="48" fill="#152D42" stroke={CYAN} strokeWidth="6" />
        <text x="120" y="785" fill={CYAN} fontSize={48} fontWeight={800}>机器学习</text>
        {exampleXs.map((x, index) => (
          <g style={{fontSize:36}} key={x} opacity={interpolate(lower, [index * 0.15, index * 0.15 + 0.3], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}>
            <rect x={x} y="870" width="58" height="74" rx="12" fill={CYAN} opacity="0.25" stroke={CYAN} strokeWidth="4" />
            <circle cx={x + 29} cy="907" r="12" fill={CYAN} />
          </g>
        ))}
        <text x="315" y="1015" textAnchor="middle" fill={IVORY} fontSize={44} fontWeight={700}>数据 + 答案</text>
        <path d="M485 910h95" stroke={CYAN} strokeWidth="12" strokeLinecap="round" strokeDasharray="95" strokeDashoffset={95 - 95 * lower} />
        <rect x="610" y="840" width="155" height="150" rx="75" fill={LIME} opacity={0.2 + lower * 0.8} />
        <text x="688" y="925" textAnchor="middle" fill={NAVY} fontSize={42} fontWeight={850}>归纳</text>
        <rect x="260" y="1080" width="380" height="115" rx="28" fill={LIME} opacity={lower} />
        <text x="450" y="1152" textAnchor="middle" fill={NAVY} fontSize={50} fontWeight={850}>电脑找出规则</text>
        <text x="450" y="1255" textAnchor="middle" fill={IVORY} fontSize={42}>例子 → 归纳 → 规则</text>
      </svg>
    </AbsoluteFill>
  );
};

export default Renderer;
