import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.mjs';
import { suggestTitle, chooseRetake, retakeResolved } from '../shared/review_metadata.mjs';

export default function TranscriptReview({ job, onClose, onApproved }) {
  const [review, setReview] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false), [playing, setPlaying] = useState(null);
  const panel = useRef(null);
  const audio = useRef(null), stopAt = useRef(0);
  useEffect(() => {
    let live = true;
    panel.current?.scrollIntoView({behavior:'smooth',block:'start'});
    api(`/api/jobs/${job.id}/review`).then(data => { if (live) setReview(data); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; audio.current?.pause(); };
  }, [job.id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function edit(id, changes) {
    setReview(old => ({ ...old, lines: old.lines.map(l => l.id === id ? { ...l, ...changes } : l),
      retakes:old.retakes.map(g=>('text' in changes || 'excluded' in changes) && g.lineIds.includes(id) ? {...g,keepLineIds:null} : g) }));
    setDirty(true);
  }
  async function play(line) {
    const element = audio.current;
    element.pause(); stopAt.current = line.end; setPlaying(line.id); setError('');
    const url = `/api/jobs/${job.id}/audio/${line.source}`;
    try {
      if (element.getAttribute('src') !== url || element.error) {
        element.src = url;
        await new Promise((resolve, reject) => {
          element.onloadedmetadata = resolve;
          element.onerror = () => reject(new Error('Audio is unavailable. It may have expired after 30 days, or your sign-in may need refreshing.'));
          element.load();
        });
      }
      element.currentTime = line.start;
      await element.play();
    } catch (e) { setError(e.message); setPlaying(null); }
  }
  async function save(approve = false) {
    setSaving(true); setError(''); audio.current?.pause();
    try {
      const saved = await api(`/api/jobs/${job.id}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: review.revision, projectTitle:review.projectTitle, retakes:review.retakes.map(({id,keepLineIds})=>({id,keepLineIds})), lines: review.lines.map(({id,text,accepted,excluded}) => ({id,text,accepted,excluded})) }) });
      setReview(old => ({ ...old, revision: saved.revision })); setDirty(false);
      if (approve) {
        await api(`/api/jobs/${job.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: saved.revision }) });
        onApproved();
      }
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  const remaining = review?.lines.filter(l => !l.accepted && !l.excluded).length || 0;
  const unresolved = review?.retakes.filter(g=>!retakeResolved(g,review.lines)).length || 0;
  function decide(group, keep) { setReview(old=>chooseRetake(old,group.id,keep));setDirty(true); }
  return <section ref={panel} className="transcript-review card" aria-label="Transcript review">
    <div className="review-heading"><div><h2>Review transcript · {job.batch_name}</h2><p className="muted">Confirm the words first. Montage and publishing have separate approval.</p></div><button className="text-button" onClick={() => { if (!dirty || window.confirm('Leave without saving your text changes?')) onClose(); }}>Close</button></div>
    {error && <div role="alert" className="banner error">{error}</div>}
    {!review ? <p>Loading transcript…</p> : <>
      <label htmlFor="project-title">Project title <span>Editable suggestion</span></label>
      <input id="project-title" className="project-title" value={review.projectTitle} maxLength={80} disabled={saving} onChange={e=>{setReview(old=>({...old,projectTitle:e.target.value}));setDirty(true);}}/>
      <div className="title-actions"><button type="button" className="text-button" disabled={saving} onClick={()=>{setReview(old=>({...old,projectTitle:suggestTitle(old.lines,job.batch_name)}));setDirty(true);}}>Suggest from included text</button><span>This title names the CapCut draft. A short suffix separates versions.</span></div>
      <p className="hint">{remaining} sentences and {unresolved} possible retakes left to review. Audio is available for 30 days after upload. Originals and approved text are retained.</p>
      <audio ref={audio} preload="none" onTimeUpdate={() => { if (audio.current.currentTime >= stopAt.current) { audio.current.pause(); setPlaying(null); } }} onEnded={() => setPlaying(null)} />
      {!!review.retakes.length && <section className="retake-section" aria-label="Possible retakes"><h3>Compare possible retakes</h3><p className="hint">Similar passages may be intentional. Nothing is excluded until you choose. Compare the full text: one take may contain additional content.</p>
        {review.retakes.map((group,index)=><div className="retake-card" key={group.id}>
          <div className="retake-heading"><strong>Comparison {index+1}</strong><span>{retakeResolved(group,review.lines) ? 'Resolved' : 'Choose what to include'}</span></div>
          <div className="retake-options">{group.lineIds.map(id=>{
            const line=review.lines.find(l=>l.id===id),source=review.sources.find(s=>s.id===line.source);
            return <div key={id} className={`retake-option ${line.excluded?'excluded':''}`}><strong>{source.name} · {Math.floor(line.start/60)}:{String(Math.floor(line.start%60)).padStart(2,'0')}</strong><p>{line.text}</p><span>{line.excluded?'Excluded':'Included'}</span><div className="retake-buttons"><button type="button" className="audio-button" disabled={saving || Date.now()>=review.audioExpiresAt} onClick={()=>play(line)}>{playing===id?'Playing…':'▶ Listen'}</button><button type="button" disabled={saving} onClick={()=>decide(group,[id])}>Keep only this passage</button></div></div>;
          })}</div>
          <div className="retake-buttons"><button type="button" disabled={saving} onClick={()=>decide(group,group.lineIds)}>Keep both</button><button type="button" disabled={saving} onClick={()=>decide(group,group.lineIds.filter(id=>!review.lines.find(l=>l.id===id).excluded))}>Confirm current exclusions</button></div>
        </div>)}
      </section>}
      {review.sources.map(source => <section key={source.id} className="review-source"><h3>{source.name}</h3>
        {review.lines.filter(l => l.source === source.id).map(line => <div key={line.id} className={`review-line ${line.excluded ? 'excluded' : ''}`}>
          <div className="review-line-top"><button type="button" className="audio-button" disabled={saving || Date.now() >= review.audioExpiresAt} aria-label={`Play sentence ${Number(line.id)+1}`} onClick={() => play(line)}>{playing === line.id ? 'Playing…' : '▶ Listen'} · {Math.floor(line.start / 60)}:{String(Math.floor(line.start % 60)).padStart(2,'0')}</button><span>{line.excluded ? 'Excluded' : line.accepted ? 'Accepted' : 'Needs review'}</span></div>
          <textarea aria-label={`Sentence ${Number(line.id)+1}`} value={line.text} disabled={saving || line.excluded} onChange={e => edit(line.id, {text:e.target.value,accepted:false})} />
          {!!line.uncertain.length && <p className="uncertain">Check these words: <mark>{line.uncertain.join(' · ')}</mark></p>}
          <div className="review-actions"><label><input type="checkbox" checked={line.accepted} disabled={saving || line.excluded} onChange={e => edit(line.id,{accepted:e.target.checked})}/> Wording accepted</label><label><input type="checkbox" checked={line.excluded} disabled={saving} onChange={e => edit(line.id,{excluded:e.target.checked})}/> Exclude from montage</label></div>
        </div>)}
      </section>)}
      <div className="review-toolbar"><button type="button" disabled={saving} onClick={() => { setReview(old => ({...old,lines:old.lines.map(l=>({...l,accepted:l.excluded ? l.accepted : true}))}));setDirty(true); }}>Accept remaining wording</button><button type="button" disabled={saving || !dirty} onClick={() => save()}>Save progress</button><button type="button" className="primary" disabled={saving || remaining > 0 || unresolved > 0 || !review.projectTitle.trim() || !review.lines.some(l=>!l.excluded)} onClick={() => save(true)}>{saving ? 'Saving…' : 'Approve text & create montage'}</button></div>
    </>}
  </section>;
}
