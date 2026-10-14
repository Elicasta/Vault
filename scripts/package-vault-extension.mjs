// Create a Chrome-loadable extension ZIP using only built-in Node APIs.
// This is generated during the build, so it always matches the Git branch.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { deflateRawSync } from "node:zlib";

const root = resolve("extensions/vault-media-capture");
const destination = resolve("public/downloads/vault-media-capture.zip");
const files = readdirSync(root, { withFileTypes:true })
  .filter(file=>file.isFile() && !file.name.startsWith("."))
  .map(file=>({ name:"vault-media-capture/"+file.name, data:readFileSync(join(root,file.name)) }));
const crcTable = Array.from({length:256}, (_,n)=>{
 let c=n;
 for(let i=0;i<8;i++) c=(c&1)?0xedb88320^(c>>>1):c>>>1;
 return c>>>0;
});
function crc32(buffer){let value=0xffffffff;for(const b of buffer)value=crcTable[(value^b)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
const local=[], central=[];
let offset=0;
for(const file of files){
 const name=Buffer.from(file.name,"utf8"), compressed=deflateRawSync(file.data,{level:9}),crc=crc32(file.data);
 const header=Buffer.alloc(30);
 header.writeUInt32LE(0x04034b50,0);
 header.writeUInt16LE(20,4);
 header.writeUInt16LE(0,6); header.writeUInt16LE(8,8);
 header.writeUInt32LE(crc,14);
 header.writeUInt32LE(compressed.length,18);
 header.writeUInt32LE(file.data.length,22);
 header.writeUInt16LE(name.length,26);
 local.push(header,name,compressed);
 const dir=Buffer.alloc(46);
 dir.writeUInt32LE(0x02014b50,0);
 dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(8,10);
 dir.writeUInt32LE(crc,16);
 dir.writeUInt32LE(compressed.length,20);
 dir.writeUInt32LE(file.data.length,24);
 dir.writeUInt16LE(name.length,28);
 dir.writeUInt32LE(offset,42);
 central.push(dir,name);
 offset+=header.length+name.length+compressed.length;
}
const directory=Buffer.concat(central);
const end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);
end.writeUInt16LE(files.length,8);
end.writeUInt16LE(files.length,10);
end.writeUInt32LE(directory.length,12);
end.writeUInt32LE(offset,16);
mkdirSync(resolve("public/downloads"),{recursive:true});
writeFileSync(destination,Buffer.concat([...local,directory,end]));
console.log("Packaged Chrome extension:", files.length, "files, zip:",destination);
