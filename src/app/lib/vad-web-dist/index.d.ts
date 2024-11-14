import { PlatformAgnosticNonRealTimeVAD, FrameProcessor, FrameProcessorOptions, Message, NonRealTimeVADOptions } from "./_common";
import { audioFileToArray } from "./utils";
export interface NonRealTimeVADOptionsWeb extends NonRealTimeVADOptions {
    modelURL: string;
    modelFetcher: (path: string) => Promise<ArrayBuffer>;
}
export declare const defaultNonRealTimeVADOptions: {
    modelURL: string;
    modelFetcher: (path: string) => Promise<ArrayBuffer>;
};
declare class NonRealTimeVAD extends PlatformAgnosticNonRealTimeVAD {
    static new(options?: Partial<NonRealTimeVADOptionsWeb>): Promise<NonRealTimeVAD>;
}
export declare const utils: {
    minFramesForTargetMS: typeof import("./_common/utils").minFramesForTargetMS;
    arrayBufferToBase64: typeof import("./_common/utils").arrayBufferToBase64;
    encodeWAV: typeof import("./_common/utils").encodeWAV;
    audioFileToArray: typeof audioFileToArray;
};
export { FrameProcessor, Message, NonRealTimeVAD };
export type { FrameProcessorOptions, NonRealTimeVADOptions };
export { MicVAD, AudioNodeVAD, defaultRealTimeVADOptions, } from "./real-time-vad";
export type { RealTimeVADOptions } from "./real-time-vad";
//# sourceMappingURL=index.d.ts.map