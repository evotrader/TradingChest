/** Yield to input and rendering without leaving an open message port. */
export const yieldTask=()=>new Promise<void>(resolve=>{
  const channel=new MessageChannel()
  channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve()}
  channel.port2.postMessage(null)
})
