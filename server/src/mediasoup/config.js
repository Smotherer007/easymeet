/**
 * mediasoup Worker- und Router-Konfiguration.
 * Layer 2: Generic configuration – kein I/O.
 */

import os from "os";

const numWorkers = Math.max(1, Math.min(os.cpus().length, 4));

export const workerSettings = {
	logLevel: "warn",
	logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
	rtcMinPort: parseInt(process.env.RTC_MIN_PORT, 10) || 40000,
	rtcMaxPort: parseInt(process.env.RTC_MAX_PORT, 10) || 40200
};

export const mediaCodecs = [
	{
		kind: "audio",
		mimeType: "audio/opus",
		clockRate: 48000,
		channels: 2
	},
	{
		kind: "video",
		mimeType: "video/VP8",
		clockRate: 90000,
		parameters: { "x-google-start-bitrate": 1000 }
	},
	{
		kind: "video",
		mimeType: "video/VP9",
		clockRate: 90000,
		parameters: { "profile-id": 2, "x-google-start-bitrate": 1000 }
	},
	{
		kind: "video",
		mimeType: "video/H264",
		clockRate: 90000,
		parameters: {
			"packetization-mode": 1,
			"profile-level-id": "4d0032",
			"level-asymmetry-allowed": 1,
			"x-google-start-bitrate": 1000
		}
	}
];

/** Local (two tabs, npm run server): without announcedIp some setups yield poor ICE candidates */
const defaultAnnouncedIp = process.env.MEDIASOUP_ANNOUNCED_IP || (process.env.NODE_ENV !== "production" ? "127.0.0.1" : undefined);

export const webRtcTransportOptions = {
	listenIps: [
		{
			ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
			announcedIp: defaultAnnouncedIp || undefined
		}
	],
	initialAvailableOutgoingBitrate: 1000000,
	maxSctpMessageSize: 262144,
	enableSctp: true,
	numSctpStreams: { OS: 1024, MIS: 1024 },
	enableUdp: true,
	enableTcp: true,
	preferUdp: true
};

export { numWorkers };
