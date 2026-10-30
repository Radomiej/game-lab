// Read javac's real .class files before TeaVM removes unused metadata.
export function readClassMetadata(input) {
  const bytes=Uint8Array.from(input),view=new DataView(bytes.buffer);let offset=0;
  const u1=()=>view.getUint8(offset++),u2=()=>{const value=view.getUint16(offset);offset+=2;return value;},u4=()=>{const value=view.getUint32(offset);offset+=4;return value;};
  if(u4()!==0xcafebabe)throw Error('Nieprawidłowy plik class.');
  u2();u2();const pool=new Array(u2());
  for(let i=1;i<pool.length;i++) {
    const tag=u1();
    if(tag===1){const length=u2();pool[i]=new TextDecoder().decode(bytes.subarray(offset,offset+length));offset+=length;}
    else if(tag===7)pool[i]={name:u2()};
    else if([8,16,19,20].includes(tag))u2();
    else if([3,4,9,10,11,12,17,18].includes(tag))offset+=4;
    else if(tag===5||tag===6){offset+=8;i++;}
    else if(tag===15)offset+=3;
    else throw Error('Nieobsługiwany wpis constant pool: '+tag);
  }
  const className=index=>pool[pool[index]?.name];
  const access=u2(),name=className(u2()),parent=className(u2());
  const interfaces=Array.from({length:u2()},()=>className(u2()));
  const skipAttributes=()=>{const count=u2();for(let i=0;i<count;i++){u2();const length=u4();offset+=length;}};
  const members=()=>Array.from({length:u2()},()=>{const access=u2(),name=pool[u2()],descriptor=pool[u2()];skipAttributes();return {access,name,descriptor};});
  return {access,name,parent,interfaces,fields:members(),methods:members()};
}
export function checkClassStructure(files,checks=[]) {
  const cache=new Map();
  return checks.map(check=>{
    let passed=false;
    try {
      if(!cache.has(check.className))cache.set(check.className,readClassMetadata(files[check.className.replaceAll('.','/')+'.class']||[]));
      const cls=cache.get(check.className);
      if(check.parent)passed=cls.parent===check.parent.replaceAll('.','/');
      else {
        const member=(check.method?cls.methods:cls.fields).find(m=>m.name===(check.method||check.field)&&(!check.descriptor||m.descriptor===check.descriptor));
        passed=Boolean(member)&&(!check.private || Boolean(member.access&2))&&(!check.instance || !(member.access&8));
      }
    }catch {passed=false;}
    return {id:check.id,passed,detail:passed?'Struktura skompilowanej klasy jest poprawna.':check.label};
  });
}
