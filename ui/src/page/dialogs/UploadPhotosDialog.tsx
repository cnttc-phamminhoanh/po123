import { useEffect, useRef, useState } from 'react';
import { logger } from '../../lib/logger';
import { isUploadConfigured, uploadPhoto } from '../../lib/upload';
import { ImageUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import type {
  BindStylePhotosResponse,
  StylePhotoInput,
} from '../../types';
import { useBindStylePhotos } from '../hooks';
import { useT } from '../../i18n';
import type { TKey } from '../../i18n';
import { errorMessage, storageErrorText } from '../utils/error';
import { matchStyle } from '../utils/photo';
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
}

type Translate = (key: TKey, vars?: Record<string, string | number>) => string;

const buildTask = (
  file: File,
  index: number,
  styles: StyleRef[],
  t: Translate,
): PhotoTask => {
  const matched: StyleRef | undefined = matchStyle(file.name, styles);
  return {
    id: `${file.name}-${file.size}-${index}`,
    file,
    styleCode: matched?.code ?? '',
    styleName: matched?.name ?? '',
    status: 'pending',
    message: matched ? t('willLink') : t('noStyleName'),
  };
};

const UploadPhotosDialog = ({
  open,
  onOpenChange,
  styles,
}: UploadPhotosDialogProps) => {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<PhotoTask[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const bindPhotos = useBindStylePhotos();

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
    setTasks((prev: PhotoTask[]) => [
      ...prev,
      ...files.map((file: File, index: number) =>
        buildTask(file, prev.length + index, styles, t),
      ),
    ]);
  };

  const patchTask = (id: string, patch: Partial<PhotoTask>) => {
    setTasks((prev: PhotoTask[]) =>
      prev.map((task: PhotoTask) =>
        task.id === id ? { ...task, ...patch } : task,
      ),
    );
  };

  const matchedCount: number = tasks.filter(
    (task: PhotoTask) => task.status === 'done' || Boolean(task.styleCode),
  ).length;

  const handleUpload = async () => {
    if (busy || tasks.length === 0) return;
    if (!isUploadConfigured()) {
      toast.error(t('uploadNotConfigured'), {
        description: t('uploadNotConfiguredDesc'),
      });
      return;
    }
    setBusy(true);
    const payload: StylePhotoInput[] = [];
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
          const photoUrl: string = await uploadPhoto(task.file);
          payload.push({
            styleCode: task.styleCode,
            fileName: task.file.name,
            photoUrl,
          });
          patchTask(task.id, { status: 'pending', message: t('uploaded') });
        } catch (error) {
          logger.error('上传样式图片失败', error);
          patchTask(task.id, {
            status: 'error',
            message: storageErrorText(error, t('uploadFailed')),
          });
        }
      }

      if (payload.length > 0) {
        const result: BindStylePhotosResponse =
          await bindPhotos.mutateAsync(payload);
        setTasks((prev: PhotoTask[]) =>
          prev.map((task: PhotoTask) => {
            const linked = result.bound.some(
              (binding: { styleCode: string }) =>
                binding.styleCode === task.styleCode,
            );
            return linked && task.status !== 'error'
              ? { ...task, status: 'done', message: t('linkedToStyle') }
              : task;
          }),
        );
        if (result.unmatched.length > 0) {
          toast.error(t('nSkipped', { n: result.unmatched.length }));
        }
        if (result.bound.length > 0) {
          toast.success(t('nLinked', { n: result.bound.length }));
        }
      }
    } catch (error) {
      logger.error('关联样式图片失败', error);
      toast.error(errorMessage(error, t('linkingFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="po-dialog po-dialog--wide" showCloseButton={false}>
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{t('uploadPhotos')}</h2>
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
              {t('uploadHint', { code: '1R303710.jpg', code2: '1R303710' })}
            </p>
            <div className="upload-codes">
              {styles.map((style: StyleRef) => (
                <span className="upload-code" key={style.code}>
                  {style.code}
                </span>
              ))}
            </div>
          </section>

          <section className="spec-group">
            <h3>{t('files')}</h3>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
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
              <em>{t('multipleFiles')}</em>
            </button>

            {tasks.length === 0 ? (
              <p className="upload-empty">{t('noPhotos')}</p>
            ) : (
              <ul className="upload-list">
                {tasks.map((task: PhotoTask) => (
                  <li className="upload-item" key={task.id}>
                    <div className="upload-item-main">
                      <span className="upload-name">{task.file.name}</span>
                      <span className="upload-meta">
                        {task.styleCode
                          ? `${task.styleCode} · ${task.styleName}`
                          : t('unmatchedFileName')}
                      </span>
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
