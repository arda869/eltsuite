import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./mock/seed";
import { getAuth } from "./mock/auth";
import { saveAsset } from "../src/video/library";
function Fixture() {
  const [status, setStatus] = useState("Ready");
  return (
    <main>
      <h1>Local video test media</h1>
      <p>
        This page uses the Firebase stand-ins and synthetic media. It never
        calls a paid API.
      </p>
      <button
        onClick={async () => {
          setStatus("Making test files");
          await (window as any).__mockReady;
          const uid = getAuth().currentUser!.uid;
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          const c = canvas.getContext("2d")!;
          const audio = new AudioContext();
          await audio.resume();
          const destination = audio.createMediaStreamDestination(),
            gain = audio.createGain(),
            osc = audio.createOscillator();
          gain.gain.value = 0.05;
          osc.frequency.value = 220;
          osc.connect(gain);
          gain.connect(destination);
          osc.start();
          const stream = canvas.captureStream(30);
          stream.addTrack(destination.stream.getAudioTracks()[0]);
          const recorder = new MediaRecorder(stream, {
              mimeType: "video/webm;codecs=vp8,opus",
            }),
            chunks: Blob[] = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          const stopped = new Promise<void>(
            (r) => (recorder.onstop = () => r()),
          );
          let t = 0;
          const draw = setInterval(() => {
            c.fillStyle = "#1a7f8e";
            c.fillRect(0, 0, 640, 360);
            c.fillStyle = "#f1b776";
            c.beginPath();
            c.arc(100 + (t % 300), 180, 60, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = "#fff";
            c.font = "36px sans-serif";
            c.fillText("A classroom test scene", 90, 70);
            t += 5;
          }, 33);
          recorder.start();
          await new Promise((r) => setTimeout(r, 2000));
          recorder.stop();
          await stopped;
          clearInterval(draw);
          osc.stop();
          await audio.close();
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const a = await saveAsset(blob, {
            owner: uid,
            ownerName: "Test teacher",
            name: "Test classroom scene",
            kind: "video",
            duration: 2,
            description: "Synthetic test",
            voice: "",
            org: "",
            readers: [],
          });
          const pic = await new Promise<Blob>((r) =>
            canvas.toBlob((b) => r(b!), "image/png"),
          );
          await saveAsset(pic, {
            owner: uid,
            ownerName: "Test teacher",
            name: "Reference fox",
            kind: "character",
            duration: 5,
            description: "An original reference for testing",
            voice: "Gentle",
            visualStyle: "3d-cartoon",
            org: "",
            readers: [],
          });
          localStorage.setItem("videoTestSource", a);
          setStatus("Test files saved.");
        }}
      >
        Make test media
      </button>
      <p role="status">{status}</p>
      <a href="/studio/video/new">Open video editor</a>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
