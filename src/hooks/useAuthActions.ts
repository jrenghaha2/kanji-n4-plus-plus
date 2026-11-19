import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  auth,
  createGoogleAccountPickerProvider,
  githubProvider,
  googleProvider,
} from '../firebase';
import { mapFirebaseAuthError } from '../utils/authErrors';
import { sanitizeDisplayName } from '../utils/progressSync';
import type { ShowToastFn } from './useToast';

interface UseAuthActionsOptions {
  showToast: ShowToastFn;
}

export function useAuthActions({ showToast }: UseAuthActionsOptions) {
  const [user, setUser] = useState<User | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authSwitchMode, setAuthSwitchMode] = useState(false);
  const [authErrorText, setAuthErrorText] = useState<string | null>(null);
  const [authInfoText, setAuthInfoText] = useState<string | null>(null);
  const [authConsoleHint, setAuthConsoleHint] = useState(false);

  const justSignedInRef = useRef(false);

  const bumpAuthVersion = useCallback(() => {
    setAuthVersion(v => v + 1);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setAuthVersion(v => v + 1);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const clearAuthNotices = useCallback(() => {
    setAuthErrorText(null);
    setAuthInfoText(null);
    setAuthConsoleHint(false);
  }, []);

  const handleOpenAuthModal = useCallback(
    (isSwitch: boolean) => {
      clearAuthNotices();
      setAuthSwitchMode(isSwitch);
      setAuthModalOpen(true);
    },
    [clearAuthNotices]
  );

  const handleGoogleLogin = useCallback(
    async (forceSelectAccount: boolean) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      justSignedInRef.current = true;
      try {
        const provider = forceSelectAccount
          ? createGoogleAccountPickerProvider()
          : googleProvider;
        await signInWithPopup(auth, provider);
        setAuthModalOpen(false);
      } catch (err) {
        justSignedInRef.current = false;
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices]
  );

  const handleGithubLogin = useCallback(async () => {
    if (authBusy) return;
    clearAuthNotices();
    setAuthBusy(true);
    justSignedInRef.current = true;
    try {
      await signInWithPopup(auth, githubProvider);
      setAuthModalOpen(false);
    } catch (err) {
      justSignedInRef.current = false;
      const mapped = mapFirebaseAuthError(err);
      setAuthErrorText(mapped.message);
      setAuthConsoleHint(mapped.showConsoleHint);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, clearAuthNotices]);

  const handleEmailSignIn = useCallback(
    async (email: string, password: string) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      justSignedInRef.current = true;
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        setAuthModalOpen(false);
        if (!cred.user.emailVerified) {
          showToast(
            'warning',
            'Verifikasi Email Diperlukan',
            `Cek kotak masuk ${cred.user.email} untuk mengaktifkan sinkronisasi cloud.`
          );
        }
      } catch (err) {
        justSignedInRef.current = false;
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices, showToast]
  );

  const handleEmailSignUp = useCallback(
    async (name: string, email: string, password: string) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      justSignedInRef.current = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const cleanName = sanitizeDisplayName(name) || email.trim().split('@')[0];
        if (cleanName) {
          await updateProfile(cred.user, { displayName: cleanName });
        }
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // Non-fatal if rate-limited
        }
        setAuthModalOpen(false);
        showToast(
          'info',
          'Akun Dibuat · Cek Email',
          `Tautan verifikasi dikirim ke ${cred.user.email}. Verifikasi untuk mulai sinkronisasi cloud.`
        );
      } catch (err) {
        justSignedInRef.current = false;
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices, showToast]
  );

  const handleEmailReset = useCallback(
    async (email: string) => {
      if (authBusy) return;
      clearAuthNotices();
      setAuthBusy(true);
      try {
        await sendPasswordResetEmail(auth, email.trim());
        setAuthInfoText(`Tautan reset kata sandi telah dikirim ke ${email.trim()}.`);
      } catch (err) {
        const mapped = mapFirebaseAuthError(err);
        setAuthErrorText(mapped.message);
        setAuthConsoleHint(mapped.showConsoleHint);
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, clearAuthNotices]
  );

  const handleResendVerification = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || authBusy) return;
    setAuthBusy(true);
    try {
      await sendEmailVerification(current);
      showToast('success', 'Email Verifikasi Terkirim', `Periksa kotak masuk ${current.email}.`);
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      showToast('error', 'Gagal Mengirim Email', mapped.message);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, showToast]);

  const handleRefreshVerification = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || authBusy) return;
    setAuthBusy(true);
    try {
      await current.reload();
      await current.getIdToken(true);
      setAuthVersion(v => v + 1);
      if (current.emailVerified) {
        showToast('success', 'Email Terverifikasi', 'Sinkronisasi cloud kini aktif.');
      } else {
        showToast(
          'info',
          'Belum Terverifikasi',
          'Silakan klik tautan verifikasi di email Anda lalu tekan Cek Status lagi.'
        );
      }
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      showToast('error', 'Gagal Memeriksa Status', mapped.message);
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, showToast]);

  const executeSignOut = useCallback(
    async (onAfterSignOut: () => void) => {
      if (authBusy) return;
      setAuthBusy(true);
      try {
        await signOut(auth);
        justSignedInRef.current = false;
        onAfterSignOut();
        showToast(
          'info',
          'Berhasil Keluar',
          'Progres & riwayat kuis N4 dan Irodori Anda tetap tersimpan aman di akun Anda.'
        );
      } catch (err) {
        showToast(
          'error',
          'Gagal Keluar',
          err instanceof Error ? err.message : 'Tidak dapat keluar dari akun saat ini.'
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [authBusy, showToast]
  );

  return {
    user,
    authVersion,
    authReady,
    authBusy,
    authModalOpen,
    setAuthModalOpen,
    authSwitchMode,
    authErrorText,
    authInfoText,
    authConsoleHint,
    justSignedInRef,
    bumpAuthVersion,
    clearAuthNotices,
    handleOpenAuthModal,
    handleGoogleLogin,
    handleGithubLogin,
    handleEmailSignIn,
    handleEmailSignUp,
    handleEmailReset,
    handleResendVerification,
    handleRefreshVerification,
    executeSignOut,
  };
}
