const ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "filter",
  "feGaussianBlur",
  "feOffset",
  "feBlend",
  "feComposite",
  "feColorMatrix",
  "feFlood",
  "feMerge",
  "feMergeNode",
  "feTurbulence",
  "title",
  "desc",
  "text",
  "tspan",
]);
const ATTRIBUTES = new Set([
  "id",
  "xmlns",
  "viewBox",
  "width",
  "height",
  "preserveAspectRatio",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "color",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "fx",
  "fy",
  "fr",
  "offset",
  "stop-color",
  "stop-opacity",
  "clip-path",
  "clip-rule",
  "clipPathUnits",
  "mask",
  "maskUnits",
  "maskContentUnits",
  "filter",
  "filterUnits",
  "primitiveUnits",
  "in",
  "in2",
  "result",
  "stdDeviation",
  "dx",
  "dy",
  "mode",
  "operator",
  "k1",
  "k2",
  "k3",
  "k4",
  "type",
  "values",
  "flood-color",
  "flood-opacity",
  "baseFrequency",
  "numOctaves",
  "seed",
  "stitchTiles",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "textLength",
  "lengthAdjust",
  "vector-effect",
]);
const PAINT_ATTRIBUTES = new Set([
  "fill",
  "stroke",
  "color",
  "stop-color",
  "flood-color",
]);
const LOCAL_REFERENCE_ATTRIBUTES = new Set(["clip-path", "mask", "filter"]);
const LOCAL_REFERENCE = /^url\(#[A-Za-z][A-Za-z0-9_.-]*\)$/u;
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const isXmlCharacter = (value: number) =>
  [9, 10, 13].includes(value) ||
  (value >= 0x20 && value <= 0xd7ff) ||
  (value >= 0xe000 && value <= 0xfffd) ||
  (value >= 0x10000 && value <= 0x10ffff);

const decodeText = (raw: string) => {
  if (raw.includes("<"))
    throw new Error("SVG contains an invalid attribute or text value.");
  return raw.replace(/&([^;]*);|&/gu, (_match, name: string | undefined) => {
    if (name !== undefined && ENTITIES[name] !== undefined)
      return ENTITIES[name];
    if (name !== undefined && /^#(?:[0-9]+|x[0-9a-fA-F]+)$/u.test(name)) {
      const codepoint =
        name[1]?.toLowerCase() === "x"
          ? Number.parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      if (isXmlCharacter(codepoint)) return String.fromCodePoint(codepoint);
    }
    throw new Error(
      "SVG entities must be literal text or supported character references.",
    );
  });
};

const parseAttributes = (source: string, isRoot: boolean) => {
  const values = new Map<string, string>();
  const attribute =
    /\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/uy;
  let offset = 0;
  while (source.slice(offset).trim() !== "") {
    attribute.lastIndex = offset;
    const match = attribute.exec(source);
    if (match === null)
      throw new Error("SVG attributes must be explicit, quoted and supported.");
    offset = attribute.lastIndex;
    const name = match[1]!;
    const value = decodeText(match[2] ?? match[3] ?? "");
    if (
      !ATTRIBUTES.has(name) ||
      values.has(name) ||
      [...value].some(
        (character) =>
          character === "\\" ||
          (character.charCodeAt(0) < 32 &&
            !["\t", "\n", "\r"].includes(character)),
      )
    )
      throw new Error(`Unsupported or unsafe SVG attribute: ${name}.`);
    if (name === "xmlns" && (!isRoot || value !== "http://www.w3.org/2000/svg"))
      throw new Error("SVG namespace is invalid.");
    if (
      PAINT_ATTRIBUTES.has(name) &&
      !/^(?:#[a-f0-9]{3,8}|[a-z]+|(?:rgb|hsl)a?\([+\-\d.,%\s]+\))$/iu.test(
        value,
      ) &&
      !LOCAL_REFERENCE.test(value)
    )
      throw new Error(
        "SVG paint must be a color or a local gradient reference.",
      );
    if (
      LOCAL_REFERENCE_ATTRIBUTES.has(name) &&
      value !== "none" &&
      !LOCAL_REFERENCE.test(value)
    )
      throw new Error("SVG references must remain local to the artwork.");
    if (
      name !== "xmlns" &&
      /(?:https?:|data:|javascript:|file:|\/\/|url\s*\()/iu.test(value) &&
      !LOCAL_REFERENCE.test(value)
    )
      throw new Error("SVG external or executable content is forbidden.");
    values.set(name, value);
  }
  return values;
};

/** A static SVG subset: no scripts, CSS, animation, foreign markup or external references. */
export const inspectAuthoredSvgBytes = (bytes: Uint8Array) => {
  if (bytes.byteLength > 2 * 1024 * 1024)
    throw new Error("Authored SVG exceeds the 2 MiB limit.");
  const source = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .replace(/^\uFEFF/u, "");
  for (const character of source) {
    const value = character.codePointAt(0)!;
    if (!isXmlCharacter(value))
      throw new Error("SVG contains invalid XML characters.");
  }
  const token =
    /<!--(?:(?!--)[\s\S])*?-->|<\?xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?\s*\?>|<\/?[A-Za-z][A-Za-z0-9]*(?:\s+[^<>]*?)?\s*\/?>|[^<]+/uy;
  const stack: string[] = [];
  let root: ReadonlyMap<string, string> | undefined;
  let closed = false;
  let offset = 0;
  let elements = 0;
  while (offset < source.length) {
    token.lastIndex = offset;
    const match = token.exec(source);
    if (match === null)
      throw new Error(
        "SVG must be well-formed static XML without declarations.",
      );
    const text = match[0];
    offset = token.lastIndex;
    if (text.startsWith("<!--")) continue;
    if (text.startsWith("<?xml")) {
      if (match.index !== 0 || root !== undefined)
        throw new Error("SVG XML declaration must be first.");
      continue;
    }
    if (!text.startsWith("<")) {
      if (text.includes("]]>"))
        throw new Error("SVG text contains an invalid XML delimiter.");
      decodeText(text);
      if (
        text.trim() !== "" &&
        !["title", "desc", "text", "tspan"].includes(stack.at(-1) ?? "")
      )
        throw new Error("SVG text must belong to a text element.");
      continue;
    }
    const element = /^<(\/)?([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/?)>$/u.exec(
      text,
    )!;
    const name = element[2]!;
    if (!ELEMENTS.has(name))
      throw new Error(`Unsupported or unsafe SVG element: ${name}.`);
    if (element[1] === "/") {
      if (
        element[3]!.trim() !== "" ||
        element[4] !== "" ||
        stack.pop() !== name
      )
        throw new Error("SVG element nesting is invalid.");
      if (stack.length === 0) closed = true;
      continue;
    }
    if (
      closed ||
      (root === undefined && name !== "svg") ||
      (root !== undefined && name === "svg")
    )
      throw new Error("Artwork must have exactly one SVG root.");
    if (++elements > 20_000 || stack.length >= 64)
      throw new Error("SVG structure exceeds the supported complexity.");
    const attributes = parseAttributes(element[3]!, root === undefined);
    root ??= attributes;
    if (element[4] !== "/") stack.push(name);
    else if (stack.length === 0) closed = true;
  }
  if (root === undefined || stack.length !== 0 || !closed)
    throw new Error("SVG document is incomplete.");
  if (root.get("xmlns") !== "http://www.w3.org/2000/svg")
    throw new Error("SVG root must declare the SVG namespace.");
  const viewBox = root
    .get("viewBox")
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    viewBox !== undefined &&
    (viewBox.length !== 4 ||
      viewBox.some((value) => !Number.isFinite(value)) ||
      viewBox[2]! <= 0 ||
      viewBox[3]! <= 0)
  )
    throw new Error("SVG viewBox is invalid.");
  const dimension = (
    name: "width" | "height",
    fallback: number | undefined,
  ) => {
    const value = root.get(name);
    if (value !== undefined && !/^\d+(?:\.\d+)?(?:px)?$/u.test(value))
      throw new Error("SVG dimensions must use positive pixel values.");
    const parsed = value === undefined ? fallback : Number.parseFloat(value);
    if (
      parsed === undefined ||
      !Number.isSafeInteger(parsed) ||
      parsed <= 0 ||
      parsed > 16_384
    )
      throw new Error(
        "SVG requires finite integer dimensions within 16384 pixels.",
      );
    return parsed;
  };
  const width = dimension("width", viewBox?.[2]);
  const height = dimension("height", viewBox?.[3]);
  if (width * height > 100_000_000)
    throw new Error("SVG dimensions exceed the pixel budget.");
  return {
    mimeType: "image/svg+xml",
    extension: "svg",
    width,
    height,
  } as const;
};
