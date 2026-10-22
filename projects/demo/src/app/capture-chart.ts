/**
 * Draws a chart-like element onto a canvas and returns it as a PNG. The demo's chart is a row of
 * `.bar` elements, so reading their boxes and colours is enough; no DOM-to-image library is needed.
 */
export function captureChart(chart: HTMLElement): Promise<Blob> {
  const scale = 2;
  const area = chart.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas is not available'));

  context.scale(scale, scale);
  context.fillStyle = getComputedStyle(chart).backgroundColor;
  context.fillRect(0, 0, area.width, area.height);
  context.font = '12px sans-serif';
  context.textAlign = 'center';
  for (const bar of chart.querySelectorAll<HTMLElement>('.bar')) {
    const box = bar.getBoundingClientRect();
    const x = box.left - area.left;
    const y = box.top - area.top;
    context.fillStyle = getComputedStyle(bar).backgroundColor;
    context.fillRect(x, y, box.width, box.height);
    context.fillStyle = '#333333';
    context.fillText(bar.dataset['label'] ?? '', x + box.width / 2, area.height - 6);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the capture'));
    }, 'image/png');
  });
}
