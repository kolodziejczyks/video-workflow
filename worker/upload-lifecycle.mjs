export function canCloseUpload({ownership, processInfo, observation, lockedProjects, now=Date.now()}) {
 if(!ownership || !processInfo || ownership.pid!==processInfo.pid || ownership.startedAt!==processInfo.startedAt)return false;
 if(processInfo.title!=='CapCut' || lockedProjects!==0)return false;
 if(observation?.status!=='recorded_complete')return false;
 const completed=Date.parse(observation.completedAt);
 return Number.isFinite(completed) && now-completed>=30000;
}
