import { interpolate } from "remotion";

const charcoal = "#34312f";
const coral = "#e97b61";
const sage = "#78a984";
const indigo = "#4c5d9b";

const NameOriginRenderer = ({
  sceneFrame,
}: {
  readonly sceneFrame: number;
}) => {
  const questionProgress = interpolate(sceneFrame, [4, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const questionOpacity = interpolate(sceneFrame, [96, 135], [1, 0.24], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const biologicalProgress = interpolate(sceneFrame, [52, 88], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const artificialProgress = interpolate(sceneFrame, [66, 101], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const connectionProgress = interpolate(sceneFrame, [108, 145], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = interpolate(sceneFrame, [145, 154, 171], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pencilWobble = Math.sin(sceneFrame * 0.42) * 1.5;

  return (
    <svg
      aria-label="手绘问号连接生物神经元与人工神经网络"
      viewBox="0 0 900 1470"
      style={{ display: "block", height: "100%", width: "100%" }}
    >
      <g opacity={questionOpacity}>
        <path
          d="M374 235 C380 142 518 128 542 220 C565 311 444 320 444 407"
          fill="none"
          pathLength={1}
          stroke={charcoal}
          strokeDasharray="1"
          strokeDashoffset={1 - questionProgress}
          strokeLinecap="round"
          strokeWidth={22}
        />
        <path
          d="M369 239 C377 145 514 135 536 222 C558 305 438 319 439 406"
          fill="none"
          pathLength={1}
          stroke={indigo}
          strokeDasharray="1"
          strokeDashoffset={1 - questionProgress}
          strokeLinecap="round"
          strokeWidth={7}
        />
        <circle
          cx={444 + pencilWobble}
          cy={474}
          fill={charcoal}
          opacity={questionProgress}
          r={18 * questionProgress}
        />
      </g>

      <g opacity={biologicalProgress}>
        <path
          d="M294 796 C229 748 196 682 150 636 M281 815 C209 833 160 888 120 935 M287 782 C250 708 260 646 238 591 M304 821 C264 899 282 964 252 1019"
          fill="none"
          pathLength={1}
          stroke={charcoal}
          strokeDasharray="1"
          strokeDashoffset={1 - biologicalProgress}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={14}
        />
        <path
          d="M294 796 C229 748 196 682 150 636 M281 815 C209 833 160 888 120 935 M287 782 C250 708 260 646 238 591 M304 821 C264 899 282 964 252 1019"
          fill="none"
          pathLength={1}
          stroke={coral}
          strokeDasharray="1"
          strokeDashoffset={1 - biologicalProgress}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={7}
        />
        <ellipse
          cx={304 + pencilWobble}
          cy={807}
          fill={coral}
          rx={62 * biologicalProgress}
          ry={68 * biologicalProgress}
          stroke={charcoal}
          strokeWidth={12}
        />
        <circle cx={304} cy={807} fill="#f4b09d" r={22 * biologicalProgress} />
      </g>

      <g opacity={artificialProgress}>
        <path
          d="M605 690 L738 624 M605 690 L738 772 M605 888 L738 772 M605 888 L738 964 M738 624 L802 702 M738 772 L802 702 M738 772 L802 872 M738 964 L802 872"
          fill="none"
          pathLength={1}
          stroke={charcoal}
          strokeDasharray="1"
          strokeDashoffset={1 - artificialProgress}
          strokeLinecap="round"
          strokeWidth={13}
        />
        <path
          d="M605 690 L738 624 M605 690 L738 772 M605 888 L738 772 M605 888 L738 964 M738 624 L802 702 M738 772 L802 702 M738 772 L802 872 M738 964 L802 872"
          fill="none"
          pathLength={1}
          stroke={sage}
          strokeDasharray="1"
          strokeDashoffset={1 - artificialProgress}
          strokeLinecap="round"
          strokeWidth={6}
        />
        <circle
          cx={605 + pencilWobble}
          cy={690}
          fill={sage}
          r={25 * artificialProgress}
          stroke={charcoal}
          strokeWidth={9}
        />
        <circle
          cx={605 - pencilWobble}
          cy={888}
          fill={sage}
          r={25 * artificialProgress}
          stroke={charcoal}
          strokeWidth={9}
        />
        <circle
          cx={738 + pencilWobble}
          cy={624}
          fill={sage}
          r={25 * artificialProgress}
          stroke={charcoal}
          strokeWidth={9}
        />
        <circle
          cx={738 - pencilWobble}
          cy={772}
          fill={sage}
          r={25 * artificialProgress}
          stroke={charcoal}
          strokeWidth={9}
        />
        <circle
          cx={738 + pencilWobble}
          cy={964}
          fill={sage}
          r={25 * artificialProgress}
          stroke={charcoal}
          strokeWidth={9}
        />
        <circle
          cx={802 - pencilWobble}
          cy={702}
          fill={sage}
          r={25 * artificialProgress}
          stroke={charcoal}
          strokeWidth={9}
        />
        <circle
          cx={802 + pencilWobble}
          cy={872}
          fill={sage}
          r={25 * artificialProgress}
          stroke={charcoal}
          strokeWidth={9}
        />
      </g>

      <g>
        <path
          d="M366 807 C402 786 421 786 450 807"
          fill="none"
          pathLength={1}
          stroke={indigo}
          strokeDasharray="1"
          strokeDashoffset={1 - connectionProgress}
          strokeLinecap="round"
          strokeWidth={14}
        />
        <path
          d="M605 789 C545 777 500 784 450 807"
          fill="none"
          pathLength={1}
          stroke={indigo}
          strokeDasharray="1"
          strokeDashoffset={1 - connectionProgress}
          strokeLinecap="round"
          strokeWidth={14}
        />
        <circle
          cx={450}
          cy={807}
          fill={indigo}
          opacity={connectionProgress}
          r={19 + pulse * 8}
          stroke={charcoal}
          strokeWidth={7}
        />
        <circle
          cx={450}
          cy={807}
          fill="none"
          opacity={pulse * 0.72}
          r={42 + pulse * 52}
          stroke={indigo}
          strokeWidth={8}
        />
        <circle
          cx={450}
          cy={807}
          fill="none"
          opacity={pulse * 0.38}
          r={68 + pulse * 68}
          stroke={indigo}
          strokeWidth={5}
        />
      </g>
    </svg>
  );
};

export default NameOriginRenderer;
