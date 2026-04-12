import { useMemo, useState } from 'react';

const PRESETS = {
  1: { cols: 1, rows: 1, ratio: '4/3', tiles: [[1,1,1,1]] },
  2: { cols: 2, rows: 1, ratio: '2/1', tiles: [[1,1,1,1],[2,1,1,1]] },
  3: { cols: 3, rows: 2, ratio: '3/2', tiles: [[1,3,1,1],[1,1,2,1],[2,2,2,1]] },
  4: { cols: 3, rows: 3, ratio: '4/3', tiles: [[1,2,1,3],[3,1,1,1],[3,1,2,1],[3,1,3,1]] },
  5: { cols: 3, rows: 2, ratio: '3/2', tiles: [[1,2,1,1],[3,1,1,1],[1,1,2,1],[2,1,2,1],[3,1,2,1]] },
  6: { cols: 3, rows: 2, ratio: '3/2', tiles: [[1,1,1,1],[2,1,1,1],[3,1,1,1],[1,1,2,1],[2,1,2,1],[3,1,2,1]] },
  7: { cols: 4, rows: 2, ratio: '2/1', tiles: [[1,2,1,1],[3,1,1,1],[4,1,1,1],[1,1,2,1],[2,1,2,1],[3,1,2,1],[4,1,2,1]] },
  8: { cols: 4, rows: 2, ratio: '2/1', tiles: [[1,1,1,1],[2,1,1,1],[3,1,1,1],[4,1,1,1],[1,1,2,1],[2,1,2,1],[3,1,2,1],[4,1,2,1]] },
  9: { cols: 3, rows: 3, ratio: '1/1', tiles: Array.from({length:9},(_,i)=>[(i%3)+1,1,Math.floor(i/3)+1,1]) },
  10: { cols: 5, rows: 2, ratio: '5/2', tiles: Array.from({length:10},(_,i)=>[(i%5)+1,1,Math.floor(i/5)+1,1]) },
};

function Tile({ item, index, overflow, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const isVideo = item.type === 'video';
  return (
    <button type="button" onClick={() => onOpen?.(index)}
      style={{ position:'absolute',inset:0,border:'none',margin:0,padding:0,background:'#0c0f16',cursor:'pointer',overflow:'hidden',display:'block',width:'100%',height:'100%' }}>
      {!error ? (
        <>
          {isVideo ? (
            <video src={item.previewUrl||item.url} preload="metadata" muted playsInline
              onLoadedData={()=>setLoaded(true)} onError={()=>setError(true)}
              style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }} />
          ) : (
            <img src={item.previewUrl||item.url} alt={item.alt||''} loading="lazy"
              onLoad={()=>setLoaded(true)} onError={()=>setError(true)}
              style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }} />
          )}
        </>
      ) : (
        <div style={{ position:'absolute',inset:0,display:'grid',placeItems:'center',color:'#5a6070',fontSize:12,background:'rgba(14,18,24,0.95)' }}>Ошибка</div>
      )}
      {isVideo && !error && <span style={{ position:'absolute',right:6,bottom:6,borderRadius:999,padding:'2px 8px',fontSize:10,fontWeight:700,color:'#fff',background:'rgba(0,0,0,0.6)' }}>VIDEO</span>}
      {overflow > 0 && <span style={{ position:'absolute',inset:0,display:'grid',placeItems:'center',fontSize:24,fontWeight:700,color:'#fff',background:'rgba(0,0,0,0.55)' }}>+{overflow}</span>}
    </button>
  );
}

export default function MediaGroupMessage({ items, caption, time, status, isOutgoing, onOpenImage }) {
  if (!items?.length) return null;
  const visible = items.slice(0, 10);
  const overflow = Math.max(0, items.length - 10);
  const layout = PRESETS[Math.min(visible.length, 10)] || PRESETS[1];
  const ticks = status === 'sending' ? '🕓' : status === 'read' ? '✓✓' : '✓';
  return (
    <div style={{ width:'100%', minWidth: 320, borderRadius:14, overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat('+layout.cols+', minmax(0,1fr))', gridTemplateRows:'repeat('+layout.rows+', minmax(0,1fr))', aspectRatio:layout.ratio, gap:2, background:'rgba(0,0,0,0.4)', borderRadius:14, overflow:'hidden' }}>
        {layout.tiles.map((t,i) => { const item=visible[i]; if(!item) return null; return (
          <div key={item.id} style={{ gridColumn:t[0]+' / span '+t[1], gridRow:t[2]+' / span '+t[3], position:'relative', overflow:'hidden', minHeight:0 }}>
            <Tile item={item} index={i} overflow={overflow>0 && i===visible.length-1 ? overflow : 0} onOpen={onOpenImage} />
          </div>
        ); })}
      </div>
      {caption && <div style={{ margin:'8px 10px 4px', fontSize:13, lineHeight:1.4, whiteSpace:'pre-wrap', color:'#e8edf7' }}>{caption}</div>}
      {time && <div style={{ margin:'4px 10px 6px', display:'flex', justifyContent:'flex-end', alignItems:'center', gap:5, fontSize:11, color:isOutgoing?'#8a94b0':'#6a7080', fontFamily:'monospace' }}><span>{time}</span><span style={{ color:status==='read'?'#4A9EE5':undefined }}>{ticks}</span></div>}
    </div>
  );
}
