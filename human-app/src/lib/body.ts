/** Bound JSON bodies even when the caller omits Content-Length. */
export async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  if (Number(request.headers.get('content-length') || '0') > limit) throw new RangeError('Request body too large');
  if (!request.body) throw new RangeError('JSON body required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new RangeError('Request body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body=new Uint8Array(size);
  let offset=0;
  for (const chunk of chunks) {body.set(chunk,offset);offset+=chunk.length;}
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new RangeError('Invalid JSON body'); }
}
