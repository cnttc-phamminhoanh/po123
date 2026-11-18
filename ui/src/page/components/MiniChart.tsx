import type { ReactNode } from 'react';
import { money } from '../utils/format';

export interface MiniChartItem {
  label: string;
  value: number;
  color: string;
  digits?: number;
}

interface MiniChartProps {
  items: MiniChartItem[];
  lead?: ReactNode;
}

const MiniChart = ({ items, lead }: MiniChartProps) => {
  const total: number = items.reduce(
    (sum: number, item: MiniChartItem) => sum + item.value,
    0,
  );
  const segments = items.filter((item: MiniChartItem) => item.value > 0);

  return (
    <>
      {lead}
      <div className="mini-bar">
        {segments.map((item: MiniChartItem) => (
          <i
            key={item.label}
            style={{
              width: `${total > 0 ? (item.value / total) * 100 : 0}%`,
              background: item.color,
            }}
          />
        ))}
      </div>
      <div className="mini-grid">
        {items.map((item: MiniChartItem) => (
          <div className="mini-item" key={item.label}>
            <span className="swatch" style={{ background: item.color }} />
            <span className="name">{item.label}</span>
            <span className="val">{money(item.value, item.digits ?? 2)}</span>
          </div>
        ))}
      </div>
    </>
  );
};

export default MiniChart;
