import React, {useEffect,useState} from 'react';
import {api} from './api.mjs';

export default function Thumbnails({jobId}) {
  const [open,setOpen]=useState(false),[gallery,setGallery]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[failed,setFailed]=useState({});
  const base=`/api/jobs/${jobId}/thumbnails`;
  async function load(){setLoading(true);setError('');try{setGallery(await api(base));}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{if(open && !gallery)load();},[open]);
  return <section className="thumbnail-picker">
    <button type="button" className="thumbnail-toggle" aria-expanded={open} aria-controls={`thumbnails-${jobId}`} onClick={()=>setOpen(!open)}>Thumbnail ideas <span aria-hidden="true">{open?'−':'+'}</span></button>
    {open && <div id={`thumbnails-${jobId}`}>
      <p className="hint">Pick an expression that fits your reel. Download the clean image to edit elsewhere.</p>
      {loading && <p role="status">Loading thumbnail ideas…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={load}>Try again</button></p>}
      {gallery && !gallery.frames.length && <p className="hint">{gallery.status==='no_candidates'?'No suitable face frames found in these recordings.':'Thumbnail ideas are not available for this video yet.'} <button type="button" disabled={loading} onClick={load}>Check again</button></p>}
      <div className="thumbnail-grid">{gallery?.frames.map((frame,i)=><figure key={frame.id}>
        {failed[frame.id]?<p className="hint">Image unavailable or expired.</p>:<img src={`${base}/${frame.id}?preview=1`} alt={`Thumbnail idea ${i+1} from ${frame.sourceName}`} loading="lazy" width={frame.width} height={frame.height} onError={()=>setFailed(old=>({...old,[frame.id]:true}))}/>}
        <figcaption><span>{frame.sourceName} · {Math.floor(frame.time/60)}:{(frame.time%60).toFixed(1).padStart(4,'0')}</span><a className="thumbnail-download" href={`${base}/${frame.id}?download=1`} download={`thumbnail-${frame.source}-${Math.round(frame.time*1000)}ms.jpg`}>Download <span className="sr-only">idea {i+1}</span><span aria-hidden="true">↓</span></a></figcaption>
      </figure>)}</div>
    </div>}
  </section>;
}
