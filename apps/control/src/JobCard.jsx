import React from 'react';
import Thumbnails from './Thumbnails.jsx';

const stages={queued:'Waiting for your PC',preparing:'Preparing recordings',transcribing:'Transcribing your recordings',planning:'Arranging your clips',captions:'Adding captions',building:'Creating your CapCut draft',waiting_for_capcut:'Close CapCut on your PC to continue'};
const montageStages={queued:['Text approved · Waiting to create your video','Your PC will create the video from your approved text and selected takes.'],preparing:['Text approved · Preparing your video','Checking the recordings for your approved text and selected takes.'],planning:['Arranging your approved clips','Matching your approved text to the audio and arranging the selected takes.'],captions:['Adding captions to your video','Creating captions from the text you approved.'],building:['Creating your CapCut draft','Putting your selected clips and approved captions together.'],waiting_for_capcut:['Your video is built · Close CapCut to continue','Close CapCut on your PC so your new draft can be added.']};
export function jobPresentation(job) {
 const title=job.project_name?.replace(/\s+- draft [a-f0-9]{8}$/i,'') || `Recording batch ${job.batch_name}`;
 if(job.phase==='delete') return {title,tone:job.status==='delete_failed'?'error':'pending',status:job.status==='delete_failed'?'Couldn’t remove draft':'Removing draft',description:job.stage==='waiting_for_capcut'?'Close CapCut on your PC to finish removing this draft.':job.status==='delete_failed'?'Try removing it again. Your recordings are safe.':'Your recordings and phone copy will be kept.'};
 if(job.status==='failed')return {title,tone:'error',status:'Draft needs attention',description:'The draft couldn’t be created. Try again using the same recordings.'};
 if(job.status==='awaiting_review')return {title,tone:'review',status:'Review your transcript',description:'Listen, correct the text, then approve it to create your video.'};
 if(job.status==='ready') {
  const complete=job.upload_status==='recorded_complete';
  return {title,tone:complete?'complete':'pending',status:complete?'Upload complete':'Draft ready',description:complete?'Open CapCut on your phone to edit.':'Waiting for CapCut to confirm the upload.'};
 }
 if(job.phase==='montage') {
  const [status,description]=montageStages[job.stage] || ['Creating your video','Your text is approved. Your PC is creating the video from your selected takes.'];
  return {title,tone:'pending',status,description};
 }
 return {title,tone:'pending',status:stages[job.stage] || 'Waiting to start',description:job.stage==='waiting_for_capcut'?'Your draft will continue once CapCut is closed.':'You can leave this page. Your PC will keep working.'};
}

export default function JobCard({job,onReview,onRetry,onRemove,removing}) {
 const view=jobPresentation(job);
 const canRemove=!['running','delete_queued'].includes(job.status);
 const date=new Date(job.created_at);
 const stale=job.status==='ready' && (!job.upload_checked_at || Date.now()-job.upload_checked_at>120000);
 return <article className={`video-card card tone-${view.tone}`}>
   <div className="video-card-header"><span className={`video-status ${view.tone}`}><span aria-hidden="true">{view.tone==='complete'?'✓':view.tone==='error'?'!':view.tone==='review'?'✎':'◷'}</span>{view.status}</span><time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div>
   <h3>{view.title}</h3>
   <p className="video-next-step">{view.description}</p>
   {stale && <p className="video-stale">{job.upload_status==='recorded_complete'?'Last confirmed upload.':'Upload status pending.'} Waiting for a fresh PC update.</p>}
   {job.phase!=='delete' && (job.phase==='montage' || ['awaiting_review','ready'].includes(job.status)) && <Thumbnails jobId={job.id}/>}
   <div className="video-actions">
     {job.status==='awaiting_review' && <button className="video-primary" onClick={()=>onReview(job)}>Review text <span aria-hidden="true">→</span></button>}
     {job.status==='failed' && <button className="video-primary" onClick={()=>onRetry(job)}>Try again <span aria-hidden="true">↗</span></button>}
     {canRemove && <button className="video-remove" disabled={removing} onClick={()=>onRemove(job)}>{job.status==='delete_failed'?'Retry removal':'Remove draft'}</button>}
   </div>
   {(job.project_name || job.status==='failed' || job.status==='delete_failed') && <details className="video-details"><summary>Details</summary><dl><dt>Recording batch</dt><dd>{job.batch_name}</dd>{job.project_name && <><dt>Name in CapCut</dt><dd>{job.project_name}</dd></>}{job.upload_status==='recorded_complete' && <><dt>Upload</dt><dd>CapCut recorded completion{job.upload_completed_at?` at ${new Date(job.upload_completed_at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`:''}.</dd></>}{(job.status==='failed'||job.status==='delete_failed') && <><dt>Error details</dt><dd>{job.message || 'No additional details available.'}</dd></>}</dl></details>}
 </article>;
}
