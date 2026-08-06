import type {FC} from "react";
import {AbsoluteFill, interpolate} from "remotion";


type RendererProps = Readonly<{meaningId: string; sceneFrame: number}>;

const NAVY = "#101A33";
const IVORY = "#FFF7E8";
const CYAN = "#43D7E8";
const CORAL = "#FF6B6B";
const LIME = "#B7F36B";

const CatFace = ({cx, cy, size, stroke}: {cx: number; cy: number; size: number; stroke: string}) => (
  <g style={{fontSize:36}}>
    <path d={`M${cx-size*0.42} ${cy-size*0.15} L${cx-size*0.32} ${cy-size*0.62} L${cx-size*0.05} ${cy-size*0.38} L${cx+size*0.22} ${cy-size*0.62} L${cx+size*0.42} ${cy-size*0.12} Q${cx+size*0.48} ${cy+size*0.45} ${cx} ${cy+size*0.5} Q${cx-size*0.48} ${cy+size*0.45} ${cx-size*0.42} ${cy-size*0.15}Z`} fill="none" stroke={stroke} strokeWidth={Math.max(5, size*0.07)} strokeLinejoin="round" />
    <circle cx={cx-size*0.16} cy={cy} r={size*0.045} fill={stroke} />
    <circle cx={cx+size*0.16} cy={cy} r={size*0.045} fill={stroke} />
    <path d={`M${cx-size*0.08} ${cy+size*0.18} Q${cx} ${cy+size*0.26} ${cx+size*0.08} ${cy+size*0.18}`} fill="none" stroke={stroke} strokeWidth={Math.max(4, size*0.045)} />
  </g>
);

const Renderer: FC<RendererProps> = ({meaningId, sceneFrame}) => {
  if (meaningId !== "learn-with-cat-examples") throw new Error("Unexpected meaningId.");
  const examples = interpolate(sceneFrame, [10, 120], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const features = interpolate(sceneFrame, [125, 260], [0, 3], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const cards = [{x:85,y:245,cat:true},{x:665,y:250,cat:true},{x:80,y:985,cat:false},{x:670,y:990,cat:true}];
  return (
    <AbsoluteFill style={{backgroundColor: NAVY}}>
      <svg style={{fontSize:36}} width="100%" height="100%" viewBox="0 0 900 1470">
        <text x="450" y="105" textAnchor="middle" fill={IVORY} fontSize={66} fontWeight={850}>先看很多“有答案”的图片</text>
        {cards.map((card, index) => (
          <g style={{fontSize:36}} key={`${card.x}-${card.y}`} opacity={interpolate(examples, [index*0.18, index*0.18+0.28], [0,1], {extrapolateLeft:"clamp", extrapolateRight:"clamp"})}>
            <rect x={card.x} y={card.y} width="150" height="190" rx="26" fill="#192849" stroke={card.cat ? CYAN : CORAL} strokeWidth="6" />
            {card.cat ? <CatFace cx={card.x+75} cy={card.y+85} size={90} stroke={CYAN} /> : <circle cx={card.x+75} cy={card.y+80} r="42" fill="none" stroke={CORAL} strokeWidth="8" />}
            <text x={card.x+75} y={card.y+165} textAnchor="middle" fill={card.cat ? LIME : CORAL} fontSize={38} fontWeight={800}>{card.cat ? "猫 ✓" : "不是猫"}</text>
          </g>
        ))}
        <circle cx="450" cy="710" r="250" fill={IVORY} opacity="0.08" stroke={IVORY} strokeWidth="8" />
        <CatFace cx={450} cy={680} size={360} stroke={IVORY} />
        <g style={{fontSize:36}} opacity={interpolate(features,[0,0.8],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}>
          <path d="M335 500L190 560" stroke={CYAN} strokeWidth="7" />
          <rect x="75" y="520" width="150" height="78" rx="20" fill={CYAN} />
          <text x="150" y="573" textAnchor="middle" fill={NAVY} fontSize={42} fontWeight={850}>耳朵</text>
        </g>
        <g style={{fontSize:36}} opacity={interpolate(features,[0.9,1.8],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}>
          <path d="M620 705L760 705" stroke={CYAN} strokeWidth="7" />
          <rect x="715" y="665" width="150" height="78" rx="20" fill={CYAN} />
          <text x="790" y="718" textAnchor="middle" fill={NAVY} fontSize={42} fontWeight={850}>轮廓</text>
        </g>
        <g style={{fontSize:36}} opacity={interpolate(features,[1.9,2.8],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}>
          <path d="M430 920L430 1080" stroke={CYAN} strokeWidth="7" />
          <rect x="330" y="1050" width="200" height="78" rx="20" fill={CYAN} />
          <text x="430" y="1103" textAnchor="middle" fill={NAVY} fontSize={42} fontWeight={850}>纹理</text>
        </g>
        <text x="450" y="1320" textAnchor="middle" fill={LIME} fontSize={62} fontWeight={850}>共同特征，慢慢浮现</text>
      </svg>
    </AbsoluteFill>
  );
};

export default Renderer;
