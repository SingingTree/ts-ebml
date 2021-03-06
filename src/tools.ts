import {Int64BE, Uint64BE} from "int64-buffer";
import * as EBML from "./EBML";
import Encoder from "./EBMLEncoder";


export const Buffer: typeof global.Buffer = require("buffer/").Buffer;

export const readVint: (buffer: Buffer, start: number)=> null | ({length: number; value: number; }) = require("ebml/lib/ebml/tools").readVint;
export const writeVint: (val: number)=> Buffer = require("ebml/lib/ebml/tools").writeVint;

export const ebmlBlock: (buf: Buffer)=> EBML.SimpleBlock = require("ebml-block");
export function readBlock(buf: ArrayBuffer): EBML.SimpleBlock {
  return ebmlBlock(new Buffer(buf));
}

/**
  * @param end - if end === false then length is unknown
  */
export function encodeTag(tagId: Buffer, tagData: Buffer, unknownSize=false): Buffer {
  return concat([
    tagId,
    unknownSize ?
      new Buffer('01ffffffffffffff', 'hex') : 
      writeVint(tagData.length),
    tagData
  ]);
}

/**
 * @return - SimpleBlock to WebP Filter
 */
export function WebPFrameFilter(elms: EBML.EBMLElementDetail[]): Blob[] {
  return WebPBlockFilter(elms).reduce<Blob[]>((lst, elm)=>{
    const o = ebmlBlock(elm.data);
    return o.frames.reduce<Blob[]>((lst, frame)=>{
      // https://developers.Blob.com/speed/webp/docs/riff_container
      const  webpBuf = VP8BitStreamToRiffWebPBuffer(frame);
      const webp = new Blob([webpBuf], {type: "image/webp"});
      return lst.concat(webp);
    }, lst);
  }, []);
}

/**
 * WebP ファイルにできる SimpleBlock の パスフィルタ
 */
export function WebPBlockFilter(elms: EBML.EBMLElementDetail[]): (EBML.BinaryElement & EBML.ElementDetail & {data: Buffer})[] {
  return elms.reduce<(EBML.BinaryElement & EBML.ElementDetail & {data: Buffer})[]>((lst, elm)=>{
    if(elm.type !== "b"){ return lst; }
    if(elm.name !== "SimpleBlock"){ return lst; }
    const o = ebmlBlock(elm.data);
    const hasWebP = o.frames.some((frame)=>{
      // https://tools.ietf.org/html/rfc6386#section-19.1
      const startcode = frame.slice(3, 6).toString("hex");
      return startcode === "9d012a";
    });
    if(!hasWebP){ return lst; }
    return lst.concat(elm);
  }, []);
}

/**
 * @param frame - VP8 BitStream のうち startcode をもつ frame
 * @return - WebP ファイルの ArrayBuffer
 */
export function VP8BitStreamToRiffWebPBuffer(frame: Buffer): Buffer {
  const VP8Chunk = createRIFFChunk("VP8 ", frame);
  const WebPChunk = concat([
    new Buffer("WEBP", "ascii"),
    VP8Chunk
  ]);
  return createRIFFChunk("RIFF", WebPChunk);
}

/**
 * RIFF データチャンクを作る
 */
export function createRIFFChunk(FourCC: string, chunk: Buffer): Buffer {
  const chunkSize = new Buffer(4);
  chunkSize.writeUInt32LE(chunk.byteLength , 0);
  return concat([
    new Buffer(FourCC.substr(0, 4), "ascii"),
    chunkSize,
    chunk,
    new Buffer(chunk.byteLength % 2 === 0 ? 0 : 1) // padding
  ]);
}

/**
 * metadata に対して duration と seekhead を追加した metadata を返す
 * @param segmentOffset - the offset that needs to be applied to create relative offsets into a segement from abolsute offsets
 * @param metadata - 変更前の webm における ファイル先頭から 最初の Cluster 要素までの 要素
 * @param clusterPtrs - 変更前の webm における SeekHead に追加する Cluster 要素 への start pointer
 * @param duration - Duration に記載する値
 */
export function putRefinedMetaData(
  metadata: EBML.EBMLElementDetail[],
  info: {
    duration?: number,
    clusterPtrs?: number[],
    cueInfos?: {CueTrack: number; CueClusterPosition: number; CueTime: number; }[]
  }
): ArrayBuffer {
  let ebml: EBML.EBMLElementDetail[] = [];
  let payload: EBML.EBMLElementDetail[] = [];
  for(let i=0; i<metadata.length; i++){
    const elm = metadata[i];
    if(elm.type === "m" && elm.name === "Segment"){
      ebml = metadata.slice(0, i);
      payload = metadata.slice(i);
      if(elm.unknownSize){
        payload.shift(); // remove segment tag
        break;
      }
      throw new Error("this metadata is not streaming webm file");
    }
  }
  // [EBML][size]...[Segment][size][Info][size][Duration][size]...[Cluster]
  //                |              |                              + originalPayloadOffsetEnd
  //                |              +
  //                +
  const originalPayloadOffsetEnd = payload[payload.length-1].dataEnd;
  const ebmlSize = new Encoder().encode(ebml).byteLength;
  const payloadSize = new Encoder().encode(payload).byteLength;
  const segmentTag = new Buffer([0x18, 0x53, 0x80, 0x67]); // Segment
  let prevPayloadSize = payloadSize;
  // We need the size to be stable between two refinements in order for our offsets to be correct
  // Bound the number of possible refinements so we can't go infinate if something goes wrong
  let i;
  for(i = 1; i < 20; i++) {
    const segmentSize = segmentTag.byteLength + writeVint(prevPayloadSize).byteLength;
    const sizeDiff = ebmlSize + segmentSize + prevPayloadSize - originalPayloadOffsetEnd;
    const segmentOffset = ebmlSize + segmentSize;
    const refined = refineMetadata(payload, sizeDiff - segmentOffset, info);
    const refinedSize = new Encoder().encode(refined).byteLength; // 一旦 seekhead を作って自身のサイズを調べる
    if(refinedSize === prevPayloadSize) {
      // Size is stable
      return new Encoder().encode(
        (<EBML.EBMLElementBuffer[]>[]).concat(
          ebml,
          [{type: "m", name: "Segment", isEnd: false, unknownSize: true}],
          refined,
        )
      );
    }
    prevPayloadSize = refinedSize;
  }
  throw new Error("unable to refine metadata, stable size could not be found in " + i + " iterations!");
}
// Given a list of EBMLElementBuffers, returns their encoded size in bytes
function encodedSizeOfEbml(refinedMetaData: EBML.EBMLElementBuffer[]): number {
  const encorder = new Encoder();
  return refinedMetaData.reduce<ArrayBuffer[]>((lst, elm)=> lst.concat(encorder.encode([elm])), []).reduce((o, buf)=> o + buf.byteLength, 0);
}

function refineMetadata(
  mesetadata: EBML.EBMLElementDetail[],
  sizeDiff: number,
  info: {
    duration?: number,
    clusterPtrs?: number[],
    cueInfos?: {CueTrack: number; CueClusterPosition: number; CueTime: number; }[]
  }
): EBML.EBMLElementBuffer[] {
  const {duration, clusterPtrs, cueInfos} = info;
  let _metadata: EBML.EBMLElementBuffer[] = mesetadata.slice(0);
  if(typeof duration === "number"){
    // duration を追加する
    let overwrited = false;
    _metadata.forEach((elm)=>{
      if(elm.type === "f" && elm.name === "Duration"){
        overwrited = true;
        elm.data = createFloatBuffer(duration, 8);
      }
    });
    if(!overwrited){
      insertTag(_metadata, "Info", [{name: "Duration", type: "f", data: createFloatBuffer(duration, 8) }]);
    }
  }
  if(Array.isArray(clusterPtrs)){
    insertTag(_metadata, "SeekHead", create_seek(clusterPtrs, sizeDiff));
  }
  if(Array.isArray(cueInfos)){
    insertTag(_metadata, "Cues", create_cue(cueInfos, sizeDiff));
  }
  return _metadata;
}

function create_seek(clusterPtrs: number[], sizeDiff: number): EBML.EBMLElementBuffer[] {
  const seeks: EBML.EBMLElementBuffer[] = [];
  clusterPtrs.forEach((start)=>{
    seeks.push({name: "Seek", type: "m", isEnd: false});
      // [0x1F, 0x43, 0xB6, 0x75] で Cluster 意
      seeks.push({name: "SeekID", type: "b", data: new Buffer([0x1F, 0x43, 0xB6, 0x75]) });
      seeks.push({name: "SeekPosition", type: "u", data: createUIntBuffer(start +  sizeDiff)});
    seeks.push({name: "Seek", type: "m", isEnd: true});
  });
  return seeks;
}

function create_cue(cueInfos: {CueTrack: number; CueClusterPosition: number; CueTime: number; }[], sizeDiff: number): EBML.EBMLElementBuffer[] {
  const cues: EBML.EBMLElementBuffer[] = [];
  cueInfos.forEach(({CueTrack, CueClusterPosition, CueTime})=>{
    cues.push({name: "CuePoint", type: "m", isEnd: false});
      cues.push({name: "CueTime", type: "u", data: createUIntBuffer(CueTime) });
      cues.push({name: "CueTrackPositions", type: "m", isEnd: false});
        cues.push({name: "CueTrack", type: "u", data: createUIntBuffer(CueTrack) }); // video track
        cues.push({name: "CueClusterPosition", type: "u", data: createUIntBuffer(CueClusterPosition +  sizeDiff) });
      cues.push({name: "CueTrackPositions", type: "m", isEnd: true});
    cues.push({name: "CuePoint", type: "m", isEnd: true});
  });
  return cues;
}

export function insertTag(_metadata: EBML.EBMLElementBuffer[], tagName: string, children: EBML.EBMLElementBuffer[]): void {
  let idx = -1;
  for(let i=0; i<_metadata.length; i++){
    const elm = _metadata[i];
    if(elm.type === "m" && elm.name === tagName && elm.isEnd === false){
      idx = i;
      break;
    }
  }
  if(idx >= 0){
    // insert [<CuePoint />] to <Cues />
    Array.prototype.splice.apply(_metadata, [<any>idx+1, 0].concat(children));
  }else{
    // metadata 末尾に <Cues /> を追加
    // insert <Cues />
    _metadata.push({name: tagName, type: "m", isEnd: false});
    children.forEach((elm)=>{ _metadata.push(elm); });
    _metadata.push({name: tagName, type: "m", isEnd: true});
  }
}


// alter Buffer.concat - https://github.com/feross/buffer/issues/154
export function concat(list: Buffer[]): Buffer {
  //return Buffer.concat.apply(Buffer, list);
  let i = 0;
  let length = 0;
  for (; i < list.length; ++i) {
    length += list[i].length;
  }

  let buffer = Buffer.allocUnsafe(length);
  let pos = 0;
  for (i = 0; i < list.length; ++i) {
    let buf = list[i];
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
}

export function encodeValueToBuffer(elm: EBML.MasterElement): EBML.MasterElement;
export function encodeValueToBuffer(elm: EBML.ChildElementsValue): EBML.ChildElementBuffer;
export function encodeValueToBuffer(elm: EBML.EBMLElementValue): EBML.EBMLElementBuffer {
  let data = new Buffer(0);
  if(elm.type === "m"){ return elm; }
  switch(elm.type){
    case "u": data = createUIntBuffer(elm.value); break;
    case "i": data = createIntBuffer(elm.value); break;
    case "f": data = createFloatBuffer(elm.value); break;
    case "s": data = new Buffer(elm.value, 'ascii'); break;
    case "8": data = new Buffer(elm.value, 'utf8'); break;
    case "b": data = elm.value; break;
    case "d": data = new Int64BE(elm.value).toBuffer(); break;
  }
  return Object.assign({}, elm, {data});
}

export function createUIntBuffer(value: number): Buffer {
  // Big-endian, any size from 1 to 8
  // but js number is float64, so max 6 bit octets
  let bytes: 1|2|3|4|5|6 = 1;
  for(; value >= Math.pow(2, 8*bytes); bytes++){}
  if(bytes >= 7){
    console.warn("7bit or more bigger uint not supported.");
    return new Uint64BE(value).toBuffer();
  }
  const data = new Buffer(bytes);
  data.writeUIntBE(value, 0, bytes);
  return data;
}

export function createIntBuffer(value: number): Buffer {
  // Big-endian, any size from 1 to 8 octets
  // but js number is float64, so max 6 bit
  let bytes: 1|2|3|4|5|6 = 1;
  for(; value >= Math.pow(2, 8*bytes); bytes++){}
  if(bytes >= 7){
    console.warn("7bit or more bigger uint not supported.");
    return new Int64BE(value).toBuffer();
  }
  const data = new Buffer(bytes);
  data.writeIntBE(value, 0, bytes);
  return data;
}

export function createFloatBuffer(value: number, bytes: 4|8 = 8): Buffer {
  // Big-endian, defined for 4 and 8 octets (32, 64 bits)
  // js number is float64 so 8 bytes.
  if(bytes === 8){
    // 64bit
    const data = new Buffer(8);
    data.writeDoubleBE(value, 0);
    return data;
  }else if(bytes === 4){
    // 32bit
    const data = new Buffer(4);
    data.writeFloatBE(value, 0);
    return data;
  }else{
    throw new Error("float type bits must 4bytes or 8bytes");
  }
}
