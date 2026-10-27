import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Signing may change the PE checksum/security-directory fields and append an
// aligned WIN_CERTIFICATE table. Every other original byte must remain exact.
function pe(bytes){
 assert(Buffer.isBuffer(bytes)&&bytes.length>=256,'PE bytes required');
 assert.equal(bytes.readUInt16LE(0),0x5a4d,'DOS header missing');
 const nt=bytes.readUInt32LE(0x3c);assert(nt>=64&&nt+24<=bytes.length,'Invalid PE offset');assert.equal(bytes.readUInt32LE(nt),0x4550,'PE header missing');
 const optional=nt+24,size=bytes.readUInt16LE(nt+20),magic=bytes.readUInt16LE(optional);assert([0x10b,0x20b].includes(magic),'Unsupported PE optional header');
 const directories=optional+(magic===0x20b?112:96),directoryCount=optional+(magic===0x20b?108:92),checksum=optional+64,security=directories+4*8;
 assert(size>=security+8-optional&&optional+size<=bytes.length&&bytes.readUInt32LE(directoryCount)>=5,'Incomplete PE data directories');
 const certificateOffset=bytes.readUInt32LE(security),certificateSize=bytes.readUInt32LE(security+4);
 assert((certificateOffset===0)===(certificateSize===0),'Incomplete PE certificate table');
 if(certificateSize)assert(certificateOffset%8===0&&certificateSize>=8&&certificateOffset>=optional+size&&certificateOffset+certificateSize<=bytes.length,'Invalid PE certificate table');
 return {checksum,security,certificateOffset,certificateSize};
}
export function inspectUnsignedPE(bytes){const info=pe(bytes);assert.equal(info.certificateSize,0,'Use the unsigned original, not an existing signature');return {unsigned:true,bytes:bytes.length};}
export function assertSigningPreservesPE(original,signed){
 const before=pe(original),after=pe(signed);assert.equal(before.certificateSize,0,'Start from the accepted unsigned original, not an already signed file');
 assert(after.certificateSize>8,'No embedded signature was appended');assert.equal(after.checksum,before.checksum);assert.equal(after.security,before.security);
 const padding=after.certificateOffset-original.length;assert(padding>=0&&padding<=7,'Unexpected data before the signature');assert(signed.subarray(original.length,after.certificateOffset).every(n=>n===0),'Nonzero signing alignment padding');
 assert.equal(signed.length,after.certificateOffset+after.certificateSize,'Unexpected data after the signature');
 for(const [start,end]of [[0,before.checksum],[before.checksum+4,before.security],[before.security+8,original.length]])assert(original.subarray(start,end).equals(signed.subarray(start,end)),'Signing changed original program bytes');
 assert.equal(signed.readUInt16LE(after.certificateOffset+4),0x200,'Unsupported WIN_CERTIFICATE revision');assert.equal(signed.readUInt16LE(after.certificateOffset+6),2,'PKCS signed data required');
 const length=signed.readUInt32LE(after.certificateOffset);assert(length>=9&&length<=after.certificateSize,'Invalid WIN_CERTIFICATE length');
 const hash=createHash('sha256');for(const [start,end]of [[0,before.checksum],[before.checksum+4,before.security],[before.security+8,original.length]])hash.update(original.subarray(start,end));
 return {programBytesPreserved:true,originalBytes:original.length,certificateBytes:after.certificateSize,programContentSha256:hash.digest('hex'),scope:'Byte preservation only; Windows Authenticode verification and timestamp validation are separate required checks.'};
}
