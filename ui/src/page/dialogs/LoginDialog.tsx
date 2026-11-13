import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { login } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth';
import { useT } from '../../i18n';
import { storageErrorText } from '../utils/error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (user: AuthUser) => void;
}

const LoginDialog = ({ open, onOpenChange, onSuccess }: LoginDialogProps) => {
  const t = useT();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await login(username.trim(), password);
      if (result.user) onSuccess(result.user);
      onOpenChange(false);
    } catch (reason) {
      setError(storageErrorText(reason, t('loginFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="po-dialog po-dialog--login"
        showCloseButton={false}
      >
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{t('loginTitle')}</h2>
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
          {t('loginHint')}
        </DialogDescription>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>{t('username')}</span>
            <input
              className="login-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              spellCheck={false}
              autoFocus
              required
            />
          </label>
          <label className="login-field">
            <span>{t('password')}</span>
            <input
              className="login-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <p className="login-hint">{t('loginHint')}</p>
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="login-actions">
            <button
              type="button"
              className="po-btn"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t('close')}
            </button>
            <button
              type="submit"
              className="po-btn po-btn--primary"
              disabled={busy || !username.trim() || !password}
            >
              {busy ? <Loader2 size={14} className="upload-spin" /> : null}
              {busy ? t('loggingIn') : t('loginSubmit')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
