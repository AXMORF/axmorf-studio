import React from "react";
import {AbsoluteFill, Composition, interpolate, registerRoot, useCurrentFrame} from "remotion";

const C = {paper:"#F5F0E6", white:"#FFFCF5", ink:"#292624", muted:"#62594F", accent:"#8D3E28", line:"#B8AB96", pale:"#E5D8C4"};
const font = "'PingFang SC', 'Noto Sans CJK SC', sans-serif";
const starts = [2,18,45,68,87,117];
const headlines = ["像真的，不等于有出处", "会组织语言，也会记错细节", "缺少证据时，细节可能被补齐", "评价方式，也会推动猜测", "让答案先经过证据", "看证据，而不是看口气"];
const captions = ["答案像真的，细节却没有依据。", "生成内容，不等于核对了原文。", "合理的补全，可能越过证据的边界。", "评价如果奖励猜测，也会影响回答。", "查到资料之后，还要核对是否支持。", "让结论有依据，让不确定留在画面里。"];

const Label = ({x,y,children,size=36,accent=false,anchor="start",weight=400}: {x:number;y:number;children:React.ReactNode;size?:number;accent?:boolean;anchor?:"start"|"middle"|"end";weight?:number}) => <text x={x} y={y} fill={accent?C.accent:C.ink} fontFamily={font} fontSize={size} textAnchor={anchor} fontWeight={weight}>{children}</text>;
const Stroke = ({d,accent=false,dashed=false,width=3}: {d:string;accent?:boolean;dashed?:boolean;width?:number}) => <path d={d} fill="none" stroke={accent?C.accent:C.muted} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed?"10 13":undefined}/>;
const Paper = ({x,y,w,h,rotate=0,children}: {x:number;y:number;w:number;h:number;rotate?:number;children?:React.ReactNode}) => <g transform={`translate(${x} ${y}) rotate(${rotate} ${w/2} ${h/2})`}><rect x={10} y={13} width={w} height={h} rx={4} fill={C.ink} opacity={0.06}/><path d={`M0 3 L${w} 0 L${w-2} ${h} L3 ${h-2} Z`} fill={C.white} stroke={C.line} strokeWidth={2}/>{children}</g>;
const Book = ({x,y,w=250,h=360,title="云上航海录",ghost=false}: {x:number;y:number;w?:number;h?:number;title?:string;ghost?:boolean}) => <g transform={`translate(${x} ${y})`}>
  <path d={`M0 25 L${w-25} 0 L${w} 16 L${w} ${h-15} L25 ${h} L0 ${h-20}Z`} fill={ghost?"none":C.pale} stroke={ghost?C.accent:C.muted} strokeWidth={3} strokeDasharray={ghost?"11 12":undefined}/>
  {!ghost&&<><path d={`M25 45 L${w-12} 22 L${w-12} ${h-27} L25 ${h-5}Z`} fill={C.white} stroke={C.line} strokeWidth={2}/><Stroke d={`M25 45 L25 ${h-5}`}/><Label x={47} y={102} size={42} weight={600}>{title.slice(0,3)}</Label><Label x={47} y={162} size={42} weight={600}>{title.slice(3)}</Label><Stroke d={`M49 211 L${w-37} 194`}/><Label x={48} y={h-57} size={36}>虚构示意</Label></>}
</g>;

const Citation = ({frame}: {frame:number}) => {
 const reveal=interpolate(frame,[100,155],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
 return <g>
  <Paper x={20} y={90} w={500} h={140} rotate={-4}><Label x={30} y={59} size={37}>这句话，出自哪本书？</Label><Stroke d="M32 93 L425 93"/></Paper>
  <Book x={78} y={325} w={305} h={440}/>
  <Paper x={395} y={495} w={460} h={260} rotate={4}><Label x={31} y={63} size={38}>《云上航海录》</Label><Label x={32} y={134} size={66} weight={600}>第 128 页</Label><Label x={32} y={212} size={36}>书名与页码均为虚构示意</Label></Paper>
  <Stroke d="M595 745 C620 823 572 864 475 882" dashed accent/>
  <g opacity={reveal}><circle cx={392} cy={890} r={51} fill={C.paper} stroke={C.accent} strokeWidth={3}/><Label x={392} y={907} size={56} anchor="middle" accent>?</Label><Label x={473} y={912} size={42} accent>原文在哪里？</Label></g>
  <Label x={82} y={1047} size={40}>详细的回答，仍需要证据。</Label>
 </g>;
};

const Patterns = ({frame}: {frame:number}) => {
 const shift=interpolate(frame,[110,170],[0,26],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
 return <g>
  <Paper x={55} y={60} w={242} h={210} rotate={-6}><Label x={27} y={66} size={36}>知识</Label><Stroke d="M28 99 L209 96 M28 130 L188 130 M28 162 L211 157"/></Paper>
  <Paper x={346} y={87} w={264} h={211} rotate={6}><Label x={28} y={61} size={36}>表达规律</Label><Stroke d="M28 102 L218 101 M28 139 L200 135 M28 172 L218 170"/></Paper>
  <Stroke d="M278 277 C289 341 336 363 400 386"/><Stroke d="M481 299 C488 350 479 374 447 394"/>
  <g transform={`translate(0 ${shift})`}>
   <path d="M145 502 L245 402 L643 402 L743 502 L735 690 L146 690Z" fill={C.pale} stroke={C.muted} strokeWidth={3}/>
   <rect x={230} y={436} width={436} height={170} rx={5} fill={C.white} stroke={C.muted} strokeWidth={3}/>
   <circle cx={210} cy={654} r={42} fill={C.paper} stroke={C.muted} strokeWidth={3}/><circle cx={671} cy={654} r={42} fill={C.paper} stroke={C.muted} strokeWidth={3}/>
   <Label x={448} y={507} anchor="middle" size={42} weight={600}>根据上下文生成</Label>
   <Label x={449} y={567} anchor="middle" size={37}>学习到的知识与规律</Label>
  </g>
  <Stroke d="M445 728 L445 791" accent/><Stroke d="M431 775 L445 791 L459 775" accent/>
  <Paper x={128} y={814} w={644} h={124}><Label x={322} y={76} anchor="middle" size={41}>一段连贯的回答</Label></Paper>
  <Stroke d="M158 992 L717 992" dashed/><Label x={438} y={1052} size={38} accent anchor="middle">核对原文，是另一件事。</Label>
 </g>;
};

const Gap = ({frame}: {frame:number}) => {
 const fill=interpolate(frame,[120,175],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
 return <g>
  <Stroke d="M41 203 L848 206 L841 671 L49 668Z M54 649 L838 649 M61 680 L61 735 M828 682 L828 735"/>
  {[78,166,257,626,716].map((x,i)=><g key={x}><path d={`M${x} ${315+i%2*28} L${x+64} ${310+i%2*28} L${x+64} 643 L${x} 645Z`} fill={i%2?C.pale:C.white} stroke={C.muted} strokeWidth={2}/><Stroke d={`M${x+13} ${348+i%2*28} L${x+51} ${348+i%2*28} M${x+13} 584 L${x+51} 584`}/></g>)}
  <Book x={380} y={313} w={184} h={333} ghost/>
  <Label x={470} y={431} anchor="middle" size={65} accent>?</Label><Label x={470} y={510} anchor="middle" size={36} accent>缺少</Label><Label x={470} y={563} anchor="middle" size={36} accent>证据</Label>
  <Label x={128} y={160} size={38}>已知片段</Label><Label x={645} y={160} size={38}>相似表达</Label>
  <Stroke d="M473 696 C456 755 341 776 304 820" accent dashed/>
  <g opacity={fill}><Paper x={110} y={824} w={666} h={166} rotate={-2}><Label x={35} y={64} size={43} accent>书名 · 年份 · 引文</Label><Label x={35} y={125} size={36}>可能被补齐，也可能没有原文支持。</Label></Paper></g>
  <Label x={111} y={1075} size={38}>合理补全，可能越过证据的边界。</Label>
 </g>;
};

const Incentive = () => <g>
 <Paper x={100} y={99} w={692} h={590}><Label x={40} y={83} size={48} weight={600}>一个条件式评分示意</Label><Stroke d="M42 114 L631 114"/><Label x={40} y={205} size={42}>答对</Label><Label x={618} y={205} anchor="end" size={48} accent>+1</Label><Label x={40} y={326} size={42}>承认不确定</Label><Label x={618} y={326} anchor="end" size={48}>0</Label><Stroke d="M39 380 L633 380"/><Label x={42} y={449} size={36}>如果评价这样计分，</Label><Label x={42} y={507} size={38}>猜测就可能更有吸引力。</Label></Paper>
 <Stroke d="M449 735 L449 814" accent/><Stroke d="M435 798 L449 814 L463 798" accent/><Label x={446} y={902} size={42} anchor="middle">改进评价，也要接纳不确定。</Label><Label x={444} y={986} size={36} anchor="middle">示意评分，不是真实模型测试数据</Label>
</g>;

const Retrieve = ({frame}: {frame:number}) => {
 const line=interpolate(frame,[130,200],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
 return <g>
  <Paper x={76} y={41} w={718} h={126} rotate={-2}><Label x={32} y={75} size={39}>先找资料，再核对这句话。</Label></Paper>
  <Paper x={78} y={250} w={352} h={466} rotate={-5}><Label x={31} y={66} size={40} weight={600}>原文 A</Label><rect x={30} y={211} width={285} height={43} fill={C.pale}/><Stroke d="M30 119 L298 119 M30 155 L279 154 M30 232 L303 230 M30 277 L288 276 M30 319 L290 319 M30 361 L263 361"/><Label x={31} y={431} size={36}>支持的段落</Label></Paper>
  <Paper x={449} y={292} w={341} h={406} rotate={4}><Label x={29} y={64} size={40} weight={600}>原文 B</Label><Stroke d="M30 117 L300 115 M30 152 L278 153 M30 193 L299 191 M30 239 L278 240 M30 285 L297 280"/><Label x={29} y={365} size={36}>待检查相关性</Label></Paper>
  <circle cx={399} cy={536} r={99} fill={C.white} fillOpacity={0.48} stroke={C.accent} strokeWidth={5}/><Stroke d="M328 466 L244 382" accent width={16}/>
  <path d="M242 697 C220 784 401 803 408 847" fill="none" stroke={C.accent} strokeWidth={4} pathLength={1} strokeDasharray="1" strokeDashoffset={1-line}/>
  <Paper x={104} y={851} w={678} h={190}><Label x={32} y={65} size={39}>有支持的句子 → 写入答案</Label><Label x={32} y={130} size={39} accent>没有支持的句子 → 留为不确定</Label></Paper>
  <Label x={444} y={1116} size={36} anchor="middle">文档及证据连线均为结构示意</Label>
 </g>;
};

const Evidence = ({frame}: {frame:number}) => {
 const stamp=interpolate(frame,[85,140],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
 return <g>
  <Paper x={67} y={153} w={378} h={652} rotate={-4}><Label x={33} y={77} size={44} weight={600}>回答</Label><Stroke d="M34 127 L332 127 M34 165 L307 165 M34 241 L323 241 M34 319 L316 319 M34 358 L332 358"/><path d="M34 247 L326 247" stroke={C.accent} strokeWidth={4}/><path d="M34 365 L332 365" stroke={C.line} strokeWidth={3} strokeDasharray="11 11"/><Label x={34} y={459} size={36}>有依据</Label><Label x={34} y={535} size={36} accent>仍待核实</Label></Paper>
  <Paper x={476} y={211} w={367} h={600} rotate={4}><Label x={31} y={75} size={44} weight={600}>原文</Label><rect x={28} y={223} width={302} height={42} fill={C.pale}/><Stroke d="M30 128 L332 127 M30 167 L316 167 M30 243 L333 243 M30 322 L332 322 M30 359 L316 359 M30 434 L321 434"/><Label x={30} y={533} size={36}>打开，逐句对照。</Label></Paper>
  <Stroke d="M405 403 C441 348 471 404 502 452" accent/>
  <g opacity={stamp}><Stroke d="M395 535 L425 565 L479 495" accent width={6}/><rect x={498} y={552} width={206} height={55} rx={3} fill={C.white}/><Label x={506} y={594} size={36} accent>证据支持</Label></g>
  <g transform="translate(76 931)">{["查出处","核对支持","保留不确定"].map((t,i)=><g key={t} transform={`translate(${i*255} 0)`}><circle cx={18} cy={-14} r={23} fill="none" stroke={C.accent} strokeWidth={2}/><Label x={18} y={0} size={36} anchor="middle" accent>{i+1}</Label><Label x={-12} y={63} size={37}>{t}</Label></g>)}</g>
  <Label x={447} y={1110} size={41} anchor="middle" weight={600}>让每个结论，都能找到依据。</Label>
 </g>;
};

const Storyboard = () => {
 const absoluteFrame=useCurrentFrame();
 const seconds=absoluteFrame/30;
 const index=seconds<18?0:seconds<45?1:seconds<68?2:seconds<87?3:seconds<117?4:5;
 const frame=absoluteFrame-starts[index]*30;
 const panels=[<Citation frame={frame}/>,<Patterns frame={frame}/>,<Gap frame={frame}/>,<Incentive/>,<Retrieve frame={frame}/>,<Evidence frame={frame}/>];
 return <AbsoluteFill style={{backgroundColor:C.paper,color:C.ink,fontFamily:font}}>
  <div style={{position:"absolute",left:90,top:83,fontSize:36,color:C.muted,letterSpacing:3}}>AXMORF / 知识解释</div>
  <div style={{position:"absolute",left:90,top:151,fontSize:62,fontWeight:600,letterSpacing:-1}}>AI 为什么会编造答案</div>
  <div style={{position:"absolute",left:90,top:290,fontSize:36,color:C.muted}}>{String(index+1).padStart(2,"0")} / {index<3?"理解原因":"让答案更可靠"}</div>
  <div style={{position:"absolute",left:90,top:348,fontSize:44,fontWeight:600}}>{headlines[index]}</div>
  <svg width={900} height={1150} viewBox="0 0 900 1150" style={{position:"absolute",left:90,top:431}}>{panels[index]}</svg>
  <div style={{position:"absolute",left:90,right:90,top:1646,minHeight:102,padding:"23px 30px",fontSize:40,lineHeight:1.4,textAlign:"center",borderRadius:8,backgroundColor:C.ink,color:C.white,boxSizing:"border-box"}}>{captions[index]}</div>
  <div style={{position:"absolute",left:90,bottom:67,fontSize:36,color:C.muted}}>分镜预览 · 待确认画面与节奏</div>
 </AbsoluteFill>;
};

const Root = () => <Composition id="AIHallucinationStoryboard" component={Storyboard} durationInFrames={4200} fps={30} width={1080} height={1920}/>;
registerRoot(Root);
