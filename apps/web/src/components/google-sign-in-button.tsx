import styles from './google-sign-in-button.module.css';

export function GoogleSignInButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className={styles.button} disabled={disabled} aria-busy={busy} onClick={onClick}>
    <img className={styles.icon} src="/auth/google-g.png" width={20} height={20} alt="" aria-hidden="true" />
    <span>{busy ? 'Google に接続しています…' : 'Google で続ける'}</span>
  </button>;
}
