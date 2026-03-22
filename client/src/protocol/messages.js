/**
 * Peer-Nachrichten-Schema und Typen.
 * Plain Data – keine Klassen.
 */

/** @typedef {'join'|'leave'|'chat'|'file_share'|'members'|'peers'|'new_peer'|'mute'|'screen_sharing'|'screen_sharing_stopped'|'screen_stream'|'file_start'|'file_end'|'host_leaving'} PeerMessageType */

/** @typedef {{ type: 'join'; nick: string }} JoinMessage */
/** @typedef {{ type: 'leave'; nick: string; peerId?: string }} LeaveMessage */
/** @typedef {{ type: 'chat'; nick: string; text: string; ts: number; giphyUrl?: string; giphyUrls?: string[] }} ChatMessage */
/** @typedef {{ type: 'file_share'; nick: string; filename: string; ts: number; fileId?: string }} FileShareMessage */
/** @typedef {{ type: 'members'; list: string[] }} MembersMessage */
/** @typedef {{ type: 'peers'; list: string[]; members?: Array<{peerId: string; nick: string}> }} PeersMessage */
/** @typedef {{ type: 'new_peer'; peerId: string; nick: string }} NewPeerMessage */
/** @typedef {{ type: 'mute'; peerId: string; muted: boolean }} MuteMessage */
/** @typedef {{ type: 'screen_sharing'; peerId: string; nick: string }} ScreenSharingMessage */
/** @typedef {{ type: 'screen_sharing_stopped'; peerId: string }} ScreenSharingStoppedMessage */
/** @typedef {{ type: 'screen_stream'; peerId: string; nick?: string }} ScreenStreamMessage */
/** @typedef {{ type: 'file_start'; fileId?: string; filename: string; size: number; mimeType?: string; encrypted?: boolean; fromNick?: string }} FileStartMessage */
/** @typedef {{ type: 'file_end'; filename: string }} FileEndMessage */
/** @typedef {{ type: 'host_leaving' }} HostLeavingMessage */

/** @typedef {JoinMessage|LeaveMessage|ChatMessage|FileShareMessage|MembersMessage|PeersMessage|NewPeerMessage|MuteMessage|ScreenSharingMessage|ScreenSharingStoppedMessage|ScreenStreamMessage|FileStartMessage|FileEndMessage|HostLeavingMessage} PeerMessage */
