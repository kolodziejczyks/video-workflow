const STOP = new Set(('uważam uwazam uważacie uwazacie uważamy uwazamy sądzicie sadzicie sądzę sadze myślę mysle myślicie myslicie powinien powinna powinno powinny powinni możemy mozemy mogą moga musi muszą musza musiało musialo mógł mogl chcę chce chcecie dajcie znać znac powiedzieć powiedziec powiedział powiedzial przecież przeciez wszystko wszystkie wszystkich taki takie takim takimi wiem wiecie no niech właśnie wlasnie oczywiście oczywiscie naprawdę naprawde również rowniez kurwa cholera cośtam a i o w z na do od po za ze we to co jak jest są był była były być będzie będą się sie nie tak też tez oraz ale lub czy że ze ten ta te tego tej tym dla przez przy nad pod bez on ona oni ja ty my wy was wam mam ma mamy mają macie jego jej ich mnie mnie mój moj moim twoje swoje swoich sobie tylko już juz jeszcze więc wiec także takze bardzo dobra dobre dobrze może moze można mozna które ktore który ktory która ktora żeby zeby bo gdy jeśli jezeli jeżeli teraz tutaj tam tego coś cos sobie nas was dość dosyć the a an and or of to in on for is are it this that with from you your we they my as be have has').split(/\s+/));
const normalized = text => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').toLowerCase();

// An extractive topic label: only words actually present in the included text.
export function suggestTitle(lines, fallback = 'Recording') {
  const topics = new Map();
  for (const line of lines.filter(l => !l.excluded)) {
    const seen = new Set();
    for (const token of line.text.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []) {
      const word = normalized(token);
      if (STOP.has(word) || STOP.has(token.toLowerCase()) || token.length < 3 && !/^[A-Z]{2,}$/.test(token) || /^\d+$/.test(token)) continue;
      const key = word.length > 7 ? word.slice(0, 7) : word;
      const entry = topics.get(key) || { text: token, count: 0, rank: topics.size };
      if (!seen.has(key)) entry.count += /^[A-Z][a-z]|^[A-Z]{2,}$/.test(token) ? 3 : 1;
      if (token.length > entry.text.length) entry.text = token;
      seen.add(key); topics.set(key, entry);
    }
  }
  return [...topics.values()].sort((a,b) => b.count-a.count || a.rank-b.rank).slice(0,3).map(t=>t.text).join(' · ').slice(0,80)
    || fallback.replace(/[\u0000-\u001f\\/:*?"<>|]/g,' ').trim().slice(0,80) || 'Recording';
}

export function chooseRetake(review, groupId, keepLineIds) {
  const group = review.retakes.find(g => g.id === groupId);
  if (!group || keepLineIds.some(id => !group.lineIds.includes(id))) throw new Error('Unknown retake choice.');
  const members = new Set(group.lineIds);
  const changed = new Set(review.lines.filter(l=>members.has(l.id) && l.excluded !== !keepLineIds.includes(l.id)).map(l=>l.id));
  return { ...review,
    lines: review.lines.map(line => members.has(line.id) ? {...line, excluded:!keepLineIds.includes(line.id)} : line),
    retakes: review.retakes.map(g => g.id === groupId ? {...g,keepLineIds} : g.lineIds.some(id=>changed.has(id)) ? {...g,keepLineIds:null} : g)
  };
}

export function retakeResolved(group, lines) {
  return Array.isArray(group.keepLineIds) && group.lineIds.every(id => {
    const line = lines.find(l => l.id === id);
    return line && line.excluded === !group.keepLineIds.includes(id);
  });
}
