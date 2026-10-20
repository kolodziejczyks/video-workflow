import TranscriptReview from './TranscriptReview.jsx';
import JobCard from './JobCard.jsx';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { api } from './api.mjs';
const previewOnly = import.meta.env.DEV;

function App() {
  const [tab, setTab] = useState(() => window.location.hash === '#videos' ? 'videos' : 'create');
  function selectTab(next) { setTab(next); window.history.replaceState(null, '', `#${next}`); }
  function tabKey(event) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'create' : event.key === 'End' ? 'videos' : tab === 'create' ? 'videos' : 'create';
    selectTab(next); document.getElementById(`tab-${next}`)?.focus();
  }
  useEffect(() => { const syncTab=()=>setTab(window.location.hash==='#videos'?'videos':'create'); window.addEventListener('hashchange',syncTab); return ()=>window.removeEventListener('hashchange',syncTab); }, []);
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
      await refresh(); selectTab('videos');
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
      <nav className="workspace-tabs" role="tablist" aria-label="Workspace">
        <button id="tab-create" role="tab" aria-selected={tab==='create'} aria-controls="panel-create" tabIndex={tab==='create'?0:-1} onKeyDown={tabKey} onClick={()=>selectTab('create')}>Create</button>
        <button id="tab-videos" role="tab" aria-selected={tab==='videos'} aria-controls="panel-videos" tabIndex={tab==='videos'?0:-1} onKeyDown={tabKey} onClick={()=>selectTab('videos')}>Videos{active.length>0 && <span className="tab-count">{active.length}</span>}</button>
      </nav>
      {tab=== 'create' && <div className="intro"><div><p className="eyebrow">RECORD. UPLOAD. MAKE THE CUT.</p><h1>Your next video,<br/><span>one draft away.</span></h1><p className="lede">Drop your takes in Drive. Review the text, then create a CapCut draft<br className="desktop"/> with suggested cuts and captions, ready for your eye.</p></div><a className="drive-link" target="_blank" rel="noreferrer" href={data?.inboxUrl || 'https://drive.google.com/drive/folders/1Gnbuq3g6SfZckD7iBWGmRWacWK0vgCnW'}><span>↗</span> Open recording inbox</a></div>}
      {previewOnly && <div role="status" className="banner preview">Design preview · Connect Cloudflare and your PC worker to load recordings and create drafts.</div>}
      {error && <div role="alert" className="banner error">{error} <button type="button" onClick={refresh}>Try again</button></div>}
      {notice && <div role="status" className="banner success">{notice}</div>}
      {tab==='videos' && removeJob && <section className="remove-confirm card" role="dialog" aria-modal="false" aria-labelledby="remove-heading"><h2 id="remove-heading">Remove {removeJob.project_name || removeJob.batch_name}?</h2><p>The PC worker will back up and delete the local CapCut draft, then remove this entry. If CapCut is open or your PC is offline, removal will wait. Original recordings and backups are kept.</p>{reviewJob?.id===removeJob.id && <p>Unsaved review edits will be discarded.</p>}<div className="retake-buttons"><button type="button" disabled={removing} className="remove-button" onClick={confirmRemoval}>{removing?'Requesting removal…':'Remove entry & CapCut draft'}</button><button type="button" disabled={removing} onClick={()=>setRemoveJob(null)}>Cancel</button></div></section>}
      {reviewJob && <div hidden={tab!=='videos'}><TranscriptReview key={reviewJob.id} job={reviewJob} onClose={() => setReviewJob(null)} onApproved={() => {setReviewJob(null);setNotice("Text approved. Montage queued for your PC.");refresh();}}/></div>}
      <div className="workspace tab-workspace"><section id="panel-create" role="tabpanel" aria-labelledby="tab-create" hidden={tab!=='create'} className="compose card"><div className="section-heading"><span className="number">01</span><h2>Start with the transcript</h2></div><p className="muted">One recording batch. One fresh starting point.</p>
        <form onSubmit={submit}><label htmlFor="batch">Recording batch</label><select id="batch" value={batchId} onChange={e => setBatch(e.target.value)} required><option value="">{batches.length ? 'Choose a batch from Drive' : 'No synced batches yet'}</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name} · {b.files} takes</option>)}</select>
          <p className="hint">{selected ? `${selected.files} files · ${(selected.bytes / 1024 ** 2).toFixed(0)} MB · available on your PC` : 'Upload into a subfolder of vids, then wait for the PC to finish syncing.'}</p>
          <label htmlFor="brief">Review notes <span>Optional</span></label><textarea id="brief" placeholder="Notes for reviewing this draft…" rows="4" value={brief} maxLength={2000} onChange={e => setBrief(e.target.value)}/><p className="hint">First-pass cuts keep recording order and remove near-duplicates. These notes are saved for review; they do not guide automatic selection yet.</p>
          <p className="hint">Your montage keeps the included text in recording order, with duplicate removal and no duration limit.</p>
          <div className="style-note"><span className="caption-sample">YOUR <b>WORDS</b></span><div><strong>Your signature captions</strong><p>Montra · active-word highlight · vertical 9:16</p></div></div>
          <button className="primary" disabled={busy || !online || !selected}>{busy ? 'Adding to queue…' : 'Transcribe recordings'}<span>↗</span></button><p className="fineprint">Transcribes first. Montage starts after you approve the text.</p>
        </form></section>
        <section id="panel-videos" role="tabpanel" aria-labelledby="tab-videos" hidden={tab!=='videos'} className="activity"><div className="section-heading"><span className="number">02</span><h2>Your videos</h2>{active.length>0 && <span className="count">{active.length} in progress</span>}</div>
          {!data && !error && !previewOnly ? <div className="empty card"><span className="empty-icon">◌</span><h3>Connecting to your desk…</h3></div> : jobs.length === 0 ? <div className="empty card"><span className="empty-icon">▤</span><h3>Space for your next idea.</h3><p>Your draft requests and progress will appear here.</p><div className="empty-steps"><span>Upload takes</span><i>→</i><span>Request a draft</span><i>→</i><span>Review in CapCut</span></div></div> : <div className="job-list">{jobs.map(job => <JobCard key={job.id} job={job} removing={removing} onReview={setReviewJob} onRetry={job=>{setBatch(job.batch_id);setBrief(job.brief);selectTab('create');setNotice('Recordings selected. Submit the form to try again.');requestAnimationFrame(()=>document.getElementById('batch')?.focus());}} onRemove={job=>{setRemoveJob(job);window.scrollTo({top:0,behavior:'smooth'});}}/>)}</div>}
          {!online && data && <aside className="worker-offline">PC offline. Queued work will continue when it reconnects.</aside>}
        </section></div>
      <footer><span>Made for the part after you hit record.</span><span>Drafts stay yours to review. Publishing is a separate step.</span></footer>
    </main></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
