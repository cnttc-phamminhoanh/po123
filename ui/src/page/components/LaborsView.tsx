import ReactECharts from 'echarts-for-react';
import type { StyleDetail } from '../../types';
import { paletteOf } from '../constants';
import { useT } from '../../i18n';
import { buildLaborsOption } from '../chart-options';
import { fixed1, money, pct1 } from '../utils/format';

interface LaborsViewProps {
  detail: StyleDetail;
}

const LaborsView = ({ detail }: LaborsViewProps) => {
  const t = useT();
  const shareOfCost = (labor: number, unitCost: number): number =>
    unitCost > 0 ? (labor / unitCost) * 100 : 0;

  return (
    <div className="split">
      <section className="panel">
        <div className="panel-head">
          <h2>{t('laborCostByOp')}</h2>
          <span className="hint">{t('usdPerUnit')}</span>
        </div>
        <ReactECharts
          option={buildLaborsOption(detail.pos, t)}
          theme="ud"
          className="chart"
        />
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{t('laborLedger')}</h2>
          <span className="hint">{t('perUnit')}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('poCol')}</th>
                <th>{t('samCol')}</th>
                <th>{t('lineEff')}</th>
                <th>{t('ratePerMin')}</th>
                <th>{t('laborPerUnit')}</th>
                <th>{t('shareOfCost')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.pos.map((po, index) => (
                <tr key={po.poNo}>
                  <td>
                    <span
                      className="po-dot"
                      style={{ background: paletteOf(po.poNo, index).base }}
                    />
                    {po.poNo}
                  </td>
                  <td>{fixed1(po.sam)}</td>
                  <td>{po.efficiency}%</td>
                  <td>{money(po.laborRate, 3)}</td>
                  <td>{money(po.laborCost)}</td>
                  <td>{pct1(shareOfCost(po.laborCost, po.unitCost))}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{t('blended')}</td>
                <td>{fixed1(detail.avgSam)}</td>
                <td>{Math.round(detail.avgEfficiency)}%</td>
                <td>&mdash;</td>
                <td>{money(detail.avgLaborCost)}</td>
                <td>{pct1(shareOfCost(detail.avgLaborCost, detail.avgCost))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default LaborsView;
