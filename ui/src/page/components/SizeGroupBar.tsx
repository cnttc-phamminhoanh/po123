import { useT } from '../../i18n';
import { sizeGroupLabel } from '../utils/format';

interface SizeGroupBarProps {
  sizeGroups: string[];
  value: string;
  onChange: (sizeGroup: string) => void;
  busy?: boolean;
}

const SizeGroupBar = ({
  sizeGroups,
  value,
  onChange,
  busy = false,
}: SizeGroupBarProps) => {
  const t = useT();
  return (
    <div className="size-bar">
      <span className="size-bar-label">{t('sizeGroup')}</span>
      <div
        className="size-options"
        role="group"
        aria-label={t('sizeGroupFilter')}
        aria-busy={busy}
      >
        {sizeGroups.map((sizeGroup: string) => (
          <button
            key={sizeGroup}
            type="button"
            className="size-chip"
            aria-pressed={value === sizeGroup}
            disabled={busy}
            onClick={() => onChange(sizeGroup)}
          >
            {sizeGroupLabel(sizeGroup, t('sizeGroupCommon'))}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SizeGroupBar;
