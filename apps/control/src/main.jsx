import TranscriptReview from './TranscriptReview.jsx';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { api } from './api.mjs';
const previewOnly = import.meta.env.DEV;

const labels = { awaiting_review: 'Text ready for review', queued: 'Queued', preparing: 'Preparing footage', transcribing: 'Transcribing', planning: 'Choosing cuts', captions: 'Styling captions', building: 'Building project', waiting_for_capcut: 'Waiting for CapCut to close', ready: 'Ready for review', failed: 'Needs attention' };
const steps = ['preparing', 'transcribing', 'planning', 'captions', 'building', 'ready'];
const time = value => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function App() {
  const [reviewJob, setReviewJob] = useState(null);
  const [removeJob, setRemoveJob] = useState(null), [removing, setRemoving] = useState(false);
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [batchId, setBatch] = useState(''), [brief, setBrief] = useState(''), [busy, setBusy] = useState(false);
  async function refresh() {
    try { setData(await api('/api/overview')); setError(''); } catch (e) { setError(e.message); }
  }
  useEffect(() => {
    if (previewOnly) return;
    refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer);
  }, []);
  const online = data?.worker && Date.now() - data.worker.lastSeen < 120000;
  const batches = data?.batches || [], jobs = data?.jobs || [];
  const active = jobs.filter(j => ['running', 'queued', 'awaiting_review', 'delete_queued'].includes(j.status));
  const selected = batches.find(b => b.id === batchId);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const result = await api('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId, brief }) });
      setNotice(result.existing ? 'This batch is already in the queue.' : 'Transcription requested. Review the text here before creating your montage.');
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function confirmRemoval() {
    setRemoving(true);setError('');setNotice('');
    try {
      await api(`/api/jobs/${removeJob.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
      if(reviewJob?.id===removeJob.id)setReviewJob(null);
      setRemoveJob(null);setNotice('Removal queued. Your PC will back up and remove the CapCut draft when CapCut is closed.');
      await refresh();
    } catch(e){setError(e.message);}finally{setRemoving(false);}
  }
  return <div className="shell">
    <header><a className="brand" href="/"><span className="brand-icon">c<span>↗</span></span>cutroom<span className="brand-sub">YOUR EDITING DESK</span></a><div className="account"><span className={`dot ${online ? 'online' : ''}`} />{online ? 'PC connected' : 'PC offline'}{data?.email && <span className="email">{data.email}</span>}</div></header>
    <main>
      <div className="intro"><div><p className="eyebrow">RECORD. UPLOAD. MAKE THE CUT.</p><h1>Your next video,<br/><span>one draft away.</span></h1><p className="lede">Drop your takes in Drive. Review the text, then create a CapCut draft<br className="desktop"/> with suggested cuts and captions, ready for your eye.</p></div><a className="drive-link" target="_blank" rel="noreferrer" href={data?.inboxUrl || 'https://drive.google.com/drive/folders/1Gnbuq3g6SfZckD7iBWGmRWacWK0vgCnW'}><span>↗</span> Open recording inbox</a></div>
      {previewOnly && <div role="status" className="banner preview">Design preview · Connect Cloudflare and your PC worker to load recordings and create drafts.</div>}
      {error && <div role="alert" className="banner error">{error} <button type="button" onClick={refresh}>Try again</button></div>}
      {notice && <div role="status" className="banner success">{notice}</div>}
      {removeJob && <section className="remove-confirm card" role="dialog" aria-modal="false" aria-labelledby="remove-heading"><h2 id="remove-heading">Remove {removeJob.project_name || removeJob.batch_name}?</h2><p>The PC worker will back up and delete the local CapCut draft, then remove this entry. If CapCut is open or your PC is offline, removal will wait. Original recordings and backups are kept.</p>{reviewJob?.id===removeJob.id && <p>Unsaved review edits will be discarded.</p>}<div className="retake-buttons"><button type="button" disabled={removing} className="remove-button" onClick={confirmRemoval}>{removing?'Requesting removal…':'Remove entry & CapCut draft'}</button><button type="button" disabled={removing} onClick={()=>setRemoveJob(null)}>Cancel</button></div></section>}
      {reviewJob && <TranscriptReview key={reviewJob.id} job={reviewJob} onClose={() => setReviewJob(null)} onApproved={() => {setReviewJob(null);setNotice("Text approved. Montage queued for your PC.");refresh();}}/>}
      <div className="workspace"><section className="compose card"><div className="section-heading"><span className="number">01</span><h2>Start with the transcript</h2></div><p className="muted">One recording batch. One fresh starting point.</p>
        <form onSubmit={submit}><label htmlFor="batch">Recording batch</label><select id="batch" value={batchId} onChange={e => setBatch(e.target.value)} required><option value="">{batches.length ? 'Choose a batch from Drive' : 'No synced batches yet'}</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name} · {b.files} takes</option>)}</select>
          <p className="hint">{selected ? `${selected.files} files · ${(selected.bytes / 1024 ** 2).toFixed(0)} MB · available on your PC` : 'Upload into a subfolder of vids, then wait for the PC to finish syncing.'}</p>
          <label htmlFor="brief">Review notes <span>Optional</span></label><textarea id="brief" placeholder="Notes for reviewing this draft…" rows="4" value={brief} maxLength={2000} onChange={e => setBrief(e.target.value)}/><p className="hint">First-pass cuts keep recording order and remove near-duplicates. These notes are saved for review; they do not guide automatic selection yet.</p>
          <p className="hint">Your montage keeps the included text in recording order, with duplicate removal and no duration limit.</p>
          <div className="style-note"><span className="caption-sample">YOUR <b>WORDS</b></span><div><strong>Your signature captions</strong><p>Montra · active-word highlight · vertical 9:16</p></div></div>
          <button className="primary" disabled={busy || !online || !selected}>{busy ? 'Adding to queue…' : 'Transcribe recordings'}<span>↗</span></button><p className="fineprint">Transcribes first. Montage starts after you approve the text.</p>
        </form></section>
        <section className="activity"><div className="section-heading"><span className="number">02</span><h2>On the editing desk</h2><span className="count">{active.length} active</span></div>
          {!data && !error && !previewOnly ? <div className="empty card"><span className="empty-icon">◌</span><h3>Connecting to your desk…</h3></div> : jobs.length === 0 ? <div className="empty card"><span className="empty-icon">▤</span><h3>Space for your next idea.</h3><p>Your draft requests and progress will appear here.</p><div className="empty-steps"><span>Upload takes</span><i>→</i><span>Request a draft</span><i>→</i><span>Review in CapCut</span></div></div> : <div className="job-list">{jobs.map(job => <article className={`job card ${job.status}`} key={job.id}><div className="job-top"><span className={`pill ${job.status}`}>{job.phase==='delete' ? job.status==='delete_failed' ? 'Removal needs attention' : job.stage==='waiting_for_capcut' ? 'Close CapCut to remove' : 'Removal queued / in progress' : labels[job.stage] || job.stage}</span><time>{time(job.created_at)}</time></div><h3>{job.batch_name}</h3><p className="job-meta">{job.phase === 'delete' ? 'Original recordings are kept' : job.phase === 'legacy' ? 'Legacy draft' : 'Reviewed text'} · Montra captions{job.attempt > 1 ? ` · attempt ${job.attempt}` : ''}</p>{job.status === 'running' && job.phase!=='delete' && <div className="progress" aria-label={labels[job.stage]}>{steps.map((s,i) => <span className={i <= steps.indexOf(job.stage) || (job.stage === 'waiting_for_capcut' && i < 5) ? 'filled' : ''} key={s}/>)}</div>}{job.message && <p className="job-message">{job.message}</p>}{job.project_name && <p className="project-name">CapCut project: <strong>{job.project_name}</strong></p>}{job.status === 'awaiting_review' && <button className="primary" onClick={() => setReviewJob(job)}>Review transcript & listen</button>}{job.status === 'failed' && <button className="text-button" onClick={() => { setBatch(job.batch_id); setBrief(job.brief); setNotice('Batch loaded into the form. Review it and submit to try again.'); document.getElementById('batch')?.focus(); }}>Use settings to retry ↗</button>}{job.status!=='delete_queued' && !(job.status==='running' && job.phase==='delete') && <button type="button" className="text-button remove-link" disabled={job.status==='running' || removing} title={job.status==='running'?'Wait for processing to finish before removal.':undefined} onClick={()=>{setRemoveJob(job);window.scrollTo({top:0,behavior:'smooth'});}}>{job.status==='delete_failed'?'Retry removal':'Remove draft'}</button>}</article>)}</div>}
          <aside className="worker-note"><span className={`dot ${online ? 'online' : ''}`}/><div><strong>{online ? 'Your PC is standing by' : 'Your PC worker is offline'}</strong><p>{online ? data.worker.message || 'Jobs run one at a time. You can check progress from anywhere.' : 'Start the worker on your Windows PC to see synced batches and create drafts.'}</p>{data?.worker && !online && <small>Last connected {time(data.worker.lastSeen)}</small>}</div></aside>
        </section></div>
      <footer><span>Made for the part after you hit record.</span><span>Drafts stay yours to review. Publishing is a separate step.</span></footer>
    </main></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
