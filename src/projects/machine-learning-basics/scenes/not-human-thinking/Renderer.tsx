import type {FC} from "react";
import {AbsoluteFill, interpolate} from "remotion";


type RendererProps = Readonly<{meaningId: string; sceneFrame: number}>;

const NAVY = "#101A33";
const IVORY = "#FFF7E8";
const CYAN = "#43D7E8";
const CORAL = "#FF6B6B";
const LIME = "#B7F36B";

const Renderer: FC<RendererProps> = ({meaningId, sceneFrame}) => {
  if (meaningId !== "not-human-thinking") throw new Error("Unexpected meaningId.");
  const mythOpacity = interpolate(sceneFrame, [0, 65, 95], [1, 1, 0.18], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const examples = interpolate(sceneFrame, [75, 190], [0, 10], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const draw = interpolate(sceneFrame, [120, 225], [540, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const dots = [{x:150,y:1030},{x:235,y:940},{x:320,y:980},{x:395,y:850},{x:475,y:900},{x:550,y:730},{x:625,y:800},{x:705,y:620},{x:765,y:690},{x:820,y:520}];
  return (
    <AbsoluteFill style={{backgroundColor: NAVY}}>
      <svg style={{fontSize:36}} width="100%" height="100%" viewBox="0 0 900 1470">
        <rect x="95" y="120" width="710" height="255" rx="52" fill="#192849" stroke={IVORY} strokeWidth="7" />
        <circle cx="450" cy="242" r="58" fill={CYAN} opacity="0.2" />
        <rect x="382" y="205" width="136" height="78" rx="14" fill="none" stroke={CYAN} strokeWidth="8" />
        <path d="M420 306h60" stroke={CYAN} strokeWidth="8" strokeLinecap="round" />
        <g style={{fontSize:36}} opacity={mythOpacity}>
          <path d="M700 180c62-55 134 33 76 81 18 59-82 77-100 18-58-2-58-90 24-99z" fill={IVORY} opacity="0.12" stroke={IVORY} strokeWidth="5" />
          <path d="M694 181l91 97" stroke={CORAL} strokeWidth="11" strokeLinecap="round" />
          <text x="741" y="238" textAnchor="middle" fill={IVORY} fontSize={42}>思考？</text>
        </g>
        <text x="450" y="465" textAnchor="middle" fill={IVORY} fontSize={58} fontWeight={800}>不是“像人一样想”</text>
        <path d="M115 1180 C250 1160 310 1040 400 1010 S555 900 610 790 S760 710 825 490" fill="none" stroke={LIME} strokeWidth="15" strokeLinecap="round" strokeDasharray="540" strokeDashoffset={draw} />
        {dots.map((dot, index) => (
          <g style={{fontSize:36}} key={`${dot.x}-${dot.y}`} opacity={interpolate(examples, [index, index + 1], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}>
            <circle cx={dot.x} cy={dot.y} r="25" fill={CYAN} />
            <circle cx={dot.x} cy={dot.y} r="40" fill="none" stroke={CYAN} strokeWidth="4" opacity="0.25" />
          </g>
        ))}
        <text x="450" y="1325" textAnchor="middle" fill={LIME} fontSize={64} fontWeight={850}>从例子里找规律</text>
      </svg>
    </AbsoluteFill>
  );
};

export default Renderer;
