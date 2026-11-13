import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createUser, fetchUsers, updateUser } from '../../lib/auth';
import type { AppUser } from '../../lib/auth';
import { useT } from '../../i18n';
import { storageErrorText } from '../utils/error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';

interface UserManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UserManagementDialog = ({
  open,
  onOpenChange,
}: UserManagementDialogProps) => {
  const t = useT();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [newEmpNo, setNewEmpNo] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [creating, setCreating] = useState(false);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchUsers();
      setUsers(result.users);
    } catch (reason) {
      setError(storageErrorText(reason, t('usersLoadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setResetId(null);
    setResetPassword('');
    setError('');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const result = await createUser({
        empNo: newEmpNo.trim(),
        password: newPassword,
        role: newRole,
      });
      setUsers((prev) => [...prev, result.user]);
      setNewEmpNo('');
      setNewPassword('');
      setNewRole('user');
      toast.success(`${t('userCreated')}: ${result.user.empName || result.user.username}`);
    } catch (reason) {
      setError(storageErrorText(reason, t('userCreateFailed')));
    } finally {
      setCreating(false);
    }
  };

  const patchUser = async (
    id: number,
    patch: { role?: 'admin' | 'user'; active?: boolean; password?: string },
    successText: string,
  ) => {
    setBusyId(id);
    setError('');
    try {
      const result = await updateUser(id, patch);
      setUsers((prev) =>
        prev.map((item) => (item.id === id ? result.user : item)),
      );
      toast.success(successText);
      return true;
    } catch (reason) {
      setError(storageErrorText(reason, t('userUpdateFailed')));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (user: AppUser) => {
    if (resetBusy || resetPassword.length < 8) return;
    setResetBusy(true);
    const ok = await patchUser(
      user.id,
      { password: resetPassword },
      t('passwordUpdated'),
    );
    if (ok) {
      setResetId(null);
      setResetPassword('');
    }
    setResetBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="po-dialog po-dialog--users"
        showCloseButton={false}
      >
        <DialogTitle asChild>
          <div className="po-dialog-head">
            <h2>{t('usersTitle')}</h2>
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
          {t('usersHint')}
        </DialogDescription>

        <div className="user-body">
          <form className="user-create" onSubmit={handleCreate}>
            <div className="user-create-title">{t('addUser')}</div>
            <div className="user-create-row">
              <input
                className="login-input"
                placeholder={t('employeeCode')}
                value={newEmpNo}
                onChange={(event) => setNewEmpNo(event.target.value)}
                autoComplete="off"
                maxLength={20}
                required
              />
              <input
                className="login-input"
                type="password"
                placeholder={t('newPassword')}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <select
                className="user-role-select"
                value={newRole}
                onChange={(event) =>
                  setNewRole(event.target.value as 'admin' | 'user')
                }
              >
                <option value="user">{t('roleUser')}</option>
                <option value="admin">{t('roleAdmin')}</option>
              </select>
              <button
                type="submit"
                className="po-btn po-btn--primary"
                disabled={creating || !newEmpNo.trim() || newPassword.length < 8}
              >
                {creating ? <Loader2 size={14} className="upload-spin" /> : null}
                {t('addUser')}
              </button>
            </div>
          </form>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="user-empty">{t('loadingUsers')}</div>
          ) : users.length === 0 ? (
            <div className="user-empty">{t('noUsers')}</div>
          ) : (
            <div className="user-list">
              {users.map((user) => (
                <div key={user.id} className="user-row">
                  <div className="user-main">
                    <div className="user-name">
                      {user.empName || user.username}
                      {user.role === 'admin' ? (
                        <span className="user-badge">{t('roleAdmin')}</span>
                      ) : null}
                    </div>
                    <div className="user-state">
                      {user.empNo ? `${user.empNo} · ` : ''}
                      {user.active ? t('active') : t('locked')}
                    </div>
                  </div>
                  <div className="user-actions">
                    <select
                      className="user-role-select"
                      value={user.role}
                      disabled={busyId === user.id}
                      onChange={(event) => {
                        const role = event.target.value as 'admin' | 'user';
                        void patchUser(user.id, { role }, t('userUpdated'));
                      }}
                    >
                      <option value="user">{t('roleUser')}</option>
                      <option value="admin">{t('roleAdmin')}</option>
                    </select>
                    <button
                      type="button"
                      className="po-btn"
                      disabled={busyId === user.id}
                      onClick={() =>
                        void patchUser(
                          user.id,
                          { active: !user.active },
                          t('userUpdated'),
                        )
                      }
                    >
                      {user.active ? t('lockUser') : t('unlockUser')}
                    </button>
                    <button
                      type="button"
                      className="po-btn"
                      disabled={busyId === user.id}
                      onClick={() => {
                        setResetId(resetId === user.id ? null : user.id);
                        setResetPassword('');
                      }}
                    >
                      {t('resetPassword')}
                    </button>
                  </div>
                  {resetId === user.id ? (
                    <div className="user-reset">
                      <input
                        className="login-input"
                        type="password"
                        placeholder={t('newPassword')}
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="po-btn po-btn--primary"
                        disabled={resetBusy || resetPassword.length < 8}
                        onClick={() => void handleResetPassword(user)}
                      >
                        {resetBusy ? <Loader2 size={14} className="upload-spin" /> : null}
                        {t('savePassword')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserManagementDialog;
