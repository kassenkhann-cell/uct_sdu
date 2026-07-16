import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel__header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
