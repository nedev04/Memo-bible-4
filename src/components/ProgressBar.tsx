interface Props {
  value: number
  max: number
  label?: string
}

export default function ProgressBar({ value, max, label }: Props) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 100
  return (
    <div className="pbar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="pbar-track">
        <div className="pbar-fill" style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined && <span className="pbar-label">{label}</span>}
    </div>
  )
}
