import { ReviewValidationError } from './review.mjs';

export const THUMBNAIL_RETENTION_MS = 30 * 86400000;
const prefix = id => `review-audio/thumbnails/${id}/`;
export const thumbnailKey = (id, frame, preview=false) => `${prefix(id)}${frame}${preview?'-preview':''}.jpg`;
export const thumbnailManifestKey = id => `${prefix(id)}index.json`;
const validFrame = id => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id);

export function validateThumbnails(input) {
  if (!Array.isArray(input?.frames) || input.frames.length > 6) throw new ReviewValidationError('Invalid thumbnail gallery.');
  const seen = new Set();
  return {frames: input.frames.map(frame => {
    if (!validFrame(frame?.id) || seen.has(frame.id) || !/^\d{4}$/.test(frame.source || '') || typeof frame.sourceName !== 'string' || !frame.sourceName || frame.sourceName.length > 250 || !Number.isFinite(frame.time) || frame.time < 0 || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 16384 || frame.height > 16384) throw new ReviewValidationError('Invalid thumbnail frame.');
    seen.add(frame.id);
    return {id:frame.id,source:frame.source,sourceName:frame.sourceName,time:frame.time,width:frame.width,height:frame.height};
  })};
}

export async function thumbnailRoutes(request, env, url, machine, json, body) {
  const match = url.pathname.match(/^\/api\/(worker\/)?jobs\/([a-f0-9-]{36})\/thumbnails(?:\/([a-f0-9]{16}))?$/);
  if (!match) return null;
  const [, , id, frameId] = match;
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(id).first();
  if (!job || job.status === 'removed' || job.phase === 'delete') return json({error:'Video not found.'},404);
  if (!env.REVIEW_AUDIO) return json({error:'Thumbnail storage unavailable.'},503);
  const store = env.REVIEW_AUDIO;
  if (machine) {
    const liveLease = job.status === 'running' && job.lease_until >= Date.now() && request.headers.get('X-Worker-Lease') === job.lease_token;
    // Completed jobs can receive a gallery without requeueing native generation.
    if (!liveLease && !['ready','awaiting_review'].includes(job.status)) return json({error:'Job lease lost.'},409);
    if (frameId && request.method === 'PUT') {
      const length = Number(request.headers.get('Content-Length'));
      if (request.headers.get('Content-Type') !== 'image/jpeg' || !Number.isInteger(length) || length < 4 || length > 12*1024*1024) throw new ReviewValidationError('Expected a JPEG under 12 MB.');
      const reader = request.body?.getReader();
      if (!reader) throw new ReviewValidationError('Missing thumbnail.');
      const chunks=[];let size=0;
      for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>length){await reader.cancel();throw new ReviewValidationError('Thumbnail size mismatch.');}chunks.push(value); }
      if(size!==length)throw new ReviewValidationError('Thumbnail size mismatch.');
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      if(bytes[0]!==255 || bytes[1]!==216 || bytes[size-2]!==255 || bytes[size-1]!==217)throw new ReviewValidationError('Invalid JPEG.');
      const key=thumbnailKey(id,frameId,url.searchParams.get('preview')==='1');
      if(!await store.head(key)) await store.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{expiresAt:String(Date.now()+THUMBNAIL_RETENTION_MS)}});
      return json({ok:true});
    }
    if(!frameId && request.method==='POST') {
      const manifest=validateThumbnails(await body(request));
      let expiresAt=Date.now()+THUMBNAIL_RETENTION_MS;
      for(const frame of manifest.frames){
        for(const preview of [false,true]){
          const image=await store.head(thumbnailKey(id,frame.id,preview));
          const expiry=Number(image?.customMetadata?.expiresAt || 0);
          if(!image || expiry<=Date.now())throw new ReviewValidationError('Upload unexpired thumbnail images first.');
          expiresAt=Math.min(expiresAt,expiry);
        }
      }
      const key=thumbnailManifestKey(id);
      // Retries must not extend retention or replace a published selection.
      if(!await store.head(key))await store.put(key,JSON.stringify({...manifest,expiresAt}),{httpMetadata:{contentType:'application/json'},customMetadata:{expiresAt:String(expiresAt)}});
      return json({ok:true});
    }
    return json({error:'Not found.'},404);
  }
  if(!['GET','HEAD'].includes(request.method))return json({error:'Not found.'},404);
  const saved=await store.get(thumbnailManifestKey(id));
  if(!saved)return frameId?json({error:'Thumbnail not found.'},404):json({frames:[],status:'unavailable'});
  if(Number(saved.customMetadata?.expiresAt || 0)<=Date.now())return json({error:'Thumbnail images expired after 30 days.'},410);
  const manifest=JSON.parse(await saved.text());
  if(!frameId)return json({...manifest,status:manifest.frames.length?'ready':'no_candidates'});
  const frame=manifest.frames.find(f=>f.id===frameId);
  if(!frame)return json({error:'Thumbnail not found.'},404);
  const image=await store.get(thumbnailKey(id,frameId,url.searchParams.get('preview')==='1' && url.searchParams.get('download')!=='1'));
  if(!image || Number(image.customMetadata?.expiresAt || 0)<=Date.now())return json({error:'Thumbnail expired.'},410);
  const headers={'Content-Type':'image/jpeg','Content-Length':String(image.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(url.searchParams.get('download')==='1')headers['Content-Disposition']=`attachment; filename="thumbnail-${frame.source}-${Math.round(frame.time*1000)}ms.jpg"`;
  return new Response(request.method==='HEAD'?null:image.body,{headers});
}
