// Record only Choir's output graph. No microphone, tab capture or user-media
// permission is involved. Keep compressed audio until the user requests WAV.
export function createPlayedAudioCapture(context,output,{Recorder=globalThis.MediaRecorder}={}) {
  let recorder,destination,chunks=[],bytes=0,activeSince=null,duration=0,failure='',closed=false,settled=false,finishPromise,resolveFinish,timer,result,continuous=true;
  const maxDuration=(128*1024*1024-44)/(context.sampleRate*4);
  const endInterval=()=>{if(activeSince!==null){duration+=Math.max(0,context.currentTime-activeSince);activeSince=null;}};
  const limitDuration=()=>{clearTimeout(timer);timer=setTimeout(()=>{failure='This message is too long for a WAV download (128 MB limit).';stop();},Math.max(0,maxDuration-duration)*1000);};
  const cleanup=()=>{
    clearTimeout(timer);
    if(destination){try{output.disconnect(destination);}catch{}for(const track of destination.stream.getTracks())track.stop();}
    destination=null;
  };
  const settle=()=>{
    if(settled)return;settled=true;cleanup();
    endInterval();result=failure?{error:failure}:chunks.length?{version:1,blob:new Blob(chunks,{type:recorder.mimeType || chunks[0].type}),duration}:null;
    chunks=[];resolveFinish?.(result);
  };
  const stop=()=>{endInterval();if(recorder?.state && recorder.state!=='inactive'){try{recorder.stop();}catch{settle();}}else settle();};
  return {
    get continuous(){return continuous;},
    markDiscontinuous(){continuous=false;},
    start(){
      if(closed || failure)return;
      try{
        if(recorder){if(recorder.state==='paused'){recorder.resume();activeSince=context.currentTime;limitDuration();}return;}
        if(!Recorder || !context.createMediaStreamDestination)throw new Error('This browser cannot save the played audio mix.');
        destination=context.createMediaStreamDestination();
        const mimeType=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>Recorder.isTypeSupported?.(type));
        recorder=new Recorder(destination.stream,{...(mimeType?{mimeType}:{}),audioBitsPerSecond:256000});
        recorder.ondataavailable=event=>{
          if(closed && !finishPromise)return;
          if(event.data?.size){bytes+=event.data.size;if(bytes>32*1024*1024){failure='The played audio mix exceeded its recording limit.';chunks=[];stop();}else chunks.push(event.data);}
        };
        recorder.onerror=event=>{failure=event.error?.message || 'The browser could not save the played audio mix.';stop();};
        recorder.onstop=()=>settle();
        output.connect(destination);activeSince=context.currentTime;recorder.start(1000);limitDuration();
      }catch(error){failure=error.message;cleanup();}
    },
    pause(){
      if(closed || recorder?.state!=='recording')return;
      try{recorder.pause();endInterval();clearTimeout(timer);}catch(error){failure=error.message;stop();}
    },
    fail(message){failure=message;},
    finish(){
      if(finishPromise)return finishPromise;
      closed=true;
      finishPromise=new Promise(resolve=>resolveFinish=resolve);
      if(settled){resolveFinish(result);return finishPromise;}
      clearTimeout(timer);timer=setTimeout(()=>{failure='The browser did not finish saving the played audio mix.';settle();},3000);
      stop();return finishPromise;
    },
    discard(){closed=true;chunks=[];stop();cleanup();}
  };
}

export function playedAudioFilename(character,chatId,messageIndex){
  if(!Number.isInteger(messageIndex) || messageIndex<0)throw new Error('The message number could not be found.');
  const initials=(String(character || '').match(/[\p{L}\p{N}]+/gu) || ['Char']).map(word=>[...word][0]).join('').toLocaleUpperCase().slice(0,32);
  const chat=String(chatId).replace(/[<>:"/\\|?*\x00-\x1f\[\]]/g,'_').slice(0,100);
  return `Choir - ${initials} - ${chat} - ${String(messageIndex+1).padStart(3,'0')}.wav`;
}

// Store WAVs without recompression or third-party code. Parts remain separate
// until the browser writes the ZIP; the cap bounds a bulk export's memory use.
export function createWavArchive(entries,{maxBytes=256*1024*1024}={}){
  if(!entries.length || entries.length>65535)throw new Error('Choose between 1 and 65535 completed recordings.');
  const table=Array.from({length:256},(_,n)=>{let crc=n;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;});
  const parts=[],central=[],names=new Set();let offset=0,total=0;
  for(const {filename,bytes} of entries){
    if(!filename || /[\\/\x00-\x1f]/u.test(filename) || names.has(filename))throw new Error('Archive recording names must be unique filenames.');
    names.add(filename);const name=new TextEncoder().encode(filename),data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(name.length>65535)throw new Error('A recording filename is too long.');
    total+=data.byteLength+name.length*2+76;if(total+22>maxBytes)throw new Error('These recordings exceed the 256 MB ZIP limit. Download messages individually.');
    let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
    const header=new Uint8Array(30),view=new DataView(header.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,33,true);view.setUint32(14,crc,true);view.setUint32(18,data.byteLength,true);view.setUint32(22,data.byteLength,true);view.setUint16(26,name.length,true);
    const directory=new Uint8Array(46),index=new DataView(directory.buffer);index.setUint32(0,0x02014b50,true);index.setUint16(4,20,true);index.setUint16(6,20,true);index.setUint16(8,0x800,true);index.setUint16(14,33,true);index.setUint32(16,crc,true);index.setUint32(20,data.byteLength,true);index.setUint32(24,data.byteLength,true);index.setUint16(28,name.length,true);index.setUint32(42,offset,true);
    parts.push(header,name,data);central.push(directory,name);offset+=header.length+name.length+data.length;
  }
  const size=central.reduce((sum,part)=>sum+part.length,0),end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,size,true);view.setUint32(16,offset,true);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
