/** Split invalid samples rather than drawing across missing observations. */
export function splitSeriesSegments(points: ReadonlyArray<[number, number] | null>): Array<Array<[number, number]>> {
  const segments: Array<Array<[number, number]>> = []
  let segment: Array<[number, number]> = []
  for (const point of points) {
    if (point === null || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      segment = []
    } else {
      if (segment.length === 0) segments.push(segment)
      segment.push(point)
    }
  }
  return segments
}
export function linePath(points: ReadonlyArray<[number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
}
