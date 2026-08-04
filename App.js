import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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

const KEY_STORAGE_NAME = 'archi_gemini_api_key';

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

/* ---------------- Orb Component ---------------- */
function Orb({ active }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [active]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      style={[
        styles.orbOuter,
        { transform: [{ rotate }, { scale: pulse }] },
      ]}
    >
      <View style={styles.orbRingBlue} />
      <View style={styles.orbRingOrange} />
      <View style={styles.orbCore} />
    </Animated.View>
  );
}

/* ---------------- Loading Screen ---------------- */
function LoadingScreen() {
  return (
    <View style={styles.center}>
      <StatusBar style="light" />
      <Orb active={true} />
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
        <Orb active={false} />
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
        <Text style={styles.hintText}>
          Key sirf isi device par local store hoti hai.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------------- Home Screen ---------------- */
function HomeScreen({ apiKey, onOpenSettings }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { id: Date.now().toString(), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await callGemini(apiKey, text);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString() + '_ai', role: 'ai', text: reply },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + '_err',
          role: 'ai',
          text: 'Error: ' + (e.message || 'Kuch galat hua, key check karo.'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Archi 2.0</Text>
        <TouchableOpacity onPress={onOpenSettings} style={styles.settingsBtn}>
          <Text style={styles.settingsBtnText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.orbArea}>
        <Orb active={loading} />
        <Text style={styles.statusText}>
          {loading ? 'Thinking...' : 'Ready'}
        </Text>
      </View>

      <FlatList
        style={styles.chatList}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
            ]}
          >
            <Text style={styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Kuch pucho..."
            placeholderTextColor="#666a7a"
            value={input}
            onChangeText={setInput}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
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
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' +
    apiKey;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: userText }] }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('API key invalid ya request fail (status ' + response.status + ')');
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

  orbOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  orbRingBlue: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#4a6cf7',
    opacity: 0.6,
  },
  orbRingOrange: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#f7924a',
    opacity: 0.6,
  },
  orbCore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffdca8',
  },

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
  settingsBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  settingsBtnText: { color: '#8a8fa3', fontSize: 14 },

  orbArea: { alignItems: 'center', paddingVertical: 10 },
  statusText: { color: '#8a8fa3', fontSize: 13, marginTop: 4 },

  chatList: { flex: 1, paddingHorizontal: 16 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 14, marginVertical: 4 },
  bubbleUser: { backgroundColor: '#4a6cf7', alignSelf: 'flex-end' },
  bubbleAi: { backgroundColor: '#161622', alignSelf: 'flex-start' },
  bubbleText: { color: '#fff', fontSize: 14 },

  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#161622',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    marginRight: 10,
  },
  sendBtn: {
    backgroundColor: '#4a6cf7',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
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
  dangerButton: {
    backgroundColor: '#2a1418',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: { color: '#f76a6a', fontSize: 14 },
});
