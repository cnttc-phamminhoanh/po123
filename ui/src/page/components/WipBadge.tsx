import { Factory } from 'lucide-react';
import { useT } from '../../i18n';

const WipBadge = () => {
  const t = useT();
  return (
    <span className="wip-badge" title={t('wipTitle')}>
      <Factory size={13} aria-hidden="true" />
      {t('wipText')}
    </span>
  );
};

export default WipBadge;
