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
  footLeft: string;
  footRight: string;
  lead?: ReactNode;
}

const MiniChart = ({ items, footLeft, footRight, lead }: MiniChartProps) => {
  const total: number = items.reduce(
    (sum: number, item: MiniChartItem) => sum + item.value,
    0,
  );

  return (
    <>
      {lead}
      <div className="mini-bar">
        {items.map((item: MiniChartItem) => (
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
      <div className="mini-foot">
        <span>{footLeft}</span>
        <span>{footRight}</span>
      </div>
    </>
  );
};

export default MiniChart;
