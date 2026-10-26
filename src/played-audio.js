// Record only Choir's output graph. No microphone, tab capture or user-media
// permission is involved. Keep compressed audio until the user requests WAV.
export function createPlayedAudioCapture(context,output,{Recorder=globalThis.MediaRecorder}={}) {
  let recorder,destination,chunks=[],bytes=0,started=0,failure='',closed=false,settled=false,finishPromise,resolveFinish,timer,result;
  const maxDuration=(128*1024*1024-44)/(context.sampleRate*4);
  const cleanup=()=>{
    clearTimeout(timer);
    if(destination){try{output.disconnect(destination);}catch{}for(const track of destination.stream.getTracks())track.stop();}
    destination=null;
  };
  const settle=()=>{
    if(settled)return;settled=true;cleanup();
    result=failure?{error:failure}:chunks.length?{version:1,blob:new Blob(chunks,{type:recorder.mimeType || chunks[0].type}),duration:Math.max(0,context.currentTime-started)}:null;
    chunks=[];resolveFinish?.(result);
  };
  const stop=()=>{if(recorder?.state && recorder.state!=='inactive'){try{recorder.stop();}catch{settle();}}else settle();};
  return {
    start(){
      if(closed || recorder || failure)return;
      try{
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
        output.connect(destination);started=context.currentTime;recorder.start(1000);
        timer=setTimeout(()=>{failure='This message is too long for a WAV download (128 MB limit).';stop();},maxDuration*1000);
      }catch(error){failure=error.message;cleanup();}
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
