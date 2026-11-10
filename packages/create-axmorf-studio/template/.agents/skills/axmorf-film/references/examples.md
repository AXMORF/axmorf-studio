# 示例段落

下面是两种明显不同的画面方向，均是可编译的段落，不是默认模板。风格、配色和镜头要从本片内容出发；
完整声音/字幕/场景轨接线见 [导演手册](direction.md#41-用运行时接好三层动效) 与 [API](api.md)。
示例与同名 gallery 源码逐字同步，只有包入口需要时适配；示例编译测试覆盖本页全部 TSX。

## 横屏（1920×1080）：暖白底编辑插画

**配色只是示例，不是默认。** 暖白底，加陶红、叶绿与中性轮廓色，平涂的电表与纸账单，不加网格、辉光或平台。
参考方向：纸质能源账单与家用实物电表。内容理由：解释用电读数怎样变成费用，观众先认出仪表，再看它对应的纸账单。
整帧底色不算主体，桌面是可辨认的背景；电表、账单是两个主体；唯一箭头表示旁白提到的“读数换算费用”。

```markdown
风格：编辑插画；配色：暖白、陶红、叶绿；参考方向：实物电表与纸账单。
内容理由：让读数和费用的对应关系可见。
| 小节 | 帧 | 段落 | 旁白句 | 图形元素 → 代表 | L2 构图变化 | L3 重音事件 | 音效 |
| 1 | 0–48 | meter | meter | 电表 → 实测用电量；木桌 → 仪表所在的桌面（背景） | 电表读数进入视线 | — | — |
| 2 | 48–120 | bill | bill | 电表 → 用电量；账单 → 对应费用；箭头 → 读数换算费用（bill）；木桌 → 同一桌面（背景） | 纸账单落下，视线跟到金额 | f64：账单落定（示意，实际片对齐 hit） | paper |
```

示意帧不是旁白实测值，实际片按 `film:voice` / `film:music` 重写。

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Two subjects: a physical electricity meter and its paper bill. The arrow is
// the narrated conversion from measured consumption to a charge, not decoration.
export const EditorialInvoiceExample = () => {
  const frame = useCurrentFrame();
  const bill = interpolate(frame, [48, 64], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#faf5e9" }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080">
        <g data-axmorf-object="木桌桌面" data-axmorf-object-role="background">
          <path d="M0 860H1920V1080H0Z" fill="#dfccb1" />
          <path d="M0 860H1920" stroke="#483c32" strokeWidth={8} />
        </g>
        <g data-axmorf-object="实测用电量的电表">
          <rect
            x={220}
            y={270}
            width={470}
            height={530}
            rx={45}
            fill="#527c63"
          />
          <rect
            x={260}
            y={320}
            width={390}
            height={190}
            rx={12}
            fill="#faf5e9"
          />
          <text
            x={455}
            y={438}
            textAnchor="middle"
            fontSize={72}
            fill="#483c32"
          >
            128 kWh
          </text>
          <circle cx={455} cy={640} r={72} fill="#faf5e9" />
          <path
            d="M455 640L490 595"
            stroke="#483c32"
            strokeWidth={12}
            strokeLinecap="round"
          />
        </g>
        <g
          data-axmorf-object="用电量换算为费用"
          data-axmorf-object-role="relation"
          opacity={bill}
        >
          <path
            d="M770 550H1050L1020 520M1050 550L1020 580"
            fill="none"
            stroke="#b65b42"
            strokeWidth={12}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g
          data-axmorf-object="对应费用的纸账单"
          opacity={bill}
          transform={`translate(0 ${(1 - bill) * -90})`}
        >
          <path
            d="M1180 260H1650V810L1610 790L1570 810L1530 790L1490 810L1450 790L1410 810L1370 790L1330 810L1290 790L1250 810L1180 790Z"
            fill="#faf5e9"
            stroke="#b65b42"
            strokeWidth={8}
          />
          <text
            x={1415}
            y={370}
            textAnchor="middle"
            fontSize={54}
            fill="#483c32"
          >
            用电账单
          </text>
          <text
            x={1415}
            y={500}
            textAnchor="middle"
            fontSize={46}
            fill="#483c32"
          >
            128 × ¥0.50
          </text>
          <text
            x={1415}
            y={660}
            textAnchor="middle"
            fontSize={84}
            fill="#b65b42"
          >
            ¥64
          </text>
        </g>
        <text x={160} y={150} fontSize={64} fill="#483c32">
          读数怎样变成账单？
        </text>
      </svg>
    </AbsoluteFill>
  );
};
```

## 竖屏（1080×1920）：夜间观察插画

**配色只是示例，不是默认。** 深灰蓝夜空、米色月亮、陶土色望远镜，没有蓝光芯片、装饰弧线或等距平台。
参考方向：天文观测手册的侧视插画。内容理由：讲夜间观察才选择暗场；不是因为话题包含科学或 AI 就使用深色科技风。
望远镜的筒身、目镜、三脚架组成一个可辨认物体，月面圆斑是月亮的局部；两者分别包在各自标注组中。
没有旁白提到的关系线，因此不画连线；窗框与窗台是可辨认的环境。

```markdown
风格：夜间观察插画；配色：深灰蓝、米色、陶土；参考方向：天文观测手册。
内容理由：夜间场景需要暗环境，与月亮形成明度对比。
| 小节 | 帧 | 段落 | 旁白句 | 图形元素 → 代表 | L2 构图变化 | L3 重音事件 | 音效 |
| 1 | 0–24 | aim | telescope | 望远镜 → 观测工具；月亮 → 观测对象；窗框与窗台 → 室内向外的观察位置（背景） | 镜筒转向月亮 | f24：指向落定（示意） | soft-click |
| 2 | 24–120 | observe | moon | 望远镜 → 观测工具；月亮及月面斑 → 被观察的月面；窗框与窗台 → 同一观察位置（背景） | 稳住给观众辨认月面 | — | — |
```

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Dark because the content is night observation, with no glow/grid/chip motif.
export const NightObservationExample = () => {
  const frame = useCurrentFrame();
  const turn = interpolate(frame, [0, 24], [10, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#252b3a" }}>
      <svg width="100%" height="100%" viewBox="0 0 1080 1920">
        <g
          data-axmorf-object="窗框和窗台"
          data-axmorf-object-role="background"
          fill="#675547"
        >
          <path d="M40 200H80V1600H40ZM1000 200H1040V1600H1000ZM40 200H1040V240H40ZM0 1600H1080V1670H0Z" />
        </g>
        <g data-axmorf-object="被观测的月亮">
          <circle cx={760} cy={530} r={135} fill="#efe1ba" />
          <circle cx={715} cy={490} r={28} fill="#c1b396" />
          <circle cx={790} cy={555} r={45} fill="#c1b396" />
        </g>
        <g
          data-axmorf-object="观测月光的望远镜"
          transform={`rotate(${turn} 470 1250)`}
        >
          <path
            d="M470 1250L300 1600M470 1250L600 1600M470 1250V1600"
            fill="none"
            stroke="#c1b396"
            strokeWidth={22}
            strokeLinecap="round"
          />
          <path d="M270 1220L640 920L730 1030L360 1330Z" fill="#bb755a" />
          <path d="M625 905L655 880L770 1020L740 1045Z" fill="#efe1ba" />
          <path d="M270 1220L230 1250L310 1350L360 1330Z" fill="#c1b396" />
        </g>
        <text x={90} y={140} fontSize={62} fill="#efe1ba">
          为什么夜里看得更清楚？
        </text>
        <text x={115} y={1780} fontSize={42} fill="#efe1ba">
          暗环境让微弱的月面细节更易辨认
        </text>
      </svg>
    </AbsoluteFill>
  );
};
```

静音描述示例：f64「电表读数 128 kWh，经单价换算，对应纸账单 ¥64」；f24「窗边的望远镜指向月亮」。
这些描述和审片实际帧号一起写进 `review-notes.md`；如果只能说“有几个形状”，就重画。
历史 `AxiomStoryGallery` 仍供文字形变 API 回归，不作为新片美术方向。
