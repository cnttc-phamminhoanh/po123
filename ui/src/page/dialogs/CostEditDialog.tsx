import { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  BomCategory,
  LaborOpCode,
  OtherCostCategory,
  PoCostDetail,
  StyleDetail,
  UpdatePoCostRequest,
} from '../../types';
import {
  BOM_CATEGORY_DEFAULT_ITEMS,
  LABOR_OP_LABELS,
  OTHER_COST_LABELS,
} from '../../types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../ui/form';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { useT } from '../../i18n';
import type { TKey } from '../../i18n';
import { bomAmount, otherAmount } from '../constants';
import { money } from '../utils/format';

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

const buildCostSchema = (t: Translate) =>
  z.object({
    factory: z.string().min(1, t('zodFactoryRequired')),
    qty: z.number().int(t('zodWholePieces')).min(0),
    shippedQty: z.number().int(t('zodWholePieces')).min(0),
    priceLabel: z.string().min(1, t('zodPriceLabelRequired')),
    price: z.number().min(0, t('zodMustBeNonNeg')),
    sam: z.number().min(0, t('zodMustBeNonNeg')),
    efficiency: z.number().min(0).max(200, t('zodRange200')),
    laborRate: z.number().min(0, t('zodMustBeNonNeg')),
    fabric: z.number().min(0, t('zodMustBeNonNeg')),
    trim: z.number().min(0, t('zodMustBeNonNeg')),
    wash: z.number().min(0, t('zodMustBeNonNeg')),
    pack: z.number().min(0, t('zodMustBeNonNeg')),
    cut: z.number().min(0, t('zodMustBeNonNeg')),
    sew: z.number().min(0, t('zodMustBeNonNeg')),
    fin: z.number().min(0, t('zodMustBeNonNeg')),
    packMinutes: z.number().min(0, t('zodMustBeNonNeg')),
    overhead: z.number().min(0, t('zodMustBeNonNeg')),
    qc: z.number().min(0, t('zodMustBeNonNeg')),
    freight: z.number().min(0, t('zodMustBeNonNeg')),
  });

type CostFormData = z.infer<ReturnType<typeof buildCostSchema>>;

interface CostEditDialogProps {
  detail: StyleDetail;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (poNo: string, body: UpdatePoCostRequest) => Promise<void>;
}

const minutesOf = (po: PoCostDetail, opCode: LaborOpCode): number =>
  po.laborOps.find((line) => line.opCode === opCode)?.minutes ?? 0;

const bomItemName = (po: PoCostDetail, category: BomCategory): string =>
  po.bom.find((line) => line.category === category)?.itemName ??
  BOM_CATEGORY_DEFAULT_ITEMS[category];

const opName = (po: PoCostDetail, opCode: LaborOpCode): string =>
  po.laborOps.find((line) => line.opCode === opCode)?.opName ??
  LABOR_OP_LABELS[opCode];

const otherLabel = (po: PoCostDetail, category: OtherCostCategory): string =>
  po.otherCosts.find((line) => line.category === category)?.label ??
  OTHER_COST_LABELS[category];

const toFormValues = (po: PoCostDetail): CostFormData => ({
  factory: po.factory,
  qty: po.qty,
  shippedQty: po.shippedQty,
  priceLabel: po.priceLabel,
  price: po.price,
  sam: po.sam,
  efficiency: po.efficiency,
  laborRate: po.laborRate,
  fabric: bomAmount(po, 'fabric'),
  trim: bomAmount(po, 'trim'),
  wash: bomAmount(po, 'wash'),
  pack: bomAmount(po, 'pack'),
  cut: minutesOf(po, 'cut'),
  sew: minutesOf(po, 'sew'),
  fin: minutesOf(po, 'fin'),
  packMinutes: minutesOf(po, 'pack'),
  overhead: otherAmount(po, 'overhead'),
  qc: otherAmount(po, 'qc'),
  freight: otherAmount(po, 'freight'),
});

const toRequest = (po: PoCostDetail, data: CostFormData): UpdatePoCostRequest => ({
  factory: data.factory,
  qty: data.qty,
  shippedQty: data.shippedQty,
  priceLabel: data.priceLabel,
  price: data.price,
  sam: data.sam,
  efficiency: data.efficiency,
  laborRate: data.laborRate,
  bom: [
    {
      category: 'fabric',
      itemName: bomItemName(po, 'fabric'),
      amount: data.fabric,
    },
    { category: 'trim', itemName: bomItemName(po, 'trim'), amount: data.trim },
    { category: 'wash', itemName: bomItemName(po, 'wash'), amount: data.wash },
    { category: 'pack', itemName: bomItemName(po, 'pack'), amount: data.pack },
  ],
  laborOps: [
    { opCode: 'cut', opName: opName(po, 'cut'), minutes: data.cut },
    { opCode: 'sew', opName: opName(po, 'sew'), minutes: data.sew },
    { opCode: 'fin', opName: opName(po, 'fin'), minutes: data.fin },
    {
      opCode: 'pack',
      opName: opName(po, 'pack'),
      minutes: data.packMinutes,
    },
  ],
  otherCosts: [
    {
      category: 'overhead',
      label: otherLabel(po, 'overhead'),
      amount: data.overhead,
    },
    { category: 'qc', label: otherLabel(po, 'qc'), amount: data.qc },
    {
      category: 'freight',
      label: otherLabel(po, 'freight'),
      amount: data.freight,
    },
  ],
});

interface CostFormProps {
  po: PoCostDetail;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (poNo: string, body: UpdatePoCostRequest) => Promise<void>;
}

const CostForm = ({ po, saving, onCancel, onSubmit }: CostFormProps) => {
  const t = useT();
  const schema = useMemo(() => buildCostSchema(t), [t]);
  const form = useForm<CostFormData>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(po),
  });

  const handleSubmit = form.handleSubmit(async (data: CostFormData) => {
    await onSubmit(po.poNo, toRequest(po, data));
  });

  const textField = (
    name: 'factory' | 'priceLabel',
    label: string,
  ) => (    <FormField
    control={form.control}
    name={name}
    render={({ field }) => (
      <FormItem className="po-field">
        <FormLabel className="po-field-label">{label}</FormLabel>
        <FormControl>
          <Input className="po-input" {...field} />
        </FormControl>
        <FormMessage className="po-form-error" />
      </FormItem>
    )}
  />
  );

  const numberInput = (
    name:
      | 'qty'
      | 'shippedQty'
      | 'price'
      | 'sam'
      | 'efficiency'
      | 'laborRate'
      | 'fabric'
      | 'trim'
      | 'wash'
      | 'pack'
      | 'cut'
      | 'sew'
      | 'fin'
      | 'packMinutes'
      | 'overhead'
      | 'qc'
      | 'freight',
    label: string,
    step: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="po-field">
          <FormLabel className="po-field-label">{label}</FormLabel>
          <FormControl>
            <Input
              className="po-input"
              type="number"
              step={step}
              name={field.name}
              ref={field.ref}
              value={String(field.value ?? 0)}
              onBlur={field.onBlur}
              onChange={(event) =>
                field.onChange(
                  event.target.value === '' ? 0 : Number(event.target.value),
                )
              }
              aria-label={label}
            />
          </FormControl>
          <FormMessage className="po-form-error" />
        </FormItem>
      )}
    />
  );

  const laborCost: number =
    (form.watch('sam') || 0) * (form.watch('laborRate') || 0);

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="po-dialog-body po-dialog-body--single">
          <div className="po-form">
            <section className="po-form-section">
              <h3>{t('orderPricing')}</h3>
              <div className="po-form-grid">
                {textField('factory', t('factory'))}
                {numberInput('qty', t('orderQty'), '1')}
                {numberInput('shippedQty', t('shippedQtyField'), '1')}
              </div>
              <div className="po-form-grid" style={{ marginTop: 12 }}>
                {textField('priceLabel', t('priceLabelField'))}
                {numberInput('price', t('unitPriceUsd'), '0.01')}
              </div>
            </section>

            <section className="po-form-section">
              <h3>{t('laborSection')}</h3>
              <div className="po-form-grid">
                {numberInput('sam', t('samMin'), '0.1')}
                {numberInput('efficiency', t('lineEffPct'), '1')}
                {numberInput('laborRate', t('ratePerMinUsd'), '0.001')}
              </div>
            </section>

            <section className="po-form-section">
              <h3>{t('materialsSection')}</h3>
              <div className="po-form-grid po-form-grid--four">
                {numberInput('fabric', t('seriesFabric'), '0.01')}
                {numberInput('trim', t('seriesTrim'), '0.01')}
                {numberInput('wash', t('seriesWash'), '0.01')}
                {numberInput('pack', t('seriesPack'), '0.01')}
              </div>
            </section>

            <section className="po-form-section">
              <h3>{t('laborMinutesSection')}</h3>
              <div className="po-form-grid po-form-grid--four">
                {numberInput('cut', t('seriesCut'), '0.1')}
                {numberInput('sew', t('seriesSew'), '0.1')}
                {numberInput('fin', t('seriesFin'), '0.1')}
                {numberInput('packMinutes', t('seriesPacking'), '0.1')}
              </div>
            </section>

            <section className="po-form-section">
              <h3>{t('otherExpensesSection')}</h3>
              <div className="po-form-grid">
                {numberInput('overhead', t('seriesOverhead'), '0.01')}
                {numberInput('qc', t('seriesQc'), '0.01')}
                {numberInput('freight', t('seriesFreight'), '0.01')}
              </div>
            </section>
          </div>
        </div>
        <div className="po-form-foot">
          <span className="po-form-note">
            {t('laborRecalc', { cost: money(laborCost) })}
          </span>
          <button type="button" className="po-btn" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="po-btn po-btn--primary"
            disabled={saving}
          >
            {saving ? t('saving') : t('saveCosts')}
          </button>
        </div>
      </form>
    </Form>
  );
};

const CostEditDialog = ({
  detail,
  open,
  saving,
  onOpenChange,
  onSubmit,
}: CostEditDialogProps) => {
  const t = useT();
  const [poNo, setPoNo] = useState<string>(detail.pos[0]?.poNo ?? '');
  const po: PoCostDetail | undefined =
    detail.pos.find((item) => item.poNo === poNo) ?? detail.pos[0];

  useEffect(() => {
    if (!detail.pos.some((item) => item.poNo === poNo)) {
      setPoNo(detail.pos[0]?.poNo ?? '');
    }
  }, [detail.pos, poNo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="po-dialog" showCloseButton={false}>
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{t('editCosts')}</h2>
            <button
              type="button"
              className="po-dialog-x"
              aria-label={t('close')}
              onClick={() => onOpenChange(false)}
            >
              ×
            </button>
          </div>
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('ariaEditCosts')}
        </DialogDescription>
        {po ? (
          <>
            <div className="po-dialog-body po-dialog-body--single">
              <div className="po-field">
                <span className="po-field-label">{t('purchaseOrder')}</span>
                <Select value={poNo} onValueChange={setPoNo}>
                  <SelectTrigger
                    className="style-input"
                    aria-label={t('purchaseOrder')}
                  >
                    <SelectValue placeholder={t('selectPo')} />
                  </SelectTrigger>
                  <SelectContent className="rounded-[8px]">
                    {detail.pos.map((item) => (
                      <SelectItem key={item.poNo} value={item.poNo}>
                        {item.poNo} · {item.factory}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CostForm
              key={po.poNo}
              po={po}
              saving={saving}
              onCancel={() => onOpenChange(false)}
              onSubmit={onSubmit}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default CostEditDialog;
