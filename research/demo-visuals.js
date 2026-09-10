/* Shared plot geometry. Labels and traces occupy separate regions. */
const demoPlotCache = new WeakMap();
window.DemoPlot = function(canvas, rows, times, visibleTime, options = {}) {
  if (canvas.closest('.phone-panel')?.inert) return;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height || !times.length) return;
  const ctx = canvas.getContext('2d'), ratio = devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  canvas.dataset.timeMs = String(visibleTime);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const tone = (role, fallback) => window.DemoTheme?.colour(role) || fallback;
  const large = width >= 480;
  const start = options.start ?? times[0], end = options.end ?? times[times.length - 1];
  const left = large ? 44 : 34, right = width - 10, rowHeight = (height - (large ? 38 : 32)) / rows.length;
  const x = time => left + (time - start) / (end - start) * (right - left);
  const number = value => Math.abs(value) >= 100 ? value.toFixed(0) : Number(value.toFixed(1)).toString();
  rows.forEach((row, rowIndex) => {
    const top = rowIndex * rowHeight, plotTop = top + (large ? 32 : 27), bottom = top + rowHeight - 9;
    const y = value => bottom - (value - row.min) / (row.max - row.min) * (bottom - plotTop);
    ctx.font = `600 ${large ? 14 : 12}px Arial`; ctx.fillStyle = row.colour; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(row.title, 2, top + (large ? 14 : 12), width - 4);
    ctx.font = `${large ? 12 : 10}px Arial`; ctx.fillStyle = tone('muted', '#697078'); ctx.textAlign = 'right';
    ctx.fillText(number(row.max), left - 5, plotTop + 3);
    if (bottom - plotTop > 22) ctx.fillText(number(row.min), left - 5, bottom - 2);
    ctx.save(); ctx.beginPath(); ctx.rect(left, plotTop, right - left, Math.max(1, bottom - plotTop)); ctx.clip();
    ctx.strokeStyle = tone('grid', '#e6e7e9'); ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const tickX = left + i / 4 * (right - left);
      ctx.beginPath(); ctx.moveTo(tickX, plotTop); ctx.lineTo(tickX, bottom); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(left, y(row.baseline ?? 0)); ctx.lineTo(right, y(row.baseline ?? 0)); ctx.stroke();
    if (row.threshold !== undefined) {
      ctx.strokeStyle = row.thresholdColour || tone('threshold', '#b52d32'); ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(left, y(row.threshold)); ctx.lineTo(right, y(row.threshold)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = row.colour; ctx.lineWidth = row.lineWidth ?? 2; ctx.lineJoin = 'round'; ctx.beginPath();
    const cacheKey = `${start}|${end}|${width}`;
    let sampled = demoPlotCache.get(row.values);
    if (!sampled || sampled.key !== cacheKey) {
      const points = [], bins = Math.max(1, Math.ceil(right - left));
      let bucket = null;
      const flush = () => {
        if (!bucket) return;
        [...new Set([bucket.first,bucket.min,bucket.max,bucket.last])].sort((a,b)=>a-b).forEach(i=>points.push(i));
      };
      for(let i=0;i<times.length;i++) {
        if(times[i]<start)continue;if(times[i]>end)break;
        const bin=Math.floor((times[i]-start)/(end-start)*bins);
        if(!bucket||bucket.bin!==bin){flush();bucket={bin,first:i,last:i,min:i,max:i};}
        bucket.last=i;
        if(row.values[i]<row.values[bucket.min])bucket.min=i;
        if(row.values[i]>row.values[bucket.max])bucket.max=i;
      }
      flush();sampled={key:cacheKey,points};demoPlotCache.set(row.values,sampled);
    }
    const geometryKey = `${plotTop}|${bottom}|${row.min}|${row.max}`;
    if (sampled.geometryKey !== geometryKey) {
      sampled.path = new Path2D();
      sampled.points.forEach((i, index) => {
        if (index === 0) sampled.path.moveTo(x(times[i]), y(row.values[i]));
        else sampled.path.lineTo(x(times[i]), y(row.values[i]));
      });
      sampled.geometryKey = geometryKey;
    }
    // Reveal the cached curve continuously, including between stored samples.
    ctx.save(); ctx.beginPath();
    ctx.rect(left, plotTop, Math.max(0, Math.min(right, x(visibleTime)) - left), Math.max(1, bottom - plotTop));
    ctx.clip(); ctx.stroke(sampled.path); ctx.restore();
    if (row.spikes) {
      ctx.strokeStyle = tone('spike', '#b52d32'); ctx.lineWidth = 2;
      row.spikes.filter(t => t >= start && t <= visibleTime).forEach(t => {
        ctx.beginPath(); ctx.moveTo(x(t), bottom); ctx.lineTo(x(t), plotTop); ctx.stroke();
      });
    }
    ctx.strokeStyle = tone('muted', '#72777e'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(visibleTime), plotTop); ctx.lineTo(x(visibleTime), bottom); ctx.stroke();
    ctx.restore();
    if (row.markers) {
      ctx.fillStyle = row.colour;
      row.markers.filter(point => point.time >= start && point.time <= end && point.time <= visibleTime && point.value >= row.min && point.value <= row.max).forEach(point => {
        ctx.beginPath(); ctx.arc(x(point.time), y(point.value), 2.75, 0, Math.PI * 2); ctx.fill();
      });
    }
  });
  ctx.font = `${large ? 12 : 10}px Arial`; ctx.textBaseline = 'middle'; ctx.fillStyle = tone('muted', '#697078'); ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) ctx.fillText(number(start + i / 4 * (end - start)), left + i / 4 * (right - left), height - 23);
  ctx.fillText('Time (ms)', (left + right) / 2, height - 8);
};

/* Regular playback uses one time scale for the diagrams and graphs. */
window.DemoClockMap = function({ start, end }) {
  const duration = end - start;
  return {
    at(fraction) { return start + Math.max(0, Math.min(1, fraction)) * duration; },
    fraction(time) { return Math.max(0, Math.min(1, (time - start) / duration)); }
  };
};
