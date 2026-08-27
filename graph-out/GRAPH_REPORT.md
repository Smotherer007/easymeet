# Mind Place Report

Generated from `/Users/patrickweppelmann/Documents/Workspaces/easymeet`

## Corpus

- **Files scanned:** 119
- **Languages:** 9 .json, 2 .js, 108 .ts

## Graph Statistics

| Metric | Value |
|--------|-------|
| Nodes | 754 |
| Edges | 1113 |
| Communities | 127 |
| Avg. Degree | 3.0 |

## God Nodes

The most-connected entities - these are the architectural pillars:

| # | Node | Type | Connections | File |
|---|------|------|-------------|------|
| 1 | **client/src/domain/reducers/appReducer.ts** | file | 53 | `client/src/domain/reducers/appReducer.ts` |
| 2 | **client/src/domain/selectors/index.ts** | file | 51 | `client/src/domain/selectors/index.ts` |
| 3 | **pi-easymeet-bridge/src/index.ts** | file | 50 | `pi-easymeet-bridge/src/index.ts` |
| 4 | **EasymeetBridge** | class | 35 | `pi-easymeet-bridge/src/index.ts` |
| 5 | **server/src/mediasoup/protooSignaling.ts** | file | 29 | `server/src/mediasoup/protooSignaling.ts` |

## Communities

The graph was partitioned into these subsystems:

| Community | Size | Key Members |
|-----------|------|-------------|
| **attachStaticSpaIfPresent** | 110 | server/src/authz.ts, getRequestClientId, server/src/createApp.ts |
| **appReducer** | 54 | client/src/domain/reducers/appReducer.ts, reduceNavigationScreen, reduceRoomEntered |
| **selectRoomPolls** | 52 | client/src/domain/selectors/index.ts, selectScreen, selectRoomId |
| **registerEasymeetBridge** | 51 | pi-easymeet-bridge/src/index.ts, EasymeetConfig, JoinInfo |
| **applyStreamToMedia** | 19 | client/src/effects/media/tilesHelpers.ts, getTileState, createHandBadgeElement |
| **devDependencies** | 17 | package.json, name, private |
| **setupBeforeUnload** | 15 | client/src/app/bootstrap/cleanup.ts, needsFullDeviceGraphRecoveryOnResume, runDeviceChangeOrBenignResume |
| **disposeMicNoiseGate** | 14 | client/src/effects/audio/micNoiseGate.ts, stopLoop, passThrough |
| **validateJoinPayload** | 14 | server/src/shared/roomApiPayloads.ts, CreateRoomData, RegisterHostData |
| **enqueueDeviceGraphRecovery** | 13 | client/src/effects/media/devices.ts, localStreamHasLiveVideoTrack, noopNavigate |
| **fetchRoomStatus** | 13 | client/src/effects/network/api.ts, validateCreateRoomPayload, validateJoinPayload |
| **navigateScreens** | 12 | client/src/app/bootstrap/screens.ts, renderLangSwitcher, getJoinUrl |
| **toolBlockingEnabled** | 12 | pi-easymeet-bridge/easymeet.json, serverUrl, roomCode |
| **playReactionEffect** | 11 | client/src/effects/ui/reactionEffects.ts, runAnimation, playConfetti |
| **createSubscriptionHandler** | 10 | client/src/app/bootstrap/subscribe.ts, handleChatMessageNotification, handleChatMessageReceived |
| **getStreamForScreenShare** | 10 | client/src/effects/media/tiles.ts, setupFreeLayoutTile, updateVideoGalleryColumns |
| **getAudioProcessingConstraints** | 10 | client/src/effects/storage/audioSettingsStorage.ts, loadFromDisk, readAudioSettings |
| **parsePeerEvent** | 10 | client/src/protocol/validate.ts, validateJoinMessage, validateChatMessage |
| **logAppDebug** | 10 | client/src/utils/easymeetLog.ts, logApiInfo, logApiWarn |
| **writePeerVolumes** | 9 | client/src/effects/storage/deviceStorage.ts, readDeviceStorage, writeDeviceStorage |
| **attachLandingListeners** | 9 | client/src/ui/screens/landing.ts, renderLanding, formatRoomIdDisplay |
| **devDependencies** | 9 | pi-easymeet-bridge/package.json, name, version |
| **normalizeRoomCode** | 9 | sanitizeClientId, server/src/easymeetErrors.ts, jsonErrorBody |
| **isSupported** | 8 | client/src/effects/backgroundEffects.ts, getImageSegmenter, preloadBackgroundEffectsModel |
| **getTrendingGifs** | 8 | client/src/giphy.ts, GifResult, fetchRuntimeConfig |
| **mediaDebugStreamInfo** | 8 | client/src/utils/mediaDebug.ts, printEasymeetDeviceRecoveryGuide, maybePrintRecoveryGuideOnce |
| **devDependencies** | 7 | client/package.json, name, private |
| **playLeaveTone** | 7 | client/src/audio.ts, installAudioUnlockOnUserGesture, playTone |
| **drawBlurBackground** | 7 | client/src/effects/backgroundEffectsHelpers.ts, createMaskTemporalState, buildSmoothedPersonMask |
| **writeBackgroundEffectsSettings** | 7 | client/src/effects/storage/backgroundEffectsSettingsStorage.ts, clampFloat, sanitizePartial |
| **mergeAndClampAllWindowPositions** | 7 | client/src/ui/utils/viewportWindowClamp.ts, clampNum, clampWindowRect |
| **dependencies** | 7 | server/package.json, name, private |
| **handleJoinRoom** | 6 | client/src/app/bootstrap/roomJoinCreate.ts, getStreamForViewers, doCreateRoomApiAndSetup |
| **renderChatContent** | 6 | client/src/link-embed.ts, sanitizeEmbedId, sanitizeNumericId |
| **attachCreateRoomListeners** | 6 | client/src/ui/screens/create-room.ts, renderCreateRoomForm, renderShareContent |
| **packages** | 6 | pi-easymeet-bridge/package-lock.json, name, version |
| **newAssignedPeerId** | 6 | server/src/wsJoinTokens.ts, TokenRecord, sweep |
| **removeCustomBackground** | 5 | client/src/effects/storage/customBackgroundStorage.ts, saveCustomBackgrounds, compressImage |
| **onLangChange** | 5 | client/src/i18n.ts, t, getLang |
| **patchState** | 5 | client/src/store/index.ts, dispatch, subscribe |
| **TaskQueue.run** | 5 | client/src/utils/taskQueue.ts, TaskQueue.queue, TaskQueue.running |
| **ExtensionAPI** | 5 | pi-easymeet-bridge/src/types.d.ts, AgentMessage, ExtensionContext |
| **WebSocketServer** | 5 | server/src/types/protoo-server.d.ts, Room, Peer |
| **createDbfsReader** | 4 | client/src/effects/audio/levelMeter.ts, speakingThresholdToDbfs, createMeterAnalyser |
| **map** | 4 | client/src/shared/result.ts, err, flatMap |
| **parseJoinBody** | 4 | client/src/shared/roomApiPayloads.ts, parseCreateRoomBody, parseRegisterHostBody |
| **playScreenShareSound** | 4 | client/src/sounds.ts, playMessageSound, playJoinSound |
| **cleanupAllSpeakingIndicators** | 4 | client/src/speaking-indicator.ts, startSpeakingIndicator, stopSpeakingIndicator |
| **setJoinError** | 4 | client/src/ui/screens/join-room.ts, renderJoinRoom, attachJoinRoomListeners |
| **decrypt** | 4 | client/src/utils/crypto.ts, deriveKey, encrypt |
| **zipFileList** | 4 | client/src/utils/folder-zip.ts, extractDropData, processDropData |
| **exclude** | 4 | pi-easymeet-bridge/tsconfig.json, compilerOptions, include |
| **getJoinAttemptRollbackSlice** | 3 | client/src/domain/reducers/sessionResetSlice.ts, getSessionResetSlice, getJoinAttemptRollbackSlice |
| **escapeAttr** | 3 | client/src/shared/escape.ts, escapeHtml, escapeAttr |
| **applyDraggableRect** | 3 | client/src/ui/utils/draggableRect.ts, draggableRectInlineStyle, applyDraggableRect |
| **verifyPassword** | 3 | server/src/password.ts, hashPassword, verifyPassword |
| **initFromUrl** | 2 | client/src/app/bootstrap/index.ts, initFromUrl |
| **applyBlurEffect** | 2 | client/src/app/bootstrap/previewEffects.ts, applyBlurEffect |
| **applyVirtualBackgroundEffect** | 2 | createApplyEffectToPreview, applyVirtualBackgroundEffect |
| **loadDeviceIdsFromStorage** | 2 | client/src/app/bootstrap/storageHydration.ts, loadDeviceIdsFromStorage |
| **loadLayoutFromStorage** | 2 | initFromStorage, loadLayoutFromStorage |
| **createInitialState** | 2 | client/src/domain/reducers/initialState.ts, createInitialState |
| **fetchJson** | 2 | client/src/effects/network/httpClient.ts, fetchJson |
| **getClientId** | 2 | client/src/effects/storage/clientIdentity.ts, getClientId |
| **refreshDeviceSelects** | 2 | client/src/effects/ui/devices.ts, refreshDeviceSelects |
| **spawnFloatingReaction** | 2 | client/src/effects/ui/floatingReactions.ts, spawnFloatingReaction |
| **searchEmojis** | 2 | client/src/emoji-data.ts, searchEmojis |
| **replaceEmojiShortcodes** | 2 | client/src/utils/emojiShortcodes.ts, replaceEmojiShortcodes |
| **createFocusTrap** | 2 | client/src/utils/focusTrap.ts, createFocusTrap |
| **showToast** | 2 | client/src/utils/toast.ts, showToast |
| **httpToWsTarget** | 2 | client/vite.config.ts, httpToWsTarget |
| **Request** | 2 | server/src/types/express.d.ts, Request |
| **clearRoomViewDeviceRecoveryUi** | 1 | clearRoomViewDeviceRecoveryUi |
| **bootstrap** | 1 | bootstrap |
| **setCreateRoomError** | 1 | setCreateRoomError |
| **renderShell** | 1 | renderShell |
| **handleChatMessageMembers** | 1 | handleChatMessageMembers |
| **client/src/app/index.ts** | 1 | client/src/app/index.ts |
| **getSharedAudioContext** | 1 | getSharedAudioContext |
| **client/src/domain/events/index.ts** | 1 | client/src/domain/events/index.ts |
| **client/src/domain/index.ts** | 1 | client/src/domain/index.ts |
| **client/src/domain/invariants/index.ts** | 1 | client/src/domain/invariants/index.ts |
| **disconnectSource** | 1 | disconnectSource |
| **createSegmenterOptions** | 1 | createSegmenterOptions |
| **client/src/effects/index.ts** | 1 | client/src/effects/index.ts |
| **sleep** | 1 | sleep |
| **getDefaultTilePosition** | 1 | getDefaultTilePosition |
| **apiFailureMessage** | 1 | apiFailureMessage |
| **sanitizePartial** | 1 | sanitizePartial |
| **clampInt** | 1 | clampInt |
| **makeId** | 1 | makeId |
| **getCustomBackgrounds** | 1 | getCustomBackgrounds |
| **fitCanvas** | 1 | fitCanvas |
| **client/src/icons.ts** | 1 | client/src/icons.ts |
| **safeHrefFromUserUrl** | 1 | safeHrefFromUserUrl |
| **client/src/main.ts** | 1 | client/src/main.ts |
| **client/src/protocol/index.ts** | 1 | client/src/protocol/index.ts |
| **client/src/protocol/messages.ts** | 1 | client/src/protocol/messages.ts |
| **isTypedObject** | 1 | isTypedObject |
| **client/src/shared/constants.ts** | 1 | client/src/shared/constants.ts |
| **client/src/shared/index.ts** | 1 | client/src/shared/index.ts |
| **client/src/shared/reactionEffectIds.ts** | 1 | client/src/shared/reactionEffectIds.ts |
| **ok** | 1 | ok |
| **client/src/shared/windowPositionsDefaults.ts** | 1 | client/src/shared/windowPositionsDefaults.ts |
| **playOnce** | 1 | playOnce |
| **streamHasLiveAudio** | 1 | streamHasLiveAudio |
| **client/src/ui/screens/index.ts** | 1 | client/src/ui/screens/index.ts |
| **teardownLandingAutoRefresh** | 1 | teardownLandingAutoRefresh |
| **getViewportRect** | 1 | getViewportRect |
| **should** | 1 | should |
| **listFocusable** | 1 | listFocusable |
| **readDir** | 1 | readDir |
| **urlDebugOn** | 1 | urlDebugOn |
| **TaskQueue** | 1 | TaskQueue |
| **ensureRoot** | 1 | ensureRoot |
| **client/tests/emojiShortcodes.test.ts** | 1 | client/tests/emojiShortcodes.test.ts |
| **client/tests/protocol.test.ts** | 1 | client/tests/protocol.test.ts |
| **client/tests/result.test.ts** | 1 | client/tests/result.test.ts |
| **client/tests/roomApiPayloads.test.ts** | 1 | client/tests/roomApiPayloads.test.ts |
| **client/tests/taskQueue.test.ts** | 1 | client/tests/taskQueue.test.ts |
| **server/src/shared/reactionEffectIds.ts** | 1 | server/src/shared/reactionEffectIds.ts |
| **server/tests/authz.test.ts** | 1 | server/tests/authz.test.ts |
| **server/tests/easymeetErrors.test.ts** | 1 | server/tests/easymeetErrors.test.ts |
| **server/tests/roomCode.test.ts** | 1 | server/tests/roomCode.test.ts |
| **server/tests/roomStore.test.ts** | 1 | server/tests/roomStore.test.ts |
| **server/tests/validate.test.ts** | 1 | server/tests/validate.test.ts |
| **server/tests/wsJoinTokens.test.ts** | 1 | server/tests/wsJoinTokens.test.ts |

## Surprising Connections

- **client/src/app/bootstrap/cleanup.ts** → `contains` → **clearRoomViewDeviceRecoveryUi**: Cross-community bridge between "client/src/app/bootstrap/cleanup.ts" and "clearRoomViewDeviceRecoveryUi"
- **client/src/app/bootstrap/index.ts** → `contains` → **bootstrap**: Cross-community bridge between "client/src/app/bootstrap/index.ts" and "bootstrap"
- **client/src/app/bootstrap/previewEffects.ts** → `contains` → **createApplyEffectToPreview**: Cross-community bridge between "client/src/app/bootstrap/previewEffects.ts" and "createApplyEffectToPreview"
- **client/src/app/bootstrap/previewEffects.ts** → `contains` → **applyVirtualBackgroundEffect**: Cross-community bridge between "client/src/app/bootstrap/previewEffects.ts" and "createApplyEffectToPreview"
- **client/src/app/bootstrap/roomJoinCreate.ts** → `contains` → **setCreateRoomError**: Cross-community bridge between "client/src/app/bootstrap/roomJoinCreate.ts" and "setCreateRoomError"
- **client/src/app/bootstrap/screens.ts** → `contains` → **renderShell**: Cross-community bridge between "client/src/app/bootstrap/screens.ts" and "renderShell"
- **client/src/app/bootstrap/storageHydration.ts** → `contains` → **initFromStorage**: Cross-community bridge between "client/src/app/bootstrap/storageHydration.ts" and "initFromStorage"
- **client/src/app/bootstrap/storageHydration.ts** → `contains` → **loadLayoutFromStorage**: Cross-community bridge between "client/src/app/bootstrap/storageHydration.ts" and "initFromStorage"
- **client/src/app/bootstrap/subscribe.ts** → `contains` → **handleChatMessageMembers**: Cross-community bridge between "client/src/app/bootstrap/subscribe.ts" and "handleChatMessageMembers"
- **client/src/audio.ts** → `contains` → **getSharedAudioContext**: Cross-community bridge between "client/src/audio.ts" and "getSharedAudioContext"

## Suggested Questions

- How does **client/src/domain/reducers/appReducer.ts** connect to **client/src/domain/selectors/index.ts**?
- What calls **client/src/domain/reducers/appReducer.ts** and what does it depend on?
- Trace the data flow between **server/src/authz.ts** and **client/src/domain/reducers/appReducer.ts**
- Which modules have the most dependencies?
- Show me the architecture of the `client/src/domain/reducers/appReducer.ts` subsystem
- What is the most heavily connected module in the codebase?

---
_Report generated by pi-mindplace · Use `mindplace_query` to explore the graph_
