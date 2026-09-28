import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from "react-native";
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
  type IRtcEngine,
} from "react-native-agora";
import { requestRecordingPermissionsAsync } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera } from "lucide-react-native";
import { getTheme } from "@gracerandly/theme";
import Avatar from "./Avatar";
import { fetchAgoraJoinInfo, type ChatParticipant } from "../lib/chatApi";
import type { CallMode, CallState, ChatRole } from "../lib/chatSocket";

const theme = getTheme("light");

interface CallOverlayProps {
  role: ChatRole;
  errandId: string;
  authToken: string;
  participant: ChatParticipant | null;
  callState: CallState;
  callMode: CallMode;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
}

/**
 * Full-screen call UI, driven by the chat socket's call state (see
 * lib/chatSocket.ts). Signaling — who's ringing whom — is the chat
 * socket's job; this component only owns the Agora media session once a
 * call is "active": joining the errand's channel with a token from our
 * API, showing local/remote video, and the mute/camera/hang-up controls.
 *
 * Needs a development build, not Expo Go — react-native-agora is a native
 * module (see the README that shipped with this feature).
 */
export default function CallOverlay({
  role,
  errandId,
  authToken,
  participant,
  callState,
  callMode,
  onAccept,
  onDecline,
  onEnd,
}: CallOverlayProps) {
  const engineRef = useRef<IRtcEngine | null>(null);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = callMode === "video";
  const name = participant?.name ?? (role === "runner" ? "Requester" : "Runner");

  // Join/leave the Agora channel exactly when the call becomes/stops being
  // active — nothing media-related runs while it's just ringing.
  useEffect(() => {
    if (callState !== "active") return;
    let cancelled = false;

    async function join() {
      try {
        const mic = await requestRecordingPermissionsAsync();
        if (!mic.granted) throw new Error("Microphone permission is needed for calls");
        if (isVideo) {
          const cam = await ImagePicker.requestCameraPermissionsAsync();
          if (!cam.granted) throw new Error("Camera permission is needed for video calls");
        }

        const info = await fetchAgoraJoinInfo(role, errandId, authToken);
        if (cancelled) return;

        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId: info.appId, channelProfile: ChannelProfileType.ChannelProfileCommunication });
        engine.registerEventHandler({
          onJoinChannelSuccess: () => setJoined(true),
          onUserJoined: (_connection, uid) => setRemoteUid(uid),
          // The other party left the Agora channel — the chat socket's
          // call-end normally beats this, but if their signaling dropped
          // first this still cleans up our side.
          onUserOffline: () => {
            setRemoteUid(null);
            onEnd();
          },
          onError: (_code, msg) => setError(msg || "Call error"),
        });

        engine.enableAudio();
        if (isVideo) {
          engine.enableVideo();
          engine.startPreview();
        }
        engine.joinChannelWithUserAccount(info.token, info.channelName, info.uid, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: isVideo,
          autoSubscribeAudio: true,
          autoSubscribeVideo: isVideo,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't start the call");
      }
    }
    join();

    return () => {
      cancelled = true;
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) {
        engine.leaveChannel();
        engine.release();
      }
      setJoined(false);
      setRemoteUid(null);
      setMuted(false);
      setCameraOff(false);
      setError(null);
    };
    // onEnd is intentionally left out: it's stable enough for this
    // effect's purpose and re-running the join on its identity changing
    // would tear down a live call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, isVideo, role, errandId, authToken]);

  function toggleMute() {
    engineRef.current?.muteLocalAudioStream(!muted);
    setMuted(!muted);
  }
  function toggleCamera() {
    engineRef.current?.muteLocalVideoStream(!cameraOff);
    setCameraOff(!cameraOff);
  }

  if (callState === "idle") return null;

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {callState === "active" && isVideo && remoteUid !== null ? (
          <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: remoteUid }} />
        ) : null}
        {callState === "active" && isVideo && joined && !cameraOff ? (
          <RtcSurfaceView style={styles.localVideo} canvas={{ uid: 0 }} zOrderMediaOverlay />
        ) : null}

        <View style={styles.center}>
          {!(callState === "active" && isVideo && remoteUid !== null) ? (
            <>
              <Avatar name={name} uri={participant?.avatarUrl} size={110} />
              <Text style={styles.name}>{name}</Text>
            </>
          ) : null}
          <Text style={styles.status}>
            {error
              ? error
              : callState === "outgoing"
                ? "Calling…"
                : callState === "incoming"
                  ? `Incoming ${isVideo ? "video" : "voice"} call`
                  : remoteUid === null
                    ? "Connecting…"
                    : isVideo
                      ? ""
                      : "On call"}
          </Text>
          {callState === "active" && !joined && !error ? <ActivityIndicator color="#fff" /> : null}
        </View>

        <View style={styles.controls}>
          {callState === "incoming" ? (
            <>
              <Pressable style={[styles.button, styles.decline]} onPress={onDecline}>
                <PhoneOff size={28} color="#fff" />
              </Pressable>
              <Pressable style={[styles.button, styles.accept]} onPress={onAccept}>
                {isVideo ? <Video size={28} color="#fff" /> : <Phone size={28} color="#fff" />}
              </Pressable>
            </>
          ) : (
            <>
              {callState === "active" ? (
                <Pressable style={styles.smallButton} onPress={toggleMute}>
                  {muted ? <MicOff size={22} color="#fff" /> : <Mic size={22} color="#fff" />}
                </Pressable>
              ) : null}
              {callState === "active" && isVideo ? (
                <>
                  <Pressable style={styles.smallButton} onPress={toggleCamera}>
                    {cameraOff ? <VideoOff size={22} color="#fff" /> : <Video size={22} color="#fff" />}
                  </Pressable>
                  <Pressable style={styles.smallButton} onPress={() => engineRef.current?.switchCamera()}>
                    <SwitchCamera size={22} color="#fff" />
                  </Pressable>
                </>
              ) : null}
              <Pressable style={[styles.button, styles.decline]} onPress={onEnd}>
                <PhoneOff size={28} color="#fff" />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1c1220", justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  name: { fontFamily: theme.fonts.uiSemibold, fontSize: 24, color: "#fff", marginTop: 8 },
  status: { fontFamily: theme.fonts.ui, fontSize: 15, color: "rgba(255,255,255,0.75)", textAlign: "center", paddingHorizontal: 24 },
  controls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20, paddingBottom: 56 },
  button: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  smallButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  accept: { backgroundColor: theme.colors.success },
  decline: { backgroundColor: theme.colors.danger },
  localVideo: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 12,
    overflow: "hidden",
  },
});
