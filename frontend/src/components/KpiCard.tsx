import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "yellow" | "red";
  active?: boolean;
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "blue",
  active = false,
  onClick,
}: KpiCardProps) {
  const className = [
    "kpi-card",
    `kpi-card--${tone}`,
    onClick ? "kpi-card--clickable" : "",
    active ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="kpi-card__top">
        <span>{label}</span>
        <span className="kpi-card__icon">
          <Icon size={18} strokeWidth={2} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <article className={className}>
      {content}
    </article>
  );
}
