const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { WaveFile } = require('wavefile');

// Ensure ffmpeg is found by discord.js
process.env.FFMPEG_PATH = require('ffmpeg-static');


const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
let voiceConnection = null;
const audioPlayer = createAudioPlayer();

// Queue for messages to ensure they don't overlap
const messageQueue = [];
let isPlaying = false;

// Kokoro TTS Instance
let ttsInstance = null;
let isTtsInitializing = false;

let progressCb = null;
let localAudioCallback = null;
let speakCondition = null;
function setLocalAudioCallback(cb) { localAudioCallback = cb; }
function setProgressCallback(cb) { progressCb = cb; }
function setSpeakCondition(cb) { speakCondition = cb; }

async function initTTS() {
  if (ttsInstance) return ttsInstance;
  if (isTtsInitializing) {
    while (isTtsInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    return ttsInstance;
  }
  
  isTtsInitializing = true;
  console.log('[Discord Bot] Initializing Kokoro TTS Model (may take a moment to download on first run)...');
  
  try {
    const { KokoroTTS } = await import('kokoro-js');
    ttsInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { 
      dtype: "q8", 
      device: "cpu",
      progress_callback: (info) => {
        if (progressCb) progressCb(info);
      }
    });
    console.log('[Discord Bot] Kokoro TTS Initialized!');
  } catch (err) {
    console.error('[Discord Bot] Failed to init Kokoro:', err);
  }
  
  isTtsInitializing = false;
  return ttsInstance;
}

client.on('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}!`);
  
  // Find the channel
  client.channels.fetch(client.channelIdToJoin).then(channel => {
    if (!channel || !channel.isVoiceBased()) {
      console.error('[Discord] Voice channel not found or not a voice channel');
      return;
    }
    
    voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });
    
    voiceConnection.subscribe(audioPlayer);
    console.log('[Discord] Joined voice channel successfully!');
    
    // Pre-load the TTS model in the background when connected
    initTTS();
  }).catch(console.error);
});

audioPlayer.on(AudioPlayerStatus.Idle, () => {
  isPlaying = false;
  processQueue();
});

audioPlayer.on('error', error => {
  console.error('[Discord] Audio Player Error:', error.message);
  isPlaying = false;
  processQueue();
});

async function processQueue() {
  if (isPlaying || messageQueue.length === 0) return;
  
  isPlaying = true;
  const text = messageQueue.shift();
  
  const tts = await initTTS();
  if (!tts) {
    console.error('[Discord Bot] TTS not available');
    isPlaying = false;
    processQueue();
    return;
  }
  
  try {
    const audioFilePath = path.join(os.tmpdir(), `gt7_engineer_${Date.now()}.wav`);
    
    // Generate raw audio array using a human-like voice (af_heart or am_adam etc.)
    // af_heart is a female voice, am_adam is a male voice
    const rawAudio = await tts.generate(text, { voice: "af_heart" });
    
    // Save to WAV file
    const wav = new WaveFile();
    wav.fromScratch(1, rawAudio.sampling_rate, '32f', rawAudio.audio);
    fs.writeFileSync(audioFilePath, wav.toBuffer());
    
    const playAudio = () => {
      if (speakCondition && !speakCondition()) {
        setTimeout(playAudio, 250);
        return;
      }

      if (voiceConnection) {
        const resource = createAudioResource(audioFilePath);
        audioPlayer.play(resource);
      } else {
        if (localAudioCallback) localAudioCallback(path.basename(audioFilePath));
        
        // If discord isn't pacing it, pace it ourselves using the audio duration
        const durationMs = (rawAudio.audio.length / rawAudio.sampling_rate) * 1000;
        setTimeout(() => {
          isPlaying = false;
          processQueue();
        }, durationMs + 500);
      }
      
      // Clean up file after a delay to ensure it's loaded into ffmpeg
      setTimeout(() => {
        fs.unlink(audioFilePath, () => {});
      }, 5000);
    };

    playAudio();
  } catch (e) {
    console.error('[Discord] TTS Generation/Playback Error:', e);
    isPlaying = false;
    processQueue();
  }
}

function speak(text) {
  console.log(`[Discord Bot] Queuing TTS: "${text}"`);
  messageQueue.push(text);
  processQueue();
}

function start() {
  const { app } = require('electron');
  const configPath = path.join(app.getPath('userData'), 'config.json');
  
  let token = process.env.DISCORD_TOKEN;
  let channelId = process.env.DISCORD_CHANNEL_ID;
  
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.token) token = config.token;
      if (config.channelId) channelId = config.channelId;
    }
  } catch(e) {}
  
  if (!token || !channelId) {
    console.log('[Discord] No token or channel ID provided.');
    return;
  }
  
  // Save for the ready event
  client.channelIdToJoin = channelId;

  console.log('[Discord] Connecting bot...');
  client.login(token).catch(console.error);
}

module.exports = { start, speak, setProgressCallback, setLocalAudioCallback, setSpeakCondition };
