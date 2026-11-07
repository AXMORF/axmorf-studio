import assert from "node:assert/strict";
import test from "node:test";

import { foregroundSampler } from "../../packages/studio/src/remotion/film/review-measure";

// Minimal hit-test DOM: exercise the sampler itself, including candidates skipped
// by elementsFromPoint. No browser or layout approximation is needed here.
class ElementFixture {
  parentElement: ElementFixture | null = null;
  children: ElementFixture[] = [];
  group = false;
  caption = false;
  style = {
    display: "block",
    visibility: "visible",
    opacity: "1",
    pointerEvents: "auto",
    backgroundImage: "none",
    backgroundColor: "transparent",
  };
  tagName = "SPAN";
  childNodes = [{ nodeType: 3, textContent: "字" }];
  constructor(parent?: ElementFixture) {
    if (parent) {
      this.parentElement = parent;
      parent.children.push(this);
    }
  }
  closest(selector: string): ElementFixture | null {
    if (selector === "[data-axmorf-text-group]" ? this.group : this.caption)
      return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  contains(element: ElementFixture): boolean {
    return (
      this === element || this.children.some((child) => child.contains(element))
    );
  }
  querySelectorAll(): ElementFixture[] {
    return this.children.flatMap((child) => [
      child,
      ...child.querySelectorAll(),
    ]);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 60, width: 100, height: 60 };
  }
}

test("foreground ignores glyphs only within the same nearest text-group, retaining external coverage and uncertainty", () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const set = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true });
  };
  const root = new ElementFixture();
  root.childNodes = [];
  const group = new ElementFixture(root);
  group.group = true;
  group.childNodes = [];
  const glyph = new ElementFixture(group);
  const shard = new ElementFixture(group);
  const secondGroup = new ElementFixture(root);
  secondGroup.group = true;
  secondGroup.childNodes = [];
  const otherGlyph = new ElementFixture(secondGroup);
  const external = new ElementFixture(root);
  const nestedGroup = new ElementFixture(group);
  nestedGroup.group = true;
  nestedGroup.childNodes = [];
  const nestedGlyph = new ElementFixture(nestedGroup);
  let stack = [shard, glyph, group, root];
  try {
    set("SVGElement", class {});
    set("Node", { TEXT_NODE: 3 });
    set("getComputedStyle", (element: ElementFixture) => element.style);
    set("window", { innerWidth: 100, innerHeight: 60 });
    set("document", { elementsFromPoint: () => stack });
    const sample = () =>
      foregroundSampler(root as unknown as Element)(
        glyph as unknown as Element,
        [glyph.getBoundingClientRect() as DOMRect],
      );
    assert.deepEqual(sample(), { samples: 30, covered: 0, unknown: 0 });
    // An external foreground behind an ignored shard must still be detected.
    for (const front of [external, otherGlyph, nestedGlyph]) {
      stack = [shard, front, glyph, group, root];
      assert.deepEqual(sample(), { samples: 30, covered: 30, unknown: 0 });
    }
    stack = [glyph, group, root];
    shard.style.pointerEvents = "none";
    assert.deepEqual(sample(), { samples: 30, covered: 0, unknown: 0 });
    external.style.pointerEvents = "none";
    assert.deepEqual(sample(), { samples: 30, covered: 0, unknown: 30 });
    external.style.opacity = "0";
    glyph.style.pointerEvents = "none";
    assert.deepEqual(sample(), { samples: 30, covered: 0, unknown: 30 });
    glyph.style.pointerEvents = "auto";
    group.group = false;
    shard.style.pointerEvents = "auto";
    stack = [shard, glyph, group, root];
    assert.deepEqual(sample(), { samples: 30, covered: 30, unknown: 0 });
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
