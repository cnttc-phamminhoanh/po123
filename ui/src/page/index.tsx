import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { StyleDetail } from '../types';
import { useT, LanguageSwitcher } from '../i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useLatestStyle, useStyleDetail } from './hooks';
import type { CostGroup } from './constants';
import { errorMessage, storageErrorText } from './utils/error';
import SummaryView from './components/SummaryView';
import SizeGroupBar from './components/SizeGroupBar';
import { FileDown, Search } from 'lucide-react';
import { exportNodeToA3Pdf, downloadBlob } from './utils/exportPdf';
import UploadPhotosDialog from './dialogs/UploadPhotosDialog';
import './page.css';

const PoSummaryPage = () => {
  const t = useT();
  const latestQuery = useLatestStyle();
  const [inputCode, setInputCode] = useState<string>('');
  const [draftCode, setDraftCode] = useState<string>('');
  const [draftSeason, setDraftSeason] = useState<string>('');
  const [sizeGroup, setSizeGroup] = useState<string>('');
  const [openGroups, setOpenGroups] = useState<Record<CostGroup, boolean>>({
    materials: false,
    labors: false,
    others: false,
  });
  const [photosOpen, setPhotosOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  /** Mở màn bằng mã hàng mới nhất; người dùng vẫn có thể gõ mã khác để tra. */
  useEffect(() => {
    if (draftCode) return;
    const latest = latestQuery.data;
    if (!latest?.code) return;
    setInputCode(latest.code);
    setDraftCode(latest.code);
  }, [latestQuery.data, draftCode]);

  const detailQuery = useStyleDetail(draftCode, draftSeason, sizeGroup);
  const detail: StyleDetail | undefined = detailQuery.data;

  const activeSeason: string = draftSeason || detail?.season || '';
  const seasonOptions: string[] = detail?.seasons ?? [];
  const sizeGroupOptions: string[] = detail?.sizeGroups ?? [];
  const appliedSizeGroup: string =
    detail && detail.sizeGroups.includes(sizeGroup) ? sizeGroup : '';

  useEffect(() => {
    if (!detail) {
      setSizeGroup('');
      return;
    }
    setSizeGroup((current) =>
      current && detail.sizeGroups.includes(current)
        ? current
        : detail.terms || detail.sizeGroups[0] || '',
    );
  }, [detail]);

  const handleSeasonChange = (season: string) => {
    setDraftSeason(season);
    setSizeGroup('');
  };

  const handleSearch = () => {
    const code = inputCode.trim();
    if (!code) {
      toast.error(t('styleRequired'));
      return;
    }
    setDraftSeason('');
    setSizeGroup('');
    setDraftCode(code);
  };

  const handleToggleGroup = (group: CostGroup) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleExportPdf = async (): Promise<void> => {
    const node = pageRef.current;
    if (!detail || !node) {
      toast.error(t('costSheetNotReady'));
      return;
    }
    const fileName: string = `PO-Summary-${detail.code}${
      appliedSizeGroup ? `-${appliedSizeGroup}` : ''
    }.pdf`;
    setExporting(true);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const result = await exportNodeToA3Pdf(node, fileName);
      downloadBlob(result.blob, fileName);
      toast.success(t('fileDownloaded', { name: fileName }));
    } catch (error) {
      toast.error(storageErrorText(error, t('pdfBuildFailed')));
    } finally {
      setExporting(false);
    }
  };

  const renderBody = () => {
    if (!draftCode) {
      if (latestQuery.isLoading) {
        return <div className="load-state">{t('loadingStyles')}</div>;
      }
      if (latestQuery.isError) {
        return (
          <div className="load-state">
            {errorMessage(latestQuery.error, t('stylesLoadFailed'))}
          </div>
        );
      }
      return <div className="load-state">{t('selectStyleToView')}</div>;
    }
    if (detailQuery.isLoading) {
      return <div className="load-state">{t('loadingCostSheet')}</div>;
    }
    if (detailQuery.isError) {
      return (
        <div className="load-state">
          {errorMessage(detailQuery.error, t('costSheetLoadFailed'))}
        </div>
      );
    }
    if (!detail) {
      return <div className="load-state">{t('selectStyleToView')}</div>;
    }
    return (
      <SummaryView
        detail={detail}
        sizeGroup={appliedSizeGroup}
        openGroups={openGroups}
        onToggleGroup={handleToggleGroup}
        onPhotoAction={() => setPhotosOpen(true)}
        loading={detailQuery.isPlaceholderData}
      />
    );
  };

  const photoStyles = useMemo(
    () => (detail ? [{ code: detail.code, name: detail.name }] : []),
    [detail],
  );

  return (
    <div
      ref={pageRef}
      className={exporting ? 'po-app is-exporting' : 'po-app'}
    >
      <header className="head">
        <div className="head-top">
          <h1>{t('appTitle')}</h1>
          <div className="head-actions">
            <LanguageSwitcher />
            <button
              type="button"
              className="btn-export"
              onClick={() => void handleExportPdf()}
              disabled={exporting || !detail}
            >
              <FileDown size={14} />
              {exporting ? t('preparing') : t('exportPdf')}
            </button>
          </div>
        </div>
        <div className="print-meta">
          {detail ? `${detail.code} — ${detail.name}` : t('poCostSummary')}
          {appliedSizeGroup ? ` · ${t('sizeGroup')} ${appliedSizeGroup}` : ''}
        </div>
        <div className="filterbar">
          <div className="filter filter--style">
            <span className="filter-label">
              <i className="req">*</i> {t('style')}
            </span>
            <div className="search-row">
              <input
                className="style-input"
                value={inputCode}
                placeholder={t('stylePlaceholder')}
                aria-label={t('style')}
                onChange={(event) => setInputCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
              />
              <button
                type="button"
                className="search-btn"
                onClick={handleSearch}
                title={t('search')}
              >
                <Search size={13} />
                <span>{t('search')}</span>
              </button>
            </div>
          </div>
          {seasonOptions.length > 0 ? (
            <div className="filter">
              <span className="filter-label">
                {seasonOptions.length > 1 ? <i className="req">*</i> : null}{' '}
                {t('season')}
              </span>
              <Select
                value={activeSeason}
                onValueChange={handleSeasonChange}
                disabled={seasonOptions.length < 2}
              >
                <SelectTrigger
                  className="style-input"
                  aria-label={t('season')}
                  title={
                    seasonOptions.length > 1 ? undefined : t('oneSeasonOnly')
                  }
                >
                  <SelectValue placeholder={t('selectSeason')} />
                </SelectTrigger>
                <SelectContent className="rounded-[8px]">
                  {seasonOptions.map((option: string) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {sizeGroupOptions.length > 0 ? (
            <SizeGroupBar
              sizeGroups={sizeGroupOptions}
              value={sizeGroup}
              onChange={setSizeGroup}
            />
          ) : null}
        </div>
      </header>

      <main id="view" data-ai-section-type="card-list">
        {renderBody()}
      </main>

      <UploadPhotosDialog
        open={photosOpen}
        onOpenChange={setPhotosOpen}
        styles={photoStyles}
      />
    </div>
  );
};

export default PoSummaryPage;
