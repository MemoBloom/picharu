'use client';

import { useState, type Ref } from 'react';
import { Loading } from './ui';
import styles from './photo-preview.module.css';

type Props = {
  src?: string | null;
  alt: string;
  caption: string;
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  imageRef?: Ref<HTMLImageElement>;
  onLoad?: () => void;
  onRetry?: () => void;
};

function PreviewImage({ src, alt, imageRef, onLoad, onRetry }: Props & { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div className={styles.placeholder} role="status"><p>画像を表示できませんでした。</p><p className="muted">接続やプレビューの有効期限を確認して、再読み込みしてください。</p><button type="button" className="button button-secondary" onClick={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); onRetry?.(); }}>画像を再読み込み</button></div>;
  return <>
    <img key={attempt} ref={imageRef} className={styles.image} data-loaded={loaded} src={src} alt={alt} onLoad={() => { setLoaded(true); onLoad?.(); }} onError={() => setFailed(true)} />
    {!loaded && <div className={styles.loading}><Loading label="画像を読み込んでいます…" /></div>}
  </>;
}

/** A bounded image stage; captions and task status never share its height limit. */
export function PhotoPreview(props: Props) {
  const { src, alt, caption, loading, error, emptyLabel = '写真を表示できません。', onRetry } = props;
  return <figure className={styles.preview}>
    <div className={styles.frame}>
      {error ? <div className={styles.placeholder} role="status"><p>{error}</p>{onRetry && <button type="button" className="button button-secondary" onClick={onRetry}>画像を再読み込み</button>}</div>
        : src ? <PreviewImage key={src} {...props} src={src} />
        : loading ? <div className={styles.placeholder}><Loading label="画像を読み込んでいます…" /></div>
        : <div className={styles.placeholder}><p>{emptyLabel}</p>{onRetry && <button type="button" className="button button-secondary" onClick={onRetry}>画像を再読み込み</button>}</div>}
    </div>
    <figcaption className={styles.caption}>{caption}</figcaption>
  </figure>;
}
