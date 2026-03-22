/**
 * App events – event-first architecture.
 * Every state change comes from an explicit event.
 * Small atomic events instead of god-events.
 */

/** @typedef {'landing'|'create-room'|'create-room-success'|'join-room'|'room-view'} Screen */

/** Navigation: `screen` plus beliebige weitere State-Felder (wie früher patchState bei navigate). */
/** @typedef {{ type: 'navigation/screen'; payload: { screen: Screen } & Record<string, unknown> }} NavScreenEvent */
/** @typedef {{ type: 'room/createRequested'; payload: { nickname: string; password: string; roomCode: string } }} CreateRoomRequestedEvent */
/** @typedef {{ type: 'room/joinRequested'; payload: { roomId: string; password: string; nickname: string } }} JoinRoomRequestedEvent */
/** @typedef {{ type: 'room/created'; payload: { roomId: string; password: string; nickname: string; peerId: string } }} RoomCreatedEvent */
/** @typedef {{ type: 'room/joined'; payload: { roomId: string; password: string; nickname: string; peerId: string } }} RoomJoinedEvent */
/** @typedef {{ type: 'room/leaveRequested' }} LeaveRequestedEvent */
/** @typedef {{ type: 'chat/sendRequested'; payload: { text: string; giphyUrls: string[] } }} ChatSendRequestedEvent */
/** @typedef {{ type: 'chat/messageReceived'; payload: import('../../protocol/messages.js').ChatMessage|{type:'join'|'leave';nick:string}|import('../../protocol/messages.js').FileShareMessage }} ChatMessageReceivedEvent */
/** @typedef {{ type: 'chat/membersUpdated'; payload: { list: string[] } }} ChatMembersUpdatedEvent */
/** @typedef {{ type: 'voip/membersUpdated'; payload: Array<{peerId:string;nick:string}> }} VoipMembersUpdatedEvent */
/** @typedef {{ type: 'voip/muteReceived'; payload: { peerId: string; muted: boolean } }} VoipMuteReceivedEvent */
/** @typedef {{ type: 'voip/muteToggled' }} VoipMuteToggledEvent */
/** @typedef {{ type: 'voip/screenStreamStarted'; payload: { peerId: string; nick: string; stream?: any } }} ScreenStreamStartedEvent */
/** @typedef {{ type: 'voip/screenStreamStopped'; payload: { peerId: string } }} ScreenStreamStoppedEvent */
/** @typedef {{ type: 'voip/remoteStreamAdded'; payload: { peerId: string; stream: any } }} RemoteStreamAddedEvent */
/** @typedef {{ type: 'voip/remoteStreamEnded'; payload: { peerId: string } }} RemoteStreamEndedEvent */
/** @typedef {{ type: 'voip/videoStateUpdated'; payload: { peerId: string; videoEnabled: boolean } }} VideoStateUpdatedEvent */
/** @typedef {{ type: 'voip/backgroundEffectUpdated'; payload: { peerId: string; effect: string } }} BackgroundEffectUpdatedEvent */
/** @typedef {{ type: 'file/received'; payload: { filename: string; fileId?: string; fromNick: string; blob?: Blob; mimeType?: string } }} FileReceivedEvent */
/** @typedef {{ type: 'file/progress'; payload: { filename: string; bytesReceived: number; total: number; nick?: string; speedKbps?: number; fileId?: string } }} FileProgressEvent */
/** @typedef {{ type: 'file/progressCleared' }} FileProgressClearedEvent */
/** @typedef {{ type: 'host/leaving' }} HostLeavingEvent */
/** @typedef {{ type: 'peer/volumeChanged'; payload: { peerId: string; percent: number } }} PeerVolumeChangedEvent */
/** @typedef {{ type: 'cleanup/finished'; payload: { screen: Screen } }} CleanupFinishedEvent */
/** @typedef {{ type: 'session/cleared' }} SessionClearedEvent */
/** @typedef {{ type: 'room/joinAttemptAborted' }} RoomJoinAttemptAbortedEvent */
/** @typedef {{ type: 'room/createAttemptAborted' }} RoomCreateAttemptAbortedEvent */
/** @typedef {{ type: 'storage/devicesRestored'; payload: { inputDeviceId?: string | null; outputDeviceId?: string | null; videoDeviceId?: string | null } }} StorageDevicesRestoredEvent */
/** @typedef {{ type: 'storage/videoLayoutRestored'; payload: { videoLayoutMode: 'free' | 'grid' } }} StorageVideoLayoutRestoredEvent */
/** @typedef {{ type: 'storage/windowPositionsRestored'; payload: { windowPositions: Record<string, unknown> } }} StorageWindowPositionsRestoredEvent */
/** @typedef {{ type: 'storage/audioSettingsRestored'; payload: { audioSettings: Record<string, unknown> } }} StorageAudioSettingsRestoredEvent */
/** @typedef {{ type: 'peer/volumesMerged'; payload: { volumes: Record<string, number> } }} PeerVolumesMergedEvent */
/** @typedef {{ type: 'ui/unreadChatIncremented'; payload?: { delta?: number } }} UnreadChatIncrementedEvent */
/** @typedef {{ type: 'effects/callDeviceChangeHandler'; payload: { handler: (() => void) | null } }} EffectsCallDeviceChangeHandlerEvent */
/** @typedef {{ type: 'effects/deviceChangeHandler'; payload: { handler: (() => void) | null } }} EffectsDeviceChangeHandlerEvent */
/** @typedef {{ type: 'effects/previewEffectStop'; payload: { stop: (() => void) | null } }} EffectsPreviewEffectStopEvent */

/** @typedef {NavScreenEvent|CreateRoomRequestedEvent|JoinRoomRequestedEvent|RoomCreatedEvent|RoomJoinedEvent|LeaveRequestedEvent|ChatSendRequestedEvent|ChatMessageReceivedEvent|ChatMembersUpdatedEvent|VoipMembersUpdatedEvent|VoipMuteReceivedEvent|VoipMuteToggledEvent|ScreenStreamStartedEvent|ScreenStreamStoppedEvent|RemoteStreamAddedEvent|RemoteStreamEndedEvent|VideoStateUpdatedEvent|BackgroundEffectUpdatedEvent|FileReceivedEvent|FileProgressEvent|FileProgressClearedEvent|HostLeavingEvent|PeerVolumeChangedEvent|CleanupFinishedEvent|SessionClearedEvent|RoomJoinAttemptAbortedEvent|RoomCreateAttemptAbortedEvent|StorageDevicesRestoredEvent|StorageVideoLayoutRestoredEvent|StorageWindowPositionsRestoredEvent|StorageAudioSettingsRestoredEvent|PeerVolumesMergedEvent|UnreadChatIncrementedEvent|EffectsCallDeviceChangeHandlerEvent|EffectsDeviceChangeHandlerEvent|EffectsPreviewEffectStopEvent} AppEvent */

export {};
