/// <reference types="node" />
import { EventEmitter } from "events";
import * as EBML from './EBML';
/**
 * This is an informal code for reference.
 * EBMLReader is a class for getting information to enable seeking Webm recorded by MediaRecorder.
 * So please do not use for regular WebM files.
 */
export default class EBMLReader extends EventEmitter {
    private metadataloaded;
    private stack;
    private chunks;
    private segmentOffset;
    private lastSimpleBlockVideoTrackTimecode;
    private lastClusterTimecode;
    private lastClusterPosition;
    private deltaDuration;
    private timecodeScale;
    private metadataSize;
    private currentTrack;
    private trackTypes;
    private trackDefaultDuration;
    private _duration;
    private first_video_simpleblock_of_cluster_is_loaded;
    private ended;
    use_webp: boolean;
    use_duration_every_simpleblock: boolean;
    logging: boolean;
    use_segment_info: boolean;
    drop_default_duration: boolean;
    constructor();
    stop(): void;
    private emit_segment_info();
    read(elm: EBML.EBMLElementDetail): void;
    /**
     * DefaultDuration が定義されている場合は最後のフレームのdurationも考慮する
     * 単位 timecodeScale
     */
    private readonly duration;
    /**
     * emit on every segment
     * https://www.matroska.org/technical/specs/notes.html#Position_References
    */
    addListener(event: "segment_offset", listener: (ev: number) => void): this;
    /** emit on every cluster element start.
     Offset byte from __file start__. It is not an offset from the Segment element. */
    addListener(event: "cluster_ptr", listener: (ev: number) => void): this;
    /** emit on every cue point */
    addListener(event: "cue_info", listener: (ev: CueInfo) => void): this;
    /** latest EBML > Info > TimecodeScale and EBML > Info > Duration */
    addListener(event: "duration", listener: (ev: DurationInfo) => void): this;
    /** EBML header without Cluster Element */
    addListener(event: "metadata", listener: (ev: SegmentInfo & {
        metadataSize: number;
    }) => void): this;
    /** emit every Cluster Element and its children */
    addListener(event: "cluster", listener: (ev: SegmentInfo & {
        timecode: number;
    }) => void): this;
    /** for thumbnail */
    addListener(event: "webp", listener: (ev: ThumbnailInfo) => void): this;
}
/** CueClusterPosition: Offset byte from __file start__. It is not an offset from the Segment element. */
export interface CueInfo {
    CueTrack: number;
    CueClusterPosition: number;
    CueTime: number;
}
export interface SegmentInfo {
    data: EBML.EBMLElementDetail[];
}
export interface DurationInfo {
    duration: number;
    timecodeScale: number;
}
export interface ThumbnailInfo {
    webp: Blob;
    currentTime: number;
}
export declare function put(elm: EBML.EBMLElementDetail): void;
