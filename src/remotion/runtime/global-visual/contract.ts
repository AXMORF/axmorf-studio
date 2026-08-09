import type { ComponentProps, ElementType } from "react";

type IsAny<Value> = 0 extends 1 & Value ? true : false;
type IsNever<Value> = [Value] extends [never] ? true : false;
type EmptyProps = Readonly<Record<PropertyKey, never>>;

export type GlobalVisualLayersComponent<Component extends ElementType> =
  IsAny<ComponentProps<Component>> extends true
    ? never
    : IsNever<ComponentProps<Component>> extends true
      ? never
      : [ComponentProps<Component>] extends [EmptyProps]
        ? Component
        : never;
