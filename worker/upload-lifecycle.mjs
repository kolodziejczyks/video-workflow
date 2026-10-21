export function canCloseUpload({ownership, processInfo, observation, initialization, lockedProjects, now=Date.now()}) {
 if(!ownership || !processInfo || ownership.pid!==processInfo.pid || ownership.startedAt!==processInfo.startedAt)return false;
 if(processInfo.title!=='CapCut' || lockedProjects!==0)return false;
 if(observation?.status!=='recorded_complete')return false;
 const completed=Date.parse(observation.completedAt);
 if(initialization) {
  if(initialization.status!=='returned_home' || !/^\d+$/.test(initialization.initializedModified || '') || !Number.isFinite(completed))return false;
  if(BigInt(completed)*1000n<BigInt(initialization.initializedModified))return false;
 }
 return Number.isFinite(completed) && now-completed>=30000;
}
