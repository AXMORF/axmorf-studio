import type { ReactNode } from "react";

export const Field = ({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint === undefined ? null : <span className="field-hint">{hint}</span>}
  </label>
);

export const Section = ({
  eyebrow,
  title,
  description,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) => (
  <section className="config-section">
    <div className="section-heading">
      <span>{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    {children}
  </section>
);

export const FieldRow = ({ children }: { readonly children: ReactNode }) => (
  <div className="field-row">{children}</div>
);
