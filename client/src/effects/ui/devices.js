/**
 * Effect: UI orchestration for device selection (Layer 4)
 */

import { getState } from "../../store/index.js";
import { selectInputDeviceId, selectVideoDeviceId, selectOutputDeviceId, selectLocalStream } from "../../domain/selectors/index.js";
import { getAudioDevices, getVideoDevices } from "../network/mediasoupClient.js";
import { t } from "../../i18n.js";
import { escapeHtml } from "../../shared/escape.js";

export async function refreshDeviceSelects(app) {
	const { inputs, outputs } = await getAudioDevices();
	const videos = await getVideoDevices();
	const state = getState();
	const inputSelect = app.querySelector("#input-device");
	const outputSelect = app.querySelector("#output-device");
	const videoSelect = app.querySelector("#video-device");

	if (inputSelect) {
		inputSelect.innerHTML = inputs.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || t("defaultDevice") + " " + (i + 1))}</option>`).join("");
		const inputId = selectInputDeviceId(state) || selectLocalStream(state)?.getAudioTracks?.()[0]?.getSettings?.()?.deviceId || (inputs[0]?.deviceId ?? "");
		if (inputId && inputs.some((d) => d.deviceId === inputId)) inputSelect.value = inputId;
		else if (inputs[0]) inputSelect.value = inputs[0].deviceId;
	}

	if (videoSelect && videos.length) {
		videoSelect.innerHTML = videos.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || t("defaultDevice") + " " + (i + 1))}</option>`).join("");
		const videoId = selectVideoDeviceId(state) || selectLocalStream(state)?.getVideoTracks?.()[0]?.getSettings?.()?.deviceId || (videos[0]?.deviceId ?? "");
		if (videoId && videos.some((d) => d.deviceId === videoId)) videoSelect.value = videoId;
		else if (videos[0]) videoSelect.value = videos[0].deviceId;
	}

	if (outputSelect) {
		outputSelect.innerHTML = outputs.map((d, i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || t("defaultDevice") + " " + (i + 1))}</option>`).join("");
		const outputId = selectOutputDeviceId(state) || (outputs[0]?.deviceId ?? "");
		if (outputId && outputs.some((d) => d.deviceId === outputId)) outputSelect.value = outputId;
		else if (outputs[0]) outputSelect.value = outputs[0].deviceId;
	}
}
