'use client';
import { useId,useRef } from 'react';
import { Icon } from './ui';
export function ImageViewer({src,alt}:{src:string;alt:string}){
 const dialog=useRef<HTMLDialogElement>(null);const id=useId();
 return <><button type="button" className="button button-secondary" onClick={()=>dialog.current?.showModal()}><Icon name="search" size={17}/>拡大して見る</button><dialog ref={dialog} className="photo-lightbox" aria-labelledby={id}><header><h2 id={id}>{alt}</h2><button type="button" className="icon-button" aria-label="拡大表示を閉じる" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></header><img src={src} alt={alt}/><p>画像全体を表示しています。</p></dialog></>;
}
