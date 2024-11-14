// Home.js
"use client";

import clsx from "clsx";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useMicVAD, utils } from './lib/vad-react';
import { usePlayer } from "./lib/usePlayer";
import * as tf from '@tensorflow/tfjs';
import * as speech from '@tensorflow-models/speech-commands';

export default function Home() {
	const [messages, setMessages] = useState([]);
	const player = usePlayer();
	const isSubmittingRef = useRef(false);
	const [input, setInput] = useState("");
	const [isListening, setIsListening] = useState(false);
	const [model, setModel] = useState(null);
	const frameBufferRef = useRef([]);
	const frameCountRef = useRef(0);
	const [isConversationEnded, setIsConversationEnded] = useState(false);
	const stopDetectedRef = useRef(false);
	const postStopSpeechFrames = useRef(0);
	const postStopSilenceFrames = useRef(0);
	const MAX_POST_STOP_SPEECH_FRAMES = 10; // Max speech frames allowed after "stop"
	const MIN_POST_STOP_SILENCE_FRAMES = 10;  // Min silence frames required to confirm stop
	const [isStopWordDetected, setIsStopWordDetected] = useState(false);
	const [writerResponse, setWriterResponse] = useState("");
	const [writerInput, setWriterInput] = useState("");
	const [isWriterLoading, setIsWriterLoading] = useState(false);

	useEffect(() => {
		async function loadModel() {
			try {
				const recognizer = speech.create('BROWSER_FFT');
				await recognizer.ensureModelLoaded();
				setModel(recognizer);
				console.log("Speech model loaded successfully.");
			} catch (err) {
				console.error("Failed to load speech model:", err);
			}
		}
		loadModel();
	}, []);

	const vad = useMicVAD({
		startOnLoad: true,
		onSpeechStart: () => {
			console.log("Speech started");
			setIsListening(true);
		},

		onFrameProcessed: async (probabilities, frame, originalFrame) => {
			if (!isListening) return; // Only process frames when actively listening

			const NUM_FRAMES = 12;
			try {
				if (!originalFrame || originalFrame.length === 0) {
					return;
				}
				frameBufferRef.current.push(originalFrame);
				frameCountRef.current += 1;

				if (frameCountRef.current >= NUM_FRAMES) {
					if (model && frameBufferRef.current.length > 0) {
						try {
							// Create a new Float32Array to hold all samples
							const totalSamples = NUM_FRAMES * 1536; // Assuming each frame has 1536 samples
							const combinedFrame = new Float32Array(totalSamples);

							// Copy samples from each frame into the combined array
							for (let i = 0; i < NUM_FRAMES; i++) {
								const startIndex = i * 1536;
								combinedFrame.set(frameBufferRef.current[frameBufferRef.current.length - NUM_FRAMES + i], startIndex);
							}

							if (combinedFrame.length === 0) {
								console.log("Combined frame is empty");
								return;
							}

							// Compute the spectrogram
							const signal = tf.tensor1d(combinedFrame);
							// Parameters matching the model's expected input
							const frameLength = 1024;
							const frameStep = 256;
							const fftLength = 1024;

							const stft = tf.signal.stft(signal, frameLength, frameStep, fftLength);
							let magnitude = tf.abs(stft);
							// Ensure the spectrogram has the required shape
							const numFrames = magnitude.shape[0];
							const numFreqBins = magnitude.shape[1];

							const requiredNumFrames = 43;
							const requiredNumFreqBins = 232;

							// Adjust the number of frames
							if (numFrames < requiredNumFrames) {
								const padFrames = requiredNumFrames - numFrames;
								const padding = tf.zeros([padFrames, numFreqBins]);
								magnitude = tf.concat([magnitude, padding], 0);
							} else if (numFrames > requiredNumFrames) {
								magnitude = magnitude.slice([0, 0], [requiredNumFrames, -1]);
							}

							// Adjust the number of frequency bins
							if (numFreqBins > requiredNumFreqBins) {
								magnitude = magnitude.slice([0, 0], [-1, requiredNumFreqBins]);
							} else if (numFreqBins < requiredNumFreqBins) {
								const padFreqBins = requiredNumFreqBins - numFreqBins;
								const padding = tf.zeros([magnitude.shape[0], padFreqBins]);
								magnitude = tf.concat([magnitude, padding], 1);
							}

							// Reshape to match the model's expected input shape
							const inputTensor = magnitude.reshape([1, requiredNumFrames, requiredNumFreqBins, 1]);

							// Perform recognition
							const result = await model.recognize(inputTensor);

							// Check for the 'stop' word
							const scores = result.scores;
							const labels = model.wordLabels();
							const stopIndex = labels.indexOf('stop');

							if (scores[stopIndex] > 0.5) {
								console.log("Stop word detected");
								// Set the stop detected flag and reset counters
								stopDetectedRef.current = true;
								postStopSpeechFrames.current = 0;
								postStopSilenceFrames.current = 0;
							}
						} catch (error) {
							if (error.message !== "Cannot stop because there is no ongoing streaming activity.") {
								console.error("Error in speech recognition:", error);
							}
						}
					}
					// Keep only the last 10 frames in the buffer
					frameBufferRef.current = frameBufferRef.current.slice(-NUM_FRAMES);
					frameCountRef.current = NUM_FRAMES;
				}

				// Monitor post-"stop" speech and silence frames
				if (stopDetectedRef.current) {
					if (vad.userSpeaking) {
						postStopSpeechFrames.current += 1;
						if (postStopSpeechFrames.current >= MAX_POST_STOP_SPEECH_FRAMES) {
							// User continued speaking; reset the flag and counters
							console.log("User continued speaking after 'stop', resetting stopDetected");
							stopDetectedRef.current = false;
							postStopSpeechFrames.current = 0;
							postStopSilenceFrames.current = 0;
						}
					} else {
						postStopSilenceFrames.current += 1;
						if (postStopSilenceFrames.current >= MIN_POST_STOP_SILENCE_FRAMES) {
							// User stopped speaking after "stop"; trigger the action
							console.log("Stop word detected followed by silence, triggering action");
							setIsStopWordDetected(true);
							//vad.pause();
							vad.triggerSpeechEnd();
							stopDetectedRef.current = false;
							postStopSpeechFrames.current = 0;
							postStopSilenceFrames.current = 0;
						}
					}
				}

			} catch (err) {
				console.error("Error in onFrameProcessed:", err);
			}
		},

		onSpeechEnd: (audio) => {
			console.log("Speech ended");
			handleSpeechEnd(audio);
		},
		workletURL: "/vad.worklet.bundle.min.js",
		modelURL: "/silero_vad.onnx",
		positiveSpeechThreshold: 0.6,
		redemptionFrames: 52, // 5 seconds
		minSpeechFrames: 4,
		ortConfig(ort) {
			const isSafari = /^((?!chrome|android).)*safari/i.test(
				navigator.userAgent
			);

			ort.env.wasm = {
				wasmPaths: {
					"ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
					"ort-wasm-simd.wasm": "/ort-wasm-simd.wasm",
					"ort-wasm.wasm": "/ort-wasm.wasm",
					"ort-wasm-threaded.wasm": "/ort-wasm-threaded.wasm",
				},
				numThreads: isSafari ? 1 : 4,
			};
		},
		onVADMisfire: () => {
			console.log("VAD misfire");
		}
	});


	const submit = useCallback(async (data) => {
		console.info("Submit function called");
		console.log("Messages before submit:", messages);

		const formData = new FormData();

		if (typeof data === "string") {
			formData.append("input", data);
			console.log("Text input appended to FormData");
		} else {
			formData.append("input", data, "audio.wav");
			console.log("Audio input appended to FormData");
			console.debug("Audio Blob details:", {
				size: data.size,
				type: data.type,
				lastModified: data.lastModified,
			});
		}

		formData.append("messages", JSON.stringify(messages));
		formData.append("isStopWordDetected", isStopWordDetected);
		console.log("Messages appended to FormData");

		const submittedAt = Date.now();

		try {
			console.log("Sending POST request to api");
			const response = await fetch("/api/route", {
				method: "POST",
				body: formData,
			});
			console.log("Response received", response);

			const transcript = decodeURIComponent(
				response.headers.get("X-Transcript") || ""
			);
			const text = decodeURIComponent(
				response.headers.get("X-Response") || ""
			);

			if (!response.ok || !transcript || !text || !response.body) {
				console.error("Invalid response:", {
					ok: response.ok,
					status: response.status,
					transcript: !!transcript,
					text: !!text,
					body: !!response.body
				});
				if (response.status === 429) {
					console.warn("Too many requests. Please try again later.");
				} else {
					const errorText = await response.text();
					console.error("Error response:", errorText || "An error occurred.");
				}
				return;
			}

			const arrayBuffer = await response.arrayBuffer();
			console.log("Received arrayBuffer size:", arrayBuffer.byteLength);

			const latency = Date.now() - submittedAt;
			console.info(`Latency: ${latency}ms`);

			console.log("Starting audio playback");
			player.play(arrayBuffer, () => {
				console.info("Audio playback ended");
			});

			setInput(transcript);
			console.info("Input state updated with transcript");

			setMessages((prevMessages) => {
				const newMessages = [
					...prevMessages,
					{
						role: "user",
						content: transcript,
					},
					{
						role: "assistant",
						content: text,
						latency,
					},
				];
				console.log("Updated messages:", newMessages);
				return newMessages;
			});

			const endOfConversation = response.headers.get("X-End-Of-Conversation") === "true";
			console.log("End of conversation:", endOfConversation);
			setIsConversationEnded(endOfConversation);
		} catch (error) {
			console.error("Error submitting form:", error);
		}
	}, [messages, player]);

	const handleSpeechEnd = useCallback(async (audio) => {
		player.stop();
		const wav = utils.encodeWAV(audio);
		const blob = new Blob([wav], { type: "audio/wav" });
		await submit(blob);
		const isFirefox = navigator.userAgent.includes("Firefox");
		if (isFirefox) vad.pause();
	}, [player, submit, vad]);


	const handleStop = useCallback(() => {
		vad.pause();
		setIsListening(false);
	}, [vad]);

	useEffect(() => {
		if (isConversationEnded) {
			handleStop();
			sendTranscriptToWriter();
		}
	}, [isConversationEnded, handleStop]);

	const sendTranscriptToWriter = useCallback(async () => {
		try {
			const formattedTranscript = messages.map(m => 
				`${m.role === 'assistant' ? 'spark' : 'user'}: ${m.content}`
			).join('\n');
			console.log("Formatted transcript:", formattedTranscript);
			const response = await fetch("/api/writer", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ transcript: formattedTranscript }),
			});

			if (!response.ok) {
				throw new Error("Failed to get writer response");
			}

			const data = await response.json();
			setWriterResponse(data.response);
		} catch (error) {
			console.error("Error sending transcript to writer:", error);
			setWriterResponse("Failed to get writer response");
		}
	}, [messages]);

	const handleWriterSubmit = useCallback(async () => {
		setIsWriterLoading(true);
		try {
			const response = await fetch("/api/writer", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ transcript: writerInput }),
			});

			if (!response.ok) {
				throw new Error("Failed to get writer response");
			}

			const data = await response.json();
			setWriterResponse(data.response);
		} catch (error) {
			console.error("Error sending input to writer:", error);
			setWriterResponse("Failed to get writer response");
		} finally {
			setIsWriterLoading(false);
		}
	}, [writerInput]);

	const memoizedJSX = useMemo(() => (
		<>

			<div className="pb-4 min-h-28" />



			<div className="text-neutral-400 dark:text-neutral-600 pt-4 text-center max-w-xl text-balance min-h-28 space-y-4">
				{messages.length > 0 && (
					<p>
						{messages.at(-1)?.content}
						<span className="text-xs font-mono text-neutral-300 dark:text-neutral-700">
							{" "}
							({messages.at(-1)?.latency}ms)
						</span>
					</p>
				)}

				{messages.length === 0 && (
					<>
						{vad.loading ? (
							<p>Loading speech detection...</p>
						) : vad.errored ? (
							<p>Failed to load speech detection.</p>
						) : (
							<p>Start talking to chat.</p>
						)}
					</>
				)}

			{/*	{(isConversationEnded || writerResponse) && (
					<div className="mt-4 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
						<h3 className="text-lg font-semibold mb-2">Writer's Response:</h3>
						<p>{writerResponse}</p>
					</div>
				)}*/}
			</div>

			<div
				className={clsx(
					"absolute size-36 blur-3xl rounded-full bg-gradient-to-b from-red-200 to-red-400 dark:from-red-600 dark:to-red-800 -z-50 transition ease-in-out",
					{
						"opacity-0": vad.loading || vad.errored,
						"opacity-30": !vad.loading && !vad.errored && !vad.userSpeaking,
						"opacity-100 scale-110": vad.userSpeaking,
					}
				)}
			/>

			<div className="mt-8 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
				<h3 className="text-lg font-semibold mb-2">Simulate Conversation End:</h3>
				<textarea
					className="w-full p-2 border rounded dark:bg-neutral-700 dark:text-white"
					value={writerInput}
					onChange={(e) => setWriterInput(e.target.value)}
					rows="4"
					placeholder="Enter text to simulate conversation end..."
				/>
				<button
					className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
					onClick={handleWriterSubmit}
					disabled={isWriterLoading}
				>
					{isWriterLoading ? (
						<>
							<span className="inline-block animate-spin mr-2">&#8987;</span>
							Processing...
						</>
					) : (
						"Simulate Conversation End"
					)}
				</button>
			</div>

			{(isConversationEnded || writerResponse) && (
				<div className="mt-4 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
					<h3 className="text-lg font-semibold mb-2">Writer's Response:</h3>
					<p>{writerResponse}</p>
				</div>
			)}
		</>
	), [messages, input, isSubmittingRef.current, vad.loading, vad.errored, vad.userSpeaking, isConversationEnded, writerResponse, writerInput, handleWriterSubmit, isWriterLoading]);

	return memoizedJSX;
}   
