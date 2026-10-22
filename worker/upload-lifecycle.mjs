// Which rule, if any, lets a launcher claim the lone CapCut home window as the instance it started.
// Exact or parent PID correlation is preferred; the time window only covers a bootstrapper that re-launches itself.
export function ownedInstance({launchedPid, launchedAt, processInfo, lockedProjects, now=Date.now()}) {
  if (!processInfo || processInfo.title !== 'CapCut' || lockedProjects !== 0) return null;
  if (Number.isInteger(launchedPid) && processInfo.pid === launchedPid) return 'launched-pid';
  if (Number.isInteger(launchedPid) && processInfo.parentPid === launchedPid) return 'child-of-launched-pid';
  const started = Date.parse(processInfo.startedAt);
  if (Number.isFinite(launchedAt) && Number.isFinite(started) && started >= launchedAt - 2000 && started <= now) return 'launch-time-window';
  return null;
}
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
