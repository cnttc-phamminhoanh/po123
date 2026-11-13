import { useEffect, useRef, useState } from 'react';
import { logger } from '../../lib/logger';
import { ApiError } from '../../lib/http';
import { uploadStylePhoto } from '../../lib/upload';
import { ImageUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { useT } from '../../i18n';
import type { TKey } from '../../i18n';
import { errorMessage, storageErrorText } from '../utils/error';
import { matchStyle, styleCodeFromFileName } from '../utils/photo';
import type { StyleRef } from '../utils/photo';

type TaskStatus = 'pending' | 'uploading' | 'done' | 'error';

interface PhotoTask {
  id: string;
  file: File;
  styleCode: string;
  styleName: string;
  status: TaskStatus;
  message: string;
}

interface UploadPhotosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  styles: StyleRef[];
  bulk?: boolean;
  onAuthRequired?: () => void;
}

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

const buildTask = (
  file: File,
  index: number,
  styles: StyleRef[],
  t: Translate,
  bulk: boolean,
): PhotoTask => {
  // Khi mở từ thẻ ảnh của một style, chỉ có một style trong danh sách:
  // ảnh người dùng chọn được gán thẳng vào style đó, không phụ thuộc tên file.
  // Khi upload hàng loạt, mã style được đọc từ tên file (bỏ phần mở rộng).
  const matched: StyleRef | undefined =
    matchStyle(file.name, styles) ?? (styles.length === 1 ? styles[0] : undefined);
  const styleCode: string = matched?.code ?? (bulk ? styleCodeFromFileName(file.name).toUpperCase() : '');
  return {
    id: `${file.name}-${file.size}-${index}`,
    file,
    styleCode,
    styleName: matched?.name ?? '',
    status: 'pending',
    message: styleCode ? t('willLink') : t('noStyleName'),
  };
};

const UploadPhotosDialog = ({
  open,
  onOpenChange,
  styles,
  bulk = false,
  onAuthRequired,
}: UploadPhotosDialogProps) => {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<PhotoTask[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const queryClient = useQueryClient();
  const singleStyle = styles.length === 1;

  useEffect(() => {
    if (!open) {
      setTasks([]);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  const appendFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files: File[] = Array.from(fileList);
    setTasks((prev: PhotoTask[]) => {
      const next: PhotoTask[] = files.map((file: File, index: number) =>
        buildTask(file, prev.length + index, styles, t, bulk),
      );
      // Một style chỉ có một ảnh: chọn ảnh mới sẽ thay ảnh đang chờ.
      return singleStyle ? next.slice(0, 1) : [...prev, ...next];
    });
  };

  const patchTask = (id: string, patch: Partial<PhotoTask>) => {
    setTasks((prev: PhotoTask[]) =>
      prev.map((task: PhotoTask) =>
        task.id === id ? { ...task, ...patch } : task,
      ),
    );
  };

  const updateTaskCode = (id: string, value: string) => {
    const styleCode: string = value.trim().toUpperCase();
    patchTask(id, {
      styleCode,
      styleName: '',
      message: styleCode ? t('willLink') : t('noStyleName'),
    });
  };

  const matchedCount: number = tasks.filter(
    (task: PhotoTask) => task.status === 'done' || Boolean(task.styleCode),
  ).length;

  const handleUpload = async () => {
    if (busy || tasks.length === 0) return;
    setBusy(true);
    const uploaded = new Set<string>();
    try {
      for (const task of tasks) {
        if (task.status === 'done') continue;
        if (!task.styleCode) {
          patchTask(task.id, {
            status: 'error',
            message: t('noStyleName'),
          });
          continue;
        }
        patchTask(task.id, { status: 'uploading', message: t('uploading') });
        try {
          await uploadStylePhoto(task.styleCode, task.file);
          uploaded.add(task.styleCode);
          patchTask(task.id, { status: 'done', message: t('linkedToStyle') });
        } catch (error) {
          logger.error('上传样式图片失败', error);
          if (error instanceof ApiError && error.status === 401) {
            onAuthRequired?.();
            return;
          }
          patchTask(task.id, {
            status: 'error',
            message: storageErrorText(error, t('uploadFailed')),
          });
        }
      }

      uploaded.forEach((styleCode: string) => {
        void queryClient.invalidateQueries({
          queryKey: ['bom', 'style', styleCode],
        });
      });

      if (uploaded.size > 0) {
        toast.success(t('nLinked', { n: uploaded.size }));
      }
    } catch (error) {
      logger.error('上传样式图片失败', error);
      toast.error(errorMessage(error, t('uploadFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="po-dialog po-dialog--wide po-dialog--upload" showCloseButton={false}>
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{bulk ? t('bulkUpload') : t('uploadPhotos')}</h2>
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
          {t('ariaUploadDesc')}
        </DialogDescription>

        <div className="po-dialog-body po-dialog-body--single">
          <section className="spec-group">
            <h3>{t('howLinkingWorks')}</h3>
            <p className="upload-hint">
              {bulk
                ? t('bulkUploadHint')
                : t('uploadHint', { code: '1R303710.jpg', code2: '1R303710' })}
            </p>
            {styles.length > 0 ? (
              <div className="upload-codes">
                {styles.map((style: StyleRef) => (
                  <span className="upload-code" key={style.code}>
                    {style.code}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="spec-group">
            <h3>{t('files')}</h3>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple={!singleStyle}
              className="upload-input"
              aria-label={t('choosePhotosAria')}
              onChange={(event) => appendFiles(event.target.files)}
            />
            <button
              type="button"
              className="upload-zone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                appendFiles(event.dataTransfer.files);
              }}
              disabled={busy}
            >
              <ImageUp size={18} />
              <span>{t('choosePhotos')}</span>
              <em>{singleStyle ? t('onePhotoPerStyle') : t('multipleFiles')}</em>
            </button>

            {tasks.length === 0 ? (
              <p className="upload-empty">{t('noPhotos')}</p>
            ) : (
              <ul className="upload-list">
                {tasks.map((task: PhotoTask) => (
                  <li className="upload-item" key={task.id}>
                    <div className="upload-item-main">
                      <span className="upload-name">{task.file.name}</span>
                      {bulk ? (
                        <input
                          className="upload-code-input"
                          value={task.styleCode}
                          placeholder={t('styleCodePlaceholder')}
                          spellCheck={false}
                          aria-label={t('styleCodePlaceholder')}
                          onChange={(event) => updateTaskCode(task.id, event.target.value)}
                        />
                      ) : (
                        <span className="upload-meta">
                          {task.styleCode
                            ? [task.styleCode, task.styleName].filter(Boolean).join(' · ')
                            : t('unmatchedFileName')}
                        </span>
                      )}
                    </div>
                    <span className={`upload-status upload-status--${task.status}`}>
                      {task.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="po-dialog-foot">
          <button
            type="button"
            className="po-btn"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('close')}
          </button>
          <button
            type="button"
            className="po-btn po-btn--primary"
            onClick={() => void handleUpload()}
            disabled={busy || tasks.length === 0}
          >
            {busy ? <Loader2 size={14} className="upload-spin" /> : null}
            {busy ? t('uploading') : t('uploadN', { n: matchedCount })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UploadPhotosDialog;
