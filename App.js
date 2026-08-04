import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import * as Contacts from 'expo-contacts';
import * as Calendar from 'expo-calendar';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

const KEY_STORAGE_NAME = 'archi_gemini_api_key';
const ORB_VIDEO = require('./assets/orb.mp4');

export default function App() {
  const [screen, setScreen] = useState('loading'); // loading | apikey | permissions | home | settings
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    loadKey();
  }, []);

  async function loadKey() {
    try {
      const saved = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
      if (saved) {
        setApiKey(saved);
        setScreen('permissions');
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
    setScreen('permissions');
  }

  async function clearKey() {
    await SecureStore.deleteItemAsync(KEY_STORAGE_NAME);
    setApiKey('');
    setScreen('apikey');
  }

  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'apikey') return <ApiKeyScreen onSave={saveKey} />;
  if (screen === 'permissions')
    return <PermissionsScreen onDone={() => setScreen('home')} />;
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
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

/* ---------------- Permissions Screen ---------------- */
function PermissionsScreen({ onDone }) {
  const [status, setStatus] = useState({
    mic: 'pending',
    contacts: 'pending',
    calendar: 'pending',
    location: 'pending',
    phone: 'pending',
    notifications: 'pending',
  });
  const [running, setRunning] = useState(false);

  function setOne(key, val) {
    setStatus((prev) => ({ ...prev, [key]: val }));
  }

  async function requestAll() {
    setRunning(true);

    try {
      const mic = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setOne('mic', mic.granted ? 'granted' : 'denied');
    } catch (e) {
      setOne('mic', 'denied');
    }

    try {
      const c = await Contacts.requestPermissionsAsync();
      setOne('contacts', c.status === 'granted' ? 'granted' : 'denied');
    } catch (e) {
      setOne('contacts', 'denied');
    }

    try {
      const cal = await Calendar.requestCalendarPermissionsAsync();
      setOne('calendar', cal.status === 'granted' ? 'granted' : 'denied');
    } catch (e) {
      setOne('calendar', 'denied');
    }

    try {
      const loc = await Location.requestForegroundPermissionsAsync();
      setOne('location', loc.status === 'granted' ? 'granted' : 'denied');
    } catch (e) {
      setOne('location', 'denied');
    }

    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CALL_PHONE
        );
        setOne('phone', granted === 'granted' ? 'granted' : 'denied');
      }
    } catch (e) {
      setOne('phone', 'denied');
    }

    try {
      const notif = await Notifications.requestPermissionsAsync();
      setOne('notifications', notif.granted ? 'granted' : 'denied');
    } catch (e) {
      setOne('notifications', 'denied');
    }

    setRunning(false);
  }

  const items = [
    { key: 'mic', label: 'Microphone (bolke command dene ke liye)' },
    { key: 'contacts', label: 'Contacts (call/message ke liye)' },
    { key: 'calendar', label: 'Calendar (schedule dekhne ke liye)' },
    { key: 'location', label: 'Location (weather/navigation ke liye)' },
    { key: 'phone', label: 'Phone (call karne ke liye)' },
    { key: 'notifications', label: 'Notifications' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Orb state="idle" />
        <Text style={styles.title}>Permissions</Text>
        <Text style={styles.subtitle}>Archi ko kaam karne ke liye ye zaroori hain</Text>

        {items.map((it) => (
          <View key={it.key} style={styles.permRow}>
            <Text style={styles.permLabel}>{it.label}</Text>
            <Text
              style={[
                styles.permStatus,
                status[it.key] === 'granted' && styles.permGranted,
                status[it.key] === 'denied' && styles.permDenied,
              ]}
            >
              {status[it.key] === 'pending' ? '—' : status[it.key] === 'granted' ? 'OK' : 'Denied'}
            </Text>
          </View>
        ))}

        <TouchableOpacity style={styles.primaryButton} onPress={requestAll} disabled={running}>
          <Text style={styles.primaryButtonText}>
            {running ? 'Maang rahe hain...' : 'Permissions Allow Karo'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onDone}>
          <Text style={styles.secondaryButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- Home Screen (voice-only, no chat log) ---------------- */
function HomeScreen({ apiKey, onOpenSettings }) {
  const [orbState, setOrbState] = useState('idle'); // idle | listening | thinking | speaking
  const [statusText, setStatusText] = useState('Bolne ke liye orb dabao');
  const [lastHeard, setLastHeard] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const [showTypeFallback, setShowTypeFallback] = useState(false);
  const [typedText, setTypedText] = useState('');
  const modelRef = useRef(null);

  useSpeechRecognitionEvent('start', () => {
    setOrbState('listening');
    setStatusText('Sun raha hoon...');
  });

  useSpeechRecognitionEvent('end', () => {
    setOrbState((prev) => (prev === 'listening' ? 'idle' : prev));
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results && event.results[0] && event.results[0].transcript;
    if (text && event.isFinal) {
      setLastHeard(text);
      handleUserSpeech(text);
    }
  });

  useSpeechRecognitionEvent('error', () => {
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
      ExpoSpeechRecognitionModule.start({ lang: 'hi-IN', interimResults: true, continuous: false });
    } catch (e) {
      setStatusText('Voice start nahi hua: ' + (e.message || 'error'));
    }
  }

  async function handleUserSpeech(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    await askArchi(trimmed);
  }

  async function askArchi(userText) {
    if (cooldown) {
      setStatusText('Thoda ruko, phir try karo');
      return;
    }
    setOrbState('thinking');
    setStatusText('Soch rahi hoon...');
    try {
      const reply = await callGemini(apiKey, userText, modelRef);
      setLastReply(reply);
      speak(reply);
    } catch (e) {
      const msg = e.message || 'Kuch galat hua';
      setLastReply('Error: ' + msg);
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
    const text = typedText.trim();
    if (!text) return;
    setTypedText('');
    setShowTypeFallback(false);
    setLastHeard(text);
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

      <View style={styles.assistantArea}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={orbState === 'idle' ? startListening : undefined}
        >
          <Orb state={orbState} />
        </TouchableOpacity>
        <Text style={styles.statusText}>{statusText}</Text>

        {lastHeard ? (
          <View style={styles.captionBox}>
            <Text style={styles.captionLabel}>Aapne kaha</Text>
            <Text style={styles.captionText}>{lastHeard}</Text>
          </View>
        ) : null}

        {lastReply ? (
          <View style={styles.captionBox}>
            <Text style={styles.captionLabel}>Archi</Text>
            <Text style={styles.captionText}>{lastReply}</Text>
          </View>
        ) : null}
      </View>

      {!showTypeFallback ? (
        <TouchableOpacity onPress={() => setShowTypeFallback(true)} style={styles.typeToggle}>
          <Text style={styles.typeToggleText}>Voice nahi chal raha? Type karo</Text>
        </TouchableOpacity>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Kuch type karo..."
              placeholderTextColor="#666a7a"
              value={typedText}
              onChangeText={setTypedText}
              autoFocus
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendTyped}>
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
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

/* ---------------- Gemini API — auto-detect working model ---------------- */
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];

async function resolveModel(apiKey) {
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey
    );
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).filter((m) =>
        (m.supportedGenerationMethods || []).includes('generateContent')
      );
      const flash = models.find((m) => (m.name || '').includes('flash')) || models[0];
      if (flash) return flash.name.replace('models/', '');
    }
  } catch (e) {
    // ignore, fall through to fallback list
  }
  return null;
}

async function tryGenerate(apiKey, model, userText) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent?key=' +
    apiKey;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] }),
  });
  return response;
}

async function callGemini(apiKey, userText, modelRef) {
  let candidates = modelRef.current ? [modelRef.current] : [];
  if (candidates.length === 0) {
    const auto = await resolveModel(apiKey);
    candidates = auto ? [auto, ...FALLBACK_MODELS] : [...FALLBACK_MODELS];
  } else {
    candidates = [...candidates, ...FALLBACK_MODELS];
  }

  let lastError = null;
  for (const model of candidates) {
    let response;
    try {
      response = await tryGenerate(apiKey, model, userText);
    } catch (netErr) {
      throw new Error('Internet check karo, connection fail hua');
    }

    if (response.ok) {
      modelRef.current = model;
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

    if (response.status === 429) {
      const err = new Error('Bahut zyada requests ho gayi (429) — 15 sec ruk kar try karo');
      err.isRateLimit = true;
      throw err;
    }
    if (response.status === 400 || response.status === 403) {
      throw new Error('API key invalid hai (status ' + response.status + '), Settings mein check karo');
    }
    if (response.status === 404) {
      lastError = new Error('Model "' + model + '" nahi mila, agla try karte hain');
      continue; // try next candidate model
    }
    lastError = new Error('Request fail hua (status ' + response.status + ')');
  }

  throw lastError || new Error('Koi model kaam nahi kar raha');
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a12' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a12', padding: 24 },

  orbWrap: { width: 160, height: 160, borderRadius: 80, overflow: 'hidden', marginBottom: 12 },
  orbVideo: { width: '100%', height: '100%' },

  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 6 },
  subtitle: { color: '#8a8fa3', fontSize: 14, marginBottom: 20, textAlign: 'center' },

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
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
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

  assistantArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  statusText: { color: '#8a8fa3', fontSize: 13, marginTop: 10 },

  captionBox: { marginTop: 18, width: '100%' },
  captionLabel: { color: '#666a7a', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' },
  captionText: { color: '#fff', fontSize: 15, lineHeight: 21 },

  typeToggle: { alignItems: 'center', paddingVertical: 14 },
  typeToggleText: { color: '#4a6cf7', fontSize: 13 },

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

  permRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c2b',
  },
  permLabel: { color: '#cfd2dc', fontSize: 13, flex: 1, marginRight: 8 },
  permStatus: { color: '#666a7a', fontSize: 12, fontWeight: '600' },
  permGranted: { color: '#5fd68a' },
  permDenied: { color: '#f76a6a' },

  settingsSection: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#161622', borderRadius: 14, padding: 16 },
  settingsLabel: { color: '#8a8fa3', fontSize: 13, marginBottom: 6 },
  settingsValue: { color: '#fff', fontSize: 15, marginBottom: 14 },
  secondaryButton: {
    backgroundColor: '#22233a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 10,
    width: '100%',
  },
  secondaryButtonText: { color: '#fff', fontSize: 14 },
  dangerButton: { backgroundColor: '#2a1418', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  dangerButtonText: { color: '#f76a6a', fontSize: 14 },
});
