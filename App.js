import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { Video, ResizeMode } from 'expo-av';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

const KEY_STORAGE_NAME = 'archi_gemini_api_key';
const ORB_VIDEO = require('./assets/orb.mp4');

export default function App() {
  const [screen, setScreen] = useState('loading'); // loading | apikey | home | settings
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    loadKey();
  }, []);

  async function loadKey() {
    try {
      const saved = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
      if (saved) {
        setApiKey(saved);
        setScreen('home');
      } else {
        setScreen('apikey');
      }
    } catch (e) {
      setScreen('apikey');
    }
  }

  async function saveKey(newKey) {
    await SecureStore.setItemAsync(KEY_STORAGE_NAME, newKey);
    setApiKey(newKey);
    setScreen('home');
  }

  async function clearKey() {
    await SecureStore.deleteItemAsync(KEY_STORAGE_NAME);
    setApiKey('');
    setScreen('apikey');
  }

  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'apikey') return <ApiKeyScreen onSave={saveKey} />;
  if (screen === 'settings')
    return (
      <SettingsScreen
        apiKey={apiKey}
        onBack={() => setScreen('home')}
        onChangeKey={() => setScreen('apikey')}
        onClearKey={clearKey}
      />
    );
  return <HomeScreen apiKey={apiKey} onOpenSettings={() => setScreen('settings')} />;
}

/* ---------------- Orb (video) ---------------- */
function Orb({ state }) {
  // state: 'idle' | 'listening' | 'thinking' | 'speaking'
  const pulse = useRef(new Animated.Value(1)).current;
  const videoRef = useRef(null);

  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 450, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
        ])
      ).start();
    } else {
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [state]);

  return (
    <Animated.View style={[styles.orbWrap, { transform: [{ scale: pulse }] }]}>
      <Video
        ref={videoRef}
        source={ORB_VIDEO}
        style={styles.orbVideo}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay
        isMuted
      />
    </Animated.View>
  );
}

/* ---------------- Loading Screen ---------------- */
function LoadingScreen() {
  return (
    <View style={styles.center}>
      <StatusBar style="light" />
      <Orb state="idle" />
      <Text style={styles.hintText}>Archi 2.0 shuru ho rahi hai...</Text>
    </View>
  );
}

/* ---------------- API Key Screen ---------------- */
function ApiKeyScreen({ onSave }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Key khali nahi ho sakti');
      return;
    }
    setError('');
    onSave(trimmed);
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Orb state="idle" />
        <Text style={styles.title}>Archi 2.0</Text>
        <Text style={styles.subtitle}>Apni Gemini API Key daalo</Text>
        <TextInput
          style={styles.input}
          placeholder="Gemini API Key"
          placeholderTextColor="#666a7a"
          value={value}
          onChangeText={setValue}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>Save & Continue</Text>
        </TouchableOpacity>
        <Text style={styles.hintText}>Key sirf isi device par local store hoti hai.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- Home Screen (voice-first) ---------------- */
function HomeScreen({ apiKey, onOpenSettings }) {
  const [orbState, setOrbState] = useState('idle'); // idle | listening | thinking | speaking
  const [statusText, setStatusText] = useState('Bolne ke liye orb dabao');
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const lastTranscriptRef = useRef('');

  // ---- Speech recognition events ----
  useSpeechRecognitionEvent('start', () => {
    setOrbState('listening');
    setStatusText('Sun raha hoon...');
  });

  useSpeechRecognitionEvent('end', () => {
    if (orbState === 'listening') {
      setOrbState('idle');
      setStatusText('Bolne ke liye orb dabao');
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results && event.results[0] && event.results[0].transcript;
    if (text) {
      lastTranscriptRef.current = text;
      if (event.isFinal) {
        handleUserSpeech(text);
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setOrbState('idle');
    setStatusText('Sun nahi paya, dobara try karo');
  });

  async function startListening() {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setStatusText('Microphone permission zaroori hai');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'hi-IN',
        interimResults: true,
        continuous: false,
      });
    } catch (e) {
      setStatusText('Voice start nahi hua: ' + (e.message || 'error'));
    }
  }

  async function handleUserSpeech(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    addMessage('user', trimmed);
    await askArchi(trimmed);
  }

  function addMessage(role, text) {
    setMessages((prev) => [...prev, { id: Date.now().toString() + role, role, text }]);
  }

  async function askArchi(userText) {
    if (cooldown) {
      setStatusText('Thoda ruko, phir try karo');
      return;
    }
    setOrbState('thinking');
    setStatusText('Soch rahi hoon...');
    try {
      const reply = await callGemini(apiKey, userText);
      addMessage('ai', reply);
      speak(reply);
    } catch (e) {
      const msg = e.message || 'Kuch galat hua';
      addMessage('ai', 'Error: ' + msg);
      setStatusText(msg);
      setOrbState('idle');
      if (e.isRateLimit) {
        setCooldown(true);
        setTimeout(() => setCooldown(false), 15000);
      }
    }
  }

  function speak(text) {
    setOrbState('speaking');
    setStatusText('Bol rahi hoon...');
    Speech.speak(text, {
      language: 'hi-IN',
      onDone: () => {
        setOrbState('idle');
        setStatusText('Bolne ke liye orb dabao');
      },
      onStopped: () => {
        setOrbState('idle');
        setStatusText('Bolne ke liye orb dabao');
      },
      onError: () => {
        setOrbState('idle');
        setStatusText('Bolne ke liye orb dabao');
      },
    });
  }

  async function sendTyped() {
    const text = textInput.trim();
    if (!text) return;
    setTextInput('');
    addMessage('user', text);
    await askArchi(text);
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Archi 2.0</Text>
        <TouchableOpacity onPress={onOpenSettings}>
          <Text style={styles.settingsBtnText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.orbArea}
        activeOpacity={0.8}
        onPress={orbState === 'idle' ? startListening : undefined}
      >
        <Orb state={orbState} />
        <Text style={styles.statusText}>{statusText}</Text>
      </TouchableOpacity>

      <FlatList
        style={styles.chatList}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
            <Text style={styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Ya type karo..."
            placeholderTextColor="#666a7a"
            value={textInput}
            onChangeText={setTextInput}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendTyped}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- Settings Screen ---------------- */
function SettingsScreen({ apiKey, onBack, onChangeKey, onClearKey }) {
  const masked = apiKey ? apiKey.slice(0, 4) + '••••••••' + apiKey.slice(-4) : '';
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.settingsBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsLabel}>Gemini API Key</Text>
        <Text style={styles.settingsValue}>{masked}</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={onChangeKey}>
          <Text style={styles.secondaryButtonText}>Change Key</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={onClearKey}>
          <Text style={styles.dangerButtonText}>Remove Key</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.settingsLabel}>Backup & Restore</Text>
        <Text style={styles.hintText}>Ye feature next step mein add hoga.</Text>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- Gemini API Call ---------------- */
async function callGemini(apiKey, userText) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' +
    apiKey;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] }),
    });
  } catch (netErr) {
    throw new Error('Internet check karo, connection fail hua');
  }

  if (!response.ok) {
    if (response.status === 429) {
      const err = new Error('Bahut zyada requests ho gayi (429) — 15 sec ruk kar try karo');
      err.isRateLimit = true;
      throw err;
    }
    if (response.status === 400 || response.status === 403) {
      throw new Error('API key invalid hai (status ' + response.status + '), Settings mein check karo');
    }
    throw new Error('Request fail hua (status ' + response.status + ')');
  }

  const data = await response.json();
  const text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  return text || 'Koi response nahi mila.';
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a12', padding: 24 },

  orbWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: 'hidden',
    marginBottom: 12,
  },
  orbVideo: { width: '100%', height: '100%' },

  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
  subtitle: { color: '#8a8fa3', fontSize: 14, marginBottom: 20 },

  input: {
    width: '100%',
    backgroundColor: '#161622',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 8,
  },
  errorText: { color: '#f76a6a', fontSize: 13, marginBottom: 8 },

  primaryButton: {
    backgroundColor: '#4a6cf7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  hintText: { color: '#666a7a', fontSize: 12, marginTop: 16, textAlign: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  settingsBtnText: { color: '#8a8fa3', fontSize: 14 },

  orbArea: { alignItems: 'center', paddingVertical: 10 },
  statusText: { color: '#8a8fa3', fontSize: 13, marginTop: 4 },

  chatList: { flex: 1, paddingHorizontal: 16 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 14, marginVertical: 4 },
  bubbleUser: { backgroundColor: '#4a6cf7', alignSelf: 'flex-end' },
  bubbleAi: { backgroundColor: '#161622', alignSelf: 'flex-start' },
  bubbleText: { color: '#fff', fontSize: 14 },

  inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  chatInput: {
    flex: 1,
    backgroundColor: '#161622',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    marginRight: 10,
  },
  sendBtn: { backgroundColor: '#4a6cf7', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnText: { color: '#fff', fontWeight: '600' },

  settingsSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#161622',
    borderRadius: 14,
    padding: 16,
  },
  settingsLabel: { color: '#8a8fa3', fontSize: 13, marginBottom: 6 },
  settingsValue: { color: '#fff', fontSize: 15, marginBottom: 14 },
  secondaryButton: {
    backgroundColor: '#22233a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: { color: '#fff', fontSize: 14 },
  dangerButton: { backgroundColor: '#2a1418', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  dangerButtonText: { color: '#f76a6a', fontSize: 14 },
});
