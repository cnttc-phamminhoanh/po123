import ReactECharts from 'echarts-for-react';
import type { StyleDetail } from '../../types';
import { MATERIAL_SERIES, bomAmount } from '../constants';
import { useT } from '../../i18n';
import { buildMaterialsOption } from '../chart-options';
import { money } from '../utils/format';

interface MaterialsViewProps {
  detail: StyleDetail;
}

const MaterialsView = ({ detail }: MaterialsViewProps) => {
  const t = useT();
  const matrix: { label: string; cells: number[]; total: number }[] =
    MATERIAL_SERIES.map((series) => {
      const cells: number[] = detail.pos.map((po) => bomAmount(po, series.key));
      return {
        label: t(series.labelKey),
        cells,
        total: cells.reduce((sum: number, value: number) => sum + value, 0),
      };
    });

  const totalRow: number[] = detail.pos.map((po) => po.materialTotal);
  const grandTotal: number = totalRow.reduce(
    (sum: number, value: number) => sum + value,
    0,
  );

  return (
    <div className="split">
      <section className="panel">
        <div className="panel-head">
          <h2>{t('materialCostByPo')}</h2>
          <span className="hint">{t('usdPerUnit')}</span>
        </div>
        <ReactECharts
          option={buildMaterialsOption(detail.pos, t)}
          theme="ud"
          className="chart"
        />
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{t('materialLedger')}</h2>
          <span className="hint">{t('usdPerUnit')}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('category')}</th>
                {detail.pos.map((po) => (
                  <th key={po.poNo}>{po.poNo}</th>
                ))}
                <th>{t('total')}</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.cells.map((value: number, index: number) => (
                    <td key={detail.pos[index].poNo}>{money(value)}</td>
                  ))}
                  <td>{money(row.total)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{t('tableTotalMaterials')}</td>
                {totalRow.map((value: number, index: number) => (
                  <td key={detail.pos[index].poNo}>{money(value)}</td>
                ))}
                <td>{money(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default MaterialsView;
