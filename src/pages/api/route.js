import Groq from "groq-sdk";
import { createClient } from "@deepgram/sdk";
import { IncomingForm } from "formidable"; // Updated import
import fs from "fs"; // Import fs.promises to read the file
import path from "path";
import { v4 as uuidv4 } from "uuid"; // To generate unique filenames
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static"; // Provides the path to the FFmpeg binary
import OpenAI from "openai";
import os from "os"; // Import the 'os'
import { chmod } from 'fs/promises';

// Use the system's temporary directory
const uploadsDir = os.tmpdir();

// Set the path to the FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegPath);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY); 

export const config = {
	api: {
		bodyParser: false,
	},
};

export default async function handler(req, res) { 
	if (req.method !== 'POST') {
		return res.status(405).send("Method not allowed");
	}

	const form = new IncomingForm();

	form.parse(req, async (err, fields, files) => {
		if (err) {
			console.error("Error parsing form data:", err); // Added log
			return res.status(500).send("Error parsing form data");
		}

		// Modify here to handle both text and file inputs
		let input;
		let transcript = null;

		if (fields.input) {
			input = fields.input;
		} else if (files.input && files.input.length > 0) {
			const file = files.input[0];

			// Generate a unique filename with .mp3 extension
			const uniqueFilename = `${uuidv4()}.mp3`;
			const mp3FilePath = path.join(uploadsDir, uniqueFilename);

			try {
				// Ensure FFmpeg binary is executable
				await chmod(ffmpegPath, 0o755);
				
				// Proceed with conversion
				await new Promise((resolve, reject) => {
					ffmpeg(file.filepath)
						.output(mp3FilePath)
						.audioCodec('libmp3lame')
						.on('end', () => {
							console.log(`File converted and saved to ${mp3FilePath}`);
							resolve();
						})
						.on('error', (conversionError) => {
							console.error("Error during audio conversion:", conversionError);
							reject(conversionError);
						})
						.run();
				});

				transcript = await getTranscript(mp3FilePath);
				console.log("Transcript:", transcript);

				if (!transcript) {
					console.warn("Invalid audio: Transcript could not be generated");
					return res.status(400).send("Invalid audio");
				}
			} catch (conversionError) {
				console.error("Failed to process audio file:", conversionError);
				return res.status(500).send("Failed to process audio file");
			}
		} else {
			console.warn("Invalid request: No input provided");
			return res.status(400).send("Invalid request");
		}

		const msgs = fields.messages ? JSON.parse(fields.messages[0]) : [];
		console.log("Messages:", fields.messages[0]);
		console.log("Messages parsed:", msgs);
		console.log("Messages length:", msgs.length);

		const sanitizedMsgs = msgs.map(({ role, content }) => ({ role, content }));

		const userContent = transcript || input;

		const response = await getChatCompletion(sanitizedMsgs, userContent, fields.isStopWordDetected);
		console.log("LLama res:", response);
		try {
			const ttsResponse = await deepgram.speak.request(
				{ text: response.response },
				{
					model: 'aura-asteria-en',
					encoding: 'linear16',
					container: 'wav',
				}
			);

			const stream = await ttsResponse.getStream();
			const headers = await ttsResponse.getHeaders();

			if (!stream) {
				throw new Error('Error generating audio stream');
			}

			const buffer = await streamToBuffer(stream);

			// Save the buffer locally
			const outputFilePath = path.join(uploadsDir, `tts_${uuidv4()}.wav`);
			await fs.promises.writeFile(outputFilePath, buffer);
			console.log(`Audio file saved to ${outputFilePath}`);

			res.setHeader("Content-Type", "audio/wav");
			res.setHeader("X-Transcript", encodeURIComponent(transcript));
			res.setHeader("X-Response", encodeURIComponent(response.response));
			res.setHeader("X-End-Of-Conversation", response.end_of_conversation);
			res.status(200).send(buffer);
		} catch (error) {
			console.error(error);
			res.status(500).send("Voice synthesis failed");
		}
	});
}

async function getTranscript(filePath) {
	try {
		const { text } = await groq.audio.transcriptions.create({
			file: fs.createReadStream(filePath),
			model: "distil-whisper-large-v3-en",
		});

		return text.trim() || null;
	} catch (error) {
		console.error("Error during transcription:", error);
		return null;
	}
}

function concatUint8Arrays(arrays) {
	let totalLength = arrays.reduce((acc, value) => acc + value.length, 0);
	let result = new Uint8Array(totalLength);
	let offset = 0;
	for (let arr of arrays) {
		result.set(arr, offset);
		offset += arr.length;
	}
	return result;
}

async function streamToBuffer(stream) {
	const reader = stream.getReader();
	const chunks = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	const concatenated = concatUint8Arrays(chunks);
	return Buffer.from(concatenated);
}


async function getLlamaCompletion(sanitizedMsgs, userContent) {
	const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

	const completion = await groq.chat.completions.create({
		model: "llama3-8b-8192",
		messages: [
			{
				role: "system",
				content: `
			You are Sparkie, the expert interviewer. You will be interviewing professionals. You are the interviewer. I will be the professional you are interviewing. You have a zen and funny voice that appeals to executives. After I answer each question, you will respond with a less than 10-word sentence reflecting on what I said and continuing to the next question. Ask only one question at a time. You will identify 3 major themes you can draw out from my initial introduction or from longer answers. Tell me these 3 major themes. Then you will try to get more detail on all themes.  Start with theme 1. You will rate my answer on a scale of 1-5 : 1) Answer is not related to the question 2) Answer is all stumble words. 3) Answer lacks substance. 4) Good answer, related but too short or not specific enough, so need to ask followup 5) Great answer, long with good detail - can write a good linkedin thought leadership post with it. For each major theme, if the combined answer across multiple questions is rated 1-4, then continue to ask dig-in questions. If it's rated 5, then move onto the next major theme. 
			If this is the first interview start by giving me instructions 1) if you didn't hear or remember a question feel free to ask me to repeat it, 2) if you don't want to answer a question let me know and I'll move on, 3) if you want to end the interview let me know and I'll wrap up the conversation and 4) I take feedback well. Tell me what you need anytime if my interview questions aren't to your liking. Then, ask me about my area of expertise and work background. Also, ask me who I would like to reach with this interview. Then ask me about any recent or past experiences that I want to share and some important lessons that could be useful for others. Listen to what I say. Log a general outline of big topics, and then for each big topic ask several relevant follow-up questions. Make the transition from big topics to big topics obvious. You need to pause after each question to let me answer and then resume with the next question. Go back and forth until you conclude the interview. 
			If this is not the first interview, ask me if I've read any interesting books or articles lately and how it relates to my work. If nothing, try podcasts or events. If nothing is there, ask about major pain points that my customers are struggling with. Ask questions that contradict the current narrative in my field. Ask about what has inspired me related to my thought leadership topic. Log a general outline of big topics, then for each big topic ask several relevant follow-up questions. Go back and forth and dig into questions that draw out insights that can be written up in blog posts. You will periodically remind them of my brand goal and promise to trigger my thoughts.
			You will need to decide when to conclude the interview. If I start having difficulty answering or start repeating, then re-start with a new line of questioning. 
			When you conclude the interview thank me, and share a transcript of the interview, including the time length of the interview.
		  `,
			},
			...(sanitizedMsgs.length > 0 ? sanitizedMsgs : []),
			{
				role: "user",
				content: userContent,
			},
		],
	});

	return completion.choices[0].message.content;
}

async function getChatCompletion(sanitizedMsgs, userContent, isStopWordDetected) {

	// if isStopWordDetected is true, then add the user mesage in <system - rate this answer 5 and move to the next question> userContent </system>
	if (isStopWordDetected) {
		userContent = `<system - rate this answer 5 and move to the next question> ${userContent} </system>`;
	}

	const completion = await openai.chat.completions.create({
		model: "gpt-4o",
		messages: [
			{
				role: "system",
				content: `
			You are Sparkie, the expert interviewer. You will be interviewing professionals. You are the interviewer. I will be the professional you are interviewing. You have a zen and funny voice that appeals to executives. After I answer each question, you will respond with a less than 10-word sentence reflecting on what I said and continuing to the next question. Ask only one question at a time. You will identify 3 major themes you can draw out from my initial introduction or from longer answers. Tell me these 3 major themes. Then you will try to get more detail on all themes.  Start with theme 1. You will rate my answer on a scale of 1-5 : 1) Answer is not related to the question 2) Answer is all stumble words. 3) Answer lacks substance. 4) Good answer, related but too short or not specific enough, so need to ask followup 5) Great answer, long with good detail - can write a good linkedin thought leadership post with it. For each major theme, if the combined answer across multiple questions is rated 1-4, then continue to ask dig-in questions. If it's rated 5, then move onto the next major theme. 
			If this is the first interview start by giving me instructions 1) if you didn't hear or remember a question feel free to ask me to repeat it, 2) if you don't want to answer a question let me know and I'll move on, 3) if you want to end the interview let me know and I'll wrap up the conversation and 4) I take feedback well. Tell me what you need anytime if my interview questions aren't to your liking. Then, ask me about my area of expertise and work background. Also, ask me who I would like to reach with this interview. Then ask me about any recent or past experiences that I want to share and some important lessons that could be useful for others. Listen to what I say. Log a general outline of big topics, and then for each big topic ask several relevant follow-up questions. Make the transition from big topics to big topics obvious. You need to pause after each question to let me answer and then resume with the next question. Go back and forth until you conclude the interview. 
			If this is not the first interview, ask me if I've read any interesting books or articles lately and how it relates to my work. If nothing, try podcasts or events. If nothing is there, ask about major pain points that my customers are struggling with. Ask questions that contradict the current narrative in my field. Ask about what has inspired me related to my thought leadership topic. Log a general outline of big topics, then for each big topic ask several relevant follow-up questions. Go back and forth and dig into questions that draw out insights that can be written up in blog posts. You will periodically remind them of my brand goal and promise to trigger my thoughts.
			You will need to decide when to conclude the interview. If I start having difficulty answering or start repeating, then re-start with a new line of questioning. 
			When you conclude the interview thank me, and share a transcript of the interview, including the time length of the interview.

			Return your response in JSON format {response: "your response", end_of_conversation: true/false}.

		  `,
			},
			...(sanitizedMsgs.length > 0 ? sanitizedMsgs : []),
			{
				role: "user",
				content: userContent,
			},
		],
		response_format: { type: "json_object" },
	});

	return JSON.parse(completion.choices[0].message.content);
}