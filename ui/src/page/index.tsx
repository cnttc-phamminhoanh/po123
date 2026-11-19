import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { StyleDetail } from '../types';
import { useT, LanguageSwitcher } from '../i18n';
import { fetchAuth, logout } from '../lib/auth';
import type { AuthState, AuthUser } from '../lib/auth';
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
import CatAstronautLoader from './components/CatAstronautLoader';
import SizeGroupBar from './components/SizeGroupBar';
import { FileDown, History, ImageUp, LogIn, LogOut, Search, Users } from 'lucide-react';
import { exportNodeToA3Pdf, downloadBlob } from './utils/exportPdf';
import { sizeGroupLabel } from './utils/format';
import UploadPhotosDialog from './dialogs/UploadPhotosDialog';
import LoginDialog from './dialogs/LoginDialog';
import UserManagementDialog from './dialogs/UserManagementDialog';
import PhotoHistoryDialog from './dialogs/PhotoHistoryDialog';
import './page.css';

type UploadKind = 'single' | 'bulk';

const avatarLabel = (name: string, code: string): string => {
  const source = name.trim() || code.trim();
  if (!source) return '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[words.length - 2][0]}${words[words.length - 1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

const PoSummaryPage = () => {
  const t = useT();
  const latestQuery = useLatestStyle();
  const [inputCode, setInputCode] = useState<string>('');
  const [draftCode, setDraftCode] = useState<string>('');
  const [draftSeason, setDraftSeason] = useState<string>('');
  const [draftSoSeason, setDraftSoSeason] = useState<string>('');
  const [sizeGroup, setSizeGroup] = useState<string>('');
  const [openGroups, setOpenGroups] = useState<Record<CostGroup, boolean>>({
    materials: false,
    labors: false,
    others: false,
  });
  const [photosOpen, setPhotosOpen] = useState(false);
  const [bulkPhotosOpen, setBulkPhotosOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [auth, setAuth] = useState<AuthState>({
    authenticated: false,
    user: null,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<UploadKind | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  /** Mở màn bằng mã hàng mới nhất; người dùng vẫn có thể gõ mã khác để tra. */
  useEffect(() => {
    if (draftCode) return;
    const latest = latestQuery.data;
    if (!latest?.code) return;
    setInputCode(latest.code);
    setDraftCode(latest.code);
  }, [latestQuery.data, draftCode]);

  /** Kiểm tra phiên đăng nhập hiện có; chỉ dùng để bật/tắt nút upload. */
  useEffect(() => {
    let active = true;
    fetchAuth()
      .then((state) => {
        if (active) setAuth(state);
      })
      .catch(() => {
        if (active) setAuth({ authenticated: false, user: null });
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  /** Đóng menu tài khoản khi bấm ra ngoài hoặc nhấn Esc. */
  useEffect(() => {
    if (!userMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userMenuOpen]);

  const detailQuery = useStyleDetail(draftCode, draftSeason, sizeGroup, draftSoSeason);
  const detail: StyleDetail | undefined = detailQuery.data;

  const activeSeason: string = draftSeason || detail?.season || '';
  const seasonOptions: string[] = detail?.seasons ?? [];
  const soSeasonOptions: string[] = detail?.soSeasons ?? [];
  const activeSoSeason: string = draftSoSeason || detail?.soSeason || '';
  const showSoSeason = soSeasonOptions.length > 1;
  const sizeGroupOptions: string[] = detail?.sizeGroups ?? [];
  const appliedSizeGroup: string =
    sizeGroup && detail?.sizeGroups.includes(sizeGroup)
      ? sizeGroup
      : detail?.terms ?? '';
  const isDifferentStyle =
    Boolean(detail) &&
    detail!.code.trim().toUpperCase() !== draftCode.trim().toUpperCase();

  const handleSeasonChange = (season: string) => {
    setDraftSeason(season);
    setDraftSoSeason('');
    setSizeGroup('');
  };

  const handleSoSeasonChange = (season: string) => {
    setDraftSoSeason(season);
    setSizeGroup('');
  };

  /** Bấm lại nhóm đang hiển thị thì không gọi lại API (tránh request thừa). */
  const handleSizeGroupChange = (next: string) => {
    if (next === appliedSizeGroup) return;
    setSizeGroup(next);
  };

  const handleSearch = () => {
    const code = inputCode.trim();
    if (!code) {
      toast.error(t('styleRequired'));
      return;
    }
    setDraftSeason('');
    setDraftSoSeason('');
    setSizeGroup('');
    setDraftCode(code);
  };

  const handleToggleGroup = (group: CostGroup) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const handleToggleAllGroups = () => {
    setOpenGroups((prev) => {
      const next = !(prev.materials && prev.labors && prev.others);
      return { materials: next, labors: next, others: next };
    });
  };

  /** Upload là thao tác cần quyền ghi: chưa đăng nhập thì mở hộp thoại đăng nhập trước. */
  const openUpload = (kind: UploadKind) => {
    if (auth.authenticated) {
      if (kind === 'bulk') setBulkPhotosOpen(true);
      else setPhotosOpen(true);
      return;
    }
    setPendingUpload(kind);
    setLoginOpen(true);
  };

  const handleLoginSuccess = (user: AuthUser) => {
    setAuth({ authenticated: true, user });
    const pending = pendingUpload;
    setPendingUpload(null);
    if (pending === 'bulk') setBulkPhotosOpen(true);
    if (pending === 'single') setPhotosOpen(true);
  };

  const handleLoginOpenChange = (open: boolean) => {
    setLoginOpen(open);
    if (!open) setPendingUpload(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
      setAuth({ authenticated: false, user: null });
      setUserMenuOpen(false);
      setPhotosOpen(false);
      setBulkPhotosOpen(false);
      setUsersOpen(false);
    } catch (error) {
      toast.error(storageErrorText(error, t('loginFailed')));
    }
  };

  const handleSessionExpired = () => {
    setAuth({ authenticated: false, user: null });
    setUserMenuOpen(false);
    setPhotosOpen(false);
    setBulkPhotosOpen(false);
    setUsersOpen(false);
    setPendingUpload(null);
    toast.error(t('sessionExpired'));
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
        return <CatAstronautLoader label={t('loadingStyles')} />;
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
    if (detailQuery.isLoading || (detailQuery.isPlaceholderData && isDifferentStyle)) {
      // Style khác thì không giữ card cũ, tránh hiện card cũ rồi mèo load rồi card mới.
      return <CatAstronautLoader label={t('loadingCostSheet')} />;
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
        onToggleAllGroups={handleToggleAllGroups}
        onPhotoAction={() => openUpload('single')}
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
              onClick={() => openUpload('bulk')}
              disabled={exporting}
            >
              <ImageUp size={14} />
              {t('bulkUpload')}
            </button>
            <button
              type="button"
              className="btn-export"
              onClick={() => void handleExportPdf()}
              disabled={exporting || !detail}
            >
              <FileDown size={14} />
              {exporting ? t('preparing') : t('exportPdf')}
            </button>
            {authLoading ? null : auth.authenticated ? (
              <div className="user-menu-wrap" ref={userMenuRef}>
                <button
                  type="button"
                  className="user-menu-trigger"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label={auth.user?.empName || auth.user?.username}
                  title={auth.user?.empName || auth.user?.username}
                >
                  <span className="user-avatar" aria-hidden="true">
                    {avatarLabel(
                      auth.user?.empName ?? '',
                      auth.user?.empNo || auth.user?.username || '',
                    )}
                  </span>
                </button>
                {userMenuOpen ? (
                  <div className="user-menu" role="menu">
                    <div className="user-menu-head">
                      <div className="user-menu-name">
                        {auth.user?.empName || auth.user?.username}
                      </div>
                      {auth.user?.empNo ? (
                        <div className="user-menu-sub">{auth.user.empNo}</div>
                      ) : null}
                    </div>
                    {auth.user?.role === 'admin' ? (
                      <>
                        <button
                          type="button"
                          className="user-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setHistoryOpen(true);
                          }}
                        >
                          <History size={14} />
                          {t('uploadHistory')}
                        </button>
                        <button
                          type="button"
                          className="user-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setUsersOpen(true);
                          }}
                        >
                          <Users size={14} />
                          {t('manageUsers')}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void handleLogout();
                      }}
                    >
                      <LogOut size={14} />
                      {t('logout')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="btn-export btn-login"
                onClick={() => {
                  setPendingUpload(null);
                  setLoginOpen(true);
                }}
              >
                <LogIn size={14} />
                {t('login')}
              </button>
            )}
          </div>
        </div>
        <div className="print-meta">
          {detail ? `${detail.code} · ${detail.name}` : t('poCostSummary')}
          {appliedSizeGroup
            ? ` · ${t('sizeGroup')} ${sizeGroupLabel(appliedSizeGroup, t('sizeGroupCommon'))}`
            : ''}
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
                {t('quoteSeason')}
              </span>
              <Select
                value={activeSeason}
                onValueChange={handleSeasonChange}
                disabled={seasonOptions.length < 2}
              >
                <SelectTrigger
                  className="style-input"
                  aria-label={t('quoteSeason')}
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
          {showSoSeason ? (
            <div className="filter">
              <span className="filter-label">{t('soSeason')}</span>
              <Select value={activeSoSeason} onValueChange={handleSoSeasonChange}>
                <SelectTrigger
                  className="style-input"
                  aria-label={t('soSeason')}
                >
                  <SelectValue placeholder={t('selectSoSeason')} />
                </SelectTrigger>
                <SelectContent className="rounded-[8px]">
                  {soSeasonOptions.map((option: string) => (
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
              value={appliedSizeGroup}
              onChange={handleSizeGroupChange}
            />
          ) : null}
        </div>
        {detail?.seasonMismatch ? (
          <div className="season-note-row">
            <div className="season-note" role="status">
              {t('seasonMismatchNote', {
                quoteSeason: detail.season,
                soSeason: detail.soSeason ?? '',
              })}
            </div>
          </div>
        ) : null}
      </header>

      <main id="view" data-ai-section-type="card-list">
        {renderBody()}
      </main>

      <UploadPhotosDialog
        open={photosOpen}
        onOpenChange={setPhotosOpen}
        styles={photoStyles}
        onAuthRequired={handleSessionExpired}
      />
      <UploadPhotosDialog
        open={bulkPhotosOpen}
        onOpenChange={setBulkPhotosOpen}
        styles={[]}
        bulk
        onAuthRequired={handleSessionExpired}
      />
      <LoginDialog
        open={loginOpen}
        onOpenChange={handleLoginOpenChange}
        onSuccess={handleLoginSuccess}
      />
      <UserManagementDialog open={usersOpen} onOpenChange={setUsersOpen} />
      <PhotoHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
};

export default PoSummaryPage;
