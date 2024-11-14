"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultReactRealTimeVADOptions = exports.utils = void 0;
exports.useMicVAD = useMicVAD;
const vad_web_1 = require("./vad-web-dist");
//const vad_web_1 = require("@ricky0123/vad-web");
const react_1 = __importStar(require("react"));
const { useCallback, useState } = require('react');

var vad_web_2 = require("./vad-web-dist");
//var vad_web_2 = require("@ricky0123/vad-web");
Object.defineProperty(exports, "utils", { enumerable: true, get: function () { return vad_web_2.utils; } });
const defaultReactOptions = {
    startOnLoad: true,
    userSpeakingThreshold: 0.6,
};
exports.defaultReactRealTimeVADOptions = {
    ...vad_web_1.defaultRealTimeVADOptions,
    ...defaultReactOptions,
};
const reactOptionKeys = Object.keys(defaultReactOptions);
const vadOptionKeys = Object.keys(vad_web_1.defaultRealTimeVADOptions);
const _filter = (keys, obj) => {
    return keys.reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
    }, {});
};
function useOptions(options) {
    options = { ...exports.defaultReactRealTimeVADOptions, ...options };
    const reactOptions = _filter(reactOptionKeys, options);
    const vadOptions = _filter(vadOptionKeys, options);
    return [reactOptions, vadOptions];
}
function useEventCallback(fn) {
    const ref = react_1.default.useRef(fn);
    // we copy a ref to the callback scoped to the current state/props on each render
    useIsomorphicLayoutEffect(() => {
        ref.current = fn;
    });
    return react_1.default.useCallback((...args) => ref.current.apply(void 0, args), []);
}
function useMicVAD(options) {
    const [reactOptions, vadOptions] = useOptions(options);
    const [userSpeaking, updateUserSpeaking] = (0, react_1.useReducer)((state, isSpeechProbability) => isSpeechProbability > reactOptions.userSpeakingThreshold, false);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [errored, setErrored] = (0, react_1.useState)(false);
    const [listening, setListening] = (0, react_1.useState)(false);
    const [vad, setVAD] = (0, react_1.useState)(null);
    const [accumulatedAudio, setAccumulatedAudio] = (0, react_1.useState)(new Float32Array());
    const [manuallyTriggered, setManuallyTriggered] = useState(false);

    const userOnFrameProcessed = useEventCallback(vadOptions.onFrameProcessed);
    vadOptions.onFrameProcessed = useEventCallback((probs, frame, originalFrame) => { //alex
        updateUserSpeaking(probs.isSpeech);
        userOnFrameProcessed(probs, frame, originalFrame);

        // Accumulate audio data
        setAccumulatedAudio(prevAudio => {
            const newAudio = new Float32Array(prevAudio.length + frame.length);
            newAudio.set(prevAudio);
            newAudio.set(frame, prevAudio.length);
            return newAudio;
        });
    });
    const { onSpeechEnd, onSpeechStart, onVADMisfire } = vadOptions;
    const _onSpeechEnd = useEventCallback(onSpeechEnd);
    const _onSpeechStart = useEventCallback(onSpeechStart);
    const _onVADMisfire = useEventCallback(onVADMisfire);
    vadOptions.onSpeechEnd = _onSpeechEnd;
    vadOptions.onSpeechStart = _onSpeechStart;
    vadOptions.onVADMisfire = _onVADMisfire;
    const userOnSpeechEnd = useEventCallback(vadOptions.onSpeechEnd);
    vadOptions.onSpeechEnd = useEventCallback((audio) => {
        if (!manuallyTriggered) {
            userOnSpeechEnd(audio);
        }
        setManuallyTriggered(false);
    });

    const { onSpeechEnd: originalOnSpeechEnd } = vadOptions;
    vadOptions.onSpeechEnd = useEventCallback((audio) => {
        if (!manuallyTriggered) {
            originalOnSpeechEnd(audio);
        }
        setManuallyTriggered(false);
    });

    (0, react_1.useEffect)(() => {
        let myvad;
        let canceled = false;
        const setup = async () => {
            try {
                myvad = await vad_web_1.MicVAD.new(vadOptions);
                if (canceled) {
                    myvad.destroy();
                    return;
                }
            }
            catch (e) {
                setLoading(false);
                if (e instanceof Error) {
                    setErrored({ message: e.message });
                }
                else {
                    // @ts-ignore
                    setErrored({ message: e });
                }
                return;
            }
            setVAD(myvad);
            setLoading(false);
            if (reactOptions.startOnLoad) {
                myvad?.start();
                setListening(true);
            }
        };
        setup().catch((e) => {
            console.log("Well that didn't work");
        });
        return function cleanUp() {
            myvad?.destroy();
            canceled = true;
            if (!loading && !errored) {
                setListening(false);
            }
        };
    }, []);
    const pause = () => {
        if (!loading && !errored) {
            vad?.pause();
            setListening(false);
        }
    };
    const start = () => {
        if (!loading && !errored) {
            vad?.start();
            setListening(true);
        }
    };
    const toggle = () => {
        if (listening) {
            pause();
        }
        else {
            start();
        }
    };
    // alex
    const triggerSpeechEnd = useCallback(() => {
        if (!loading && !errored && accumulatedAudio.length > 0) {
            setManuallyTriggered(true);
            userOnSpeechEnd(accumulatedAudio);
            // Reset accumulated audio after triggering speech end
            setAccumulatedAudio(new Float32Array());
        }
    }, [loading, errored, accumulatedAudio, userOnSpeechEnd]);

    return {
        listening,
        errored,
        loading,
        userSpeaking,
        pause,
        start,
        toggle,
        triggerSpeechEnd // alex
    };
}
const useIsomorphicLayoutEffect = typeof window !== "undefined" &&
    typeof window.document !== "undefined" &&
    typeof window.document.createElement !== "undefined"
    ? react_1.default.useLayoutEffect
    : react_1.default.useEffect;
//# sourceMappingURL=index.js.map