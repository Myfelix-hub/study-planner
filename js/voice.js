// 语音输入服务（全局单例）+ 内嵌麦克风按钮组件
// 用法：import { MicBtn, startVoice, voiceState } from '../voice.js';
// 输入框旁放 <MicBtn :get-el="() => $refs.xxx" />，点击即可对该框听写

export const voiceState = Vue.reactive({
  supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  listening: false,
  interim: '',
  error: '',
  targetEl: null,
});

let recog = null;

function initRecog() {
  if (recog) return recog;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  recog = new SR();
  recog.lang = 'zh-CN';
  recog.continuous = true;
  recog.interimResults = true;
  recog.onresult = (e) => {
    let interim = '', finalText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    voiceState.interim = interim;
    if (finalText && voiceState.targetEl) insertText(voiceState.targetEl, finalText);
  };
  recog.onend = () => {
    // 静音超时自动停止且用户未手动停止时，重启保持连续听写
    if (voiceState.listening) { try { recog.start(); } catch (_) {} }
  };
  recog.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    const msgs = {
      'not-allowed': '麦克风权限被拒绝。请点击浏览器地址栏左侧的锁形/设置图标，允许本页面使用麦克风后再试。',
      'service-not-allowed': '当前环境不支持语音识别服务（非 HTTPS 页面或浏览器限制）。部署到平板后可用，或改用系统输入法的语音输入。',
      'audio-capture': '找不到麦克风设备，请检查设备麦克风。',
      'network': '语音服务连接失败。语音识别需要联网，请检查网络后再试。',
      'language-not-supported': '当前浏览器不支持中文语音识别。',
    };
    voiceState.error = msgs[e.error] || '语音识别出错（' + e.error + '），请再试一次。';
    stopVoice();
    // 错误持续显示，直到下次开始听写时清除
  };
  return recog;
}

function insertText(el, text) {
  const start = el.selectionStart != null ? el.selectionStart : el.value.length;
  const end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
  const v = el.value;
  el.value = v.slice(0, start) + text + v.slice(end);
  const pos = start + text.length;
  try { el.setSelectionRange(pos, pos); } catch (_) {}
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}

export function startVoice(el) {
  if (!initRecog() || !el) return;
  if (!window.isSecureContext) {
    voiceState.error = '当前页面不是 HTTPS 安全连接，无法使用语音输入。部署到平板（HTTPS）后可用，或先用系统输入法的语音输入。';
    return;
  }
  voiceState.targetEl = el;
  voiceState.error = '';
  voiceState.interim = '';
  // 已在运行先停再启，避免 InvalidStateError
  if (voiceState.listening) { try { recog.stop(); } catch (_) {} }
  try {
    recog.start();
    voiceState.listening = true;
  } catch (e) {
    voiceState.listening = false;
    voiceState.error = '语音识别启动失败，请刷新页面后再试。';
  }
}

export function stopVoice() {
  voiceState.listening = false;
  voiceState.interim = '';
  if (recog) { try { recog.stop(); } catch (_) {} }
}

export function toggleVoice(el) {
  if (voiceState.listening && voiceState.targetEl === el) stopVoice();
  else startVoice(el);
}

// 内嵌麦克风按钮：放在输入框/文本域旁边
export const MicBtn = {
  props: {
    getEl: { type: Function, required: true },
    big: { type: Boolean, default: false },
  },
  computed: {
    st() { return voiceState; },
    active() { return voiceState.listening && voiceState.targetEl === this.getEl(); },
  },
  methods: {
    onClick() {
      const el = this.getEl();
      if (!el) return;
      el.focus();
      toggleVoice(el);
    },
  },
  template: `
  <span class="mic-wrap">
    <button v-if="st.supported" type="button" class="mic-btn" :class="{ on: active, big }"
      @click.stop="onClick" :title="active ? '点击停止语音输入' : '点击开始语音输入'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3"/>
        <path d="M5 10a7 7 0 0 0 14 0"/>
        <path d="M12 17v4M8.5 21h7"/>
      </svg>
    </button>
    <span v-if="active && st.interim" class="voice-interim">{{ st.interim }}</span>
    <span v-else-if="active" class="voice-interim listening">正在聆听，请说话…</span>
    <span v-if="st.error" class="voice-interim error" @click="st.error = ''">{{ st.error }}<b>✕</b></span>
  </span>
  `,
};
