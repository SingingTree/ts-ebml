/// <reference types="node" />
import * as EBML from "./EBML";
export declare const Buffer: typeof global.Buffer;
export declare const readVint: (buffer: Buffer, start: number) => null | ({
    length: number;
    value: number;
});
export declare const writeVint: (val: number) => Buffer;
export declare const ebmlBlock: (buf: Buffer) => EBML.SimpleBlock;
export declare function readBlock(buf: ArrayBuffer): EBML.SimpleBlock;
/**
  * @param end - if end === false then length is unknown
  */
export declare function encodeTag(tagId: Buffer, tagData: Buffer, unknownSize?: boolean): Buffer;
/**
 * @return - SimpleBlock to WebP Filter
 */
export declare function WebPFrameFilter(elms: EBML.EBMLElementDetail[]): Blob[];
/**
 * WebP ファイルにできる SimpleBlock の パスフィルタ
 */
export declare function WebPBlockFilter(elms: EBML.EBMLElementDetail[]): (EBML.BinaryElement & EBML.ElementDetail & {
    data: Buffer;
})[];
/**
 * @param frame - VP8 BitStream のうち startcode をもつ frame
 * @return - WebP ファイルの ArrayBuffer
 */
export declare function VP8BitStreamToRiffWebPBuffer(frame: Buffer): Buffer;
/**
 * RIFF データチャンクを作る
 */
export declare function createRIFFChunk(FourCC: string, chunk: Buffer): Buffer;
/**
 * metadata に対して duration と seekhead を追加した metadata を返す
 * @param segmentOffset - the offset that needs to be applied to create relative offsets into a segement from abolsute offsets
 * @param metadata - 変更前の webm における ファイル先頭から 最初の Cluster 要素までの 要素
 * @param clusterPtrs - 変更前の webm における SeekHead に追加する Cluster 要素 への start pointer
 * @param duration - Duration に記載する値
 */
export declare function putRefinedMetaData(metadata: EBML.EBMLElementDetail[], info: {
    duration?: number;
    clusterPtrs?: number[];
    cueInfos?: {
        CueTrack: number;
        CueClusterPosition: number;
        CueTime: number;
    }[];
}): ArrayBuffer;
export declare function insertTag(_metadata: EBML.EBMLElementBuffer[], tagName: string, children: EBML.EBMLElementBuffer[]): void;
export declare function concat(list: Buffer[]): Buffer;
export declare function encodeValueToBuffer(elm: EBML.MasterElement): EBML.MasterElement;
export declare function encodeValueToBuffer(elm: EBML.ChildElementsValue): EBML.ChildElementBuffer;
export declare function createUIntBuffer(value: number): Buffer;
export declare function createIntBuffer(value: number): Buffer;
export declare function createFloatBuffer(value: number, bytes?: 4 | 8): Buffer;
