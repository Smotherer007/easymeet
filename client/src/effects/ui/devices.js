/**
 * Effect: UI orchestration for device selection (Layer 4)
 */

import { getState, patchState } from "../../store/index.js";
import {
	selectInputDeviceId,
	selectVideoDeviceId,
	selectOutputDeviceId,
	selectLocalStream,
	selectScreen
} from "../../domain/selectors/index.js";
import { getAudioDevices, getVideoDevices } from "../network/mediasoupClient.js";
import { t } from "../../i18n.js";
import { escapeHtml, escapeAttr } from "../../shared/escape.js";
import { writeDeviceId } from "../storage/deviceStorage.js";
import { DEVICE_STORAGE } from "../../shared/constants.js";
import { applyOutputDeviceToAllAudios } from "../media/tiles.js";

export async function refreshDeviceSelects(app) {
	let { inputs, outputs } = await getAudioDevices();
	let videos = await getVideoDevices();

	/* Labels often missing until first getUserMedia — in an active call with a live mic track, no second
	 * getUserMedia (would conflict with noise gate / hotplug recovery). */
	/* In-room: never; enumerate is enough after permission; extra getUserMedia disrupts hotplug/re-gum. */
	const stateEarly = getState();
	if (
		selectScreen(stateEarly) !== "room-view" &&
		inputs.length &&
		inputs.every((d) => !String(d.label || "").trim())
	) {
		try {
			const tmp = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			tmp.getTracks().forEach((t) => t.stop());
			const again = await getAudioDevices();
			inputs = again.inputs;
			outputs = again.outputs;
			videos = await getVideoDevices();
		} catch (_) {
			/* z. B. verweigert — Liste ohne Label behalten */
		}
	}

	const state = getState();
	const inputSelect = app.querySelector("#input-device");
	const outputSelect = app.querySelector("#output-device");
	const videoSelect = app.querySelector("#video-device");

	const patches = {};

	if (inputSelect) {
		inputSelect.innerHTML = inputs.map((d, i) => `<option value="${escapeAttr(d.deviceId)}">${escapeHtml(d.label || t("defaultDevice") + " " + (i + 1))}</option>`).join("");
		const preferredIn = selectInputDeviceId(state) || selectLocalStream(state)?.getAudioTracks?.()[0]?.getSettings?.()?.deviceId || (inputs[0]?.deviceId ?? "");
		let inputId = preferredIn;
		if (inputId && !inputs.some((d) => d.deviceId === inputId)) {
			inputId = inputs[0]?.deviceId ?? "";
			patches.inputDeviceId = inputId || null;
			if (inputId) writeDeviceId(DEVICE_STORAGE.input, inputId);
			else writeDeviceId(DEVICE_STORAGE.input, null);
		}
		if (inputId && inputs.some((d) => d.deviceId === inputId)) inputSelect.value = inputId;
		else if (inputs[0]) inputSelect.value = inputs[0].deviceId;
	}

	if (videoSelect && videos.length) {
		videoSelect.innerHTML = videos.map((d, i) => `<option value="${escapeAttr(d.deviceId)}">${escapeHtml(d.label || t("defaultDevice") + " " + (i + 1))}</option>`).join("");
		const preferredVid = selectVideoDeviceId(state) || selectLocalStream(state)?.getVideoTracks?.()[0]?.getSettings?.()?.deviceId || (videos[0]?.deviceId ?? "");
		let videoId = preferredVid;
		if (videoId && !videos.some((d) => d.deviceId === videoId)) {
			videoId = videos[0]?.deviceId ?? "";
			patches.videoDeviceId = videoId || null;
			if (videoId) writeDeviceId(DEVICE_STORAGE.video, videoId);
			else writeDeviceId(DEVICE_STORAGE.video, null);
		}
		if (videoId && videos.some((d) => d.deviceId === videoId)) videoSelect.value = videoId;
		else if (videos[0]) videoSelect.value = videos[0].deviceId;
	}

	if (outputSelect) {
		outputSelect.innerHTML = outputs.map((d, i) => `<option value="${escapeAttr(d.deviceId)}">${escapeHtml(d.label || t("defaultDevice") + " " + (i + 1))}</option>`).join("");
		const preferredOut = selectOutputDeviceId(state) || (outputs[0]?.deviceId ?? "");
		let outputId = preferredOut;
		if (outputId && !outputs.some((d) => d.deviceId === outputId)) {
			outputId = outputs[0]?.deviceId ?? "";
			patches.outputDeviceId = outputId || null;
			if (outputId) writeDeviceId(DEVICE_STORAGE.output, outputId);
			else writeDeviceId(DEVICE_STORAGE.output, null);
		}
		if (outputId && outputs.some((d) => d.deviceId === outputId)) outputSelect.value = outputId;
		else if (outputs[0]) outputSelect.value = outputs[0].deviceId;
	}

	if (Object.keys(patches).length) patchState(patches);
	applyOutputDeviceToAllAudios(selectOutputDeviceId(getState()) || "");
}
