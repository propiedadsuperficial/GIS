// =============================================================================
// js/acceso.js — GIS Pucobre v6
// Pipeline: Email → Firestore (Usuarios_GIS) → Firebase Phone Auth SMS OTP → Acceso
//
// Flujo:
//   1. Usuario ingresa correo @pucobre.cl
//   2. Se verifica en Firestore colección "Usuarios_GIS" (doc ID = email)
//      → habilitado: true  → continúa
//      → no existe / habilitado: false → rechazado
//   3. Firebase Phone Auth envía SMS OTP al celular registrado en Firestore
//   4. Usuario ingresa código → signInWithPhoneNumber → acceso
//   5. Se registra log de acceso (IP + timestamp) en Firestore colección "logs_acceso"
//   6. Redirige a PROD con los parámetros originales del mapa
// =============================================================================

const PROD_BASE  = 'https://propiedadsuperficial.github.io/GIS/';
const ACCESO_URL = 'https://propiedadsuperficial.github.io/GIS/acceso/acceso.html';

// --- Parámetros del mapa ---
const MAP_KEYS = ['area', 'lat', 'lng', 'zoom'];

function getSearchParams(url = window.location.href) {
  return new URL(url).searchParams;
}

function pickMapParams(sp = getSearchParams()) {
  const out = new URLSearchParams();
  for (const k of MAP_KEYS) {
    const v = sp.get(k);
    if (v !== null && v !== '') out.set(k, v);
  }
  return out;
}

function paramsToString(params) {
  const s = params.toString();
  return s ? `?${s}` : '';
}

function setCtxPill() {
  const pill = document.getElementById('ctx-pill');
  if (!pill) return;
  const p = pickMapParams();
  pill.textContent = p.toString() || 'sin parámetros';
}

// Persistencia de parámetros
const MAP_PARAMS_KEY = 'gis:lastMapParams';
function saveMapParams(params) {
  try { localStorage.setItem(MAP_PARAMS_KEY, params.toString()); } catch {}
}
function loadMapParams() {
  try {
    const raw = localStorage.getItem(MAP_PARAMS_KEY);
    if (!raw) return null;
    const src  = new URLSearchParams(raw);
    const pure = new URLSearchParams();
    for (const k of MAP_KEYS) {
      const v = src.get(k);
      if (v !== null && v !== '') pure.set(k, v);
    }
    return pure;
  } catch { return null; }
}

// --- Firebase (v10, ES Modules) ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import {
  getAuth, RecaptchaVerifier, signInWithPhoneNumber,
  setPersistence, browserLocalPersistence, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import {
  getFirestore, doc, getDoc, collection, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyB3kW9ep7iOKDp87T2-er5-CuZKerA4puY",
  authDomain:        "gis-pucobre.firebaseapp.com",
  projectId:         "gis-pucobre",
  storageBucket:     "gis-pucobre.appspot.com",
  messagingSenderId: "654550355942",
  appId:             "1:654550355942:web:06a8bd8014a0faa86f5027",
  measurementId:     "G-2CSXPQN2SC"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

// --- Elementos UI ---
const stepEmail   = document.getElementById('step-email');
const stepOtp     = document.getElementById('step-otp');
const emailInput  = document.getElementById('email');
const otpInput    = document.getElementById('otp-code');
const btnVerificar = document.getElementById('btn-verificar');
const btnIngresar  = document.getElementById('btn-ingresar');
const btnVolver    = document.getElementById('btn-volver');
const statusEmail  = document.getElementById('status-email');
const statusOtp    = document.getElementById('status-otp');
const otpNombre    = document.getElementById('otp-nombre');

function setStatus(el, msg, cls = '') {
  if (!el) return;
  el.className = `status ${cls}`.trim();
  el.textContent = msg;
}

function disableStep1(disabled) {
  if (btnVerificar) btnVerificar.disabled = disabled;
  if (emailInput)   emailInput.readOnly   = disabled;
}

function disableStep2(disabled) {
  if (btnIngresar) btnIngresar.disabled = disabled;
  if (otpInput)    otpInput.readOnly    = disabled;
}

// --- Si ya hay sesión activa, redirigir directo ---
onAuthStateChanged(auth, (user) => {
  const isOnAcceso = window.location.pathname.includes('/acceso.html');
  if (user && !user.isAnonymous && isOnAcceso) {
    const mapParams = pickMapParams();
    const target = `${PROD_BASE}${paramsToString(
      mapParams.toString() ? mapParams : (loadMapParams() ?? new URLSearchParams())
    )}`;
    window.location.replace(target);
  }
});

// --- reCAPTCHA invisible ---
let recaptchaVerifier = null;
function initRecaptcha() {
  if (recaptchaVerifier) return;
  recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {}
  });
}

// --- Variables de estado ---
let confirmationResult = null;
let usuarioData        = null;
let emailActual        = '';

// =============================================================================
// PASO 1 — Verificar correo en Firestore
// =============================================================================
btnVerificar?.addEventListener('click', async () => {
  const email = (emailInput?.value || '').trim().toLowerCase();

  if (!email) {
    setStatus(statusEmail, 'Ingresa tu correo corporativo.', 'warn');
    emailInput?.focus();
    return;
  }

  if (!/@pucobre\.cl$/i.test(email)) {
    setStatus(statusEmail, 'Este acceso requiere correo @pucobre.cl', 'warn');
    emailInput?.focus();
    return;
  }

  disableStep1(true);
  setStatus(statusEmail, 'Verificando acceso…', 'warn');

  try {
    // Consultar Firestore: Usuarios_GIS/{email}
    const userRef  = doc(db, 'Usuarios_GIS', email);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      setStatus(statusEmail, 'Correo no registrado en el sistema. Contacta al administrador.', 'err');
      disableStep1(false);
      return;
    }

    const data = userSnap.data();

    if (!data.habilitado) {
      setStatus(statusEmail, 'Tu acceso está deshabilitado. Contacta al administrador.', 'err');
      disableStep1(false);
      return;
    }

    if (!data.celular) {
      setStatus(statusEmail, 'No hay celular registrado para tu cuenta. Contacta al administrador.', 'err');
      disableStep1(false);
      return;
    }

    // Verificar que el proyecto en la URL esté autorizado para este usuario
    const areaParam = pickMapParams().get('area');
    if (areaParam && data.proyectos && Array.isArray(data.proyectos)) {
      const tieneAcceso = data.proyectos.some(p => p.toLowerCase() === areaParam.toLowerCase());
      if (!tieneAcceso) {
        setStatus(statusEmail, `No tienes acceso al proyecto "${areaParam}". Contacta al administrador.`, 'err');
        disableStep1(false);
        return;
      }
    }

    // Guardar datos para el paso 2
    emailActual  = email;
    usuarioData  = data;

    // Enviar SMS OTP
    initRecaptcha();
    setStatus(statusEmail, 'Enviando código SMS…', 'warn');

    confirmationResult = await signInWithPhoneNumber(auth, data.celular, recaptchaVerifier);

    // Pasar a paso 2
    if (otpNombre) otpNombre.textContent = data.nombre || email;
    saveMapParams(pickMapParams());

    stepEmail.style.display = 'none';
    stepOtp.style.display   = 'block';
    setStatus(statusOtp, '', '');
    otpInput?.focus();

  } catch (err) {
    console.error('Error paso 1:', err);
    setStatus(statusEmail, describeError(err), 'err');
    disableStep1(false);
    // Resetear reCAPTCHA si hubo error de envío
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch {}
      recaptchaVerifier = null;
    }
  }
});

// =============================================================================
// PASO 2 — Verificar código OTP e iniciar sesión
// =============================================================================
btnIngresar?.addEventListener('click', async () => {
  const code = (otpInput?.value || '').trim();

  if (!code || code.length < 6) {
    setStatus(statusOtp, 'Ingresa el código de 6 dígitos recibido por SMS.', 'warn');
    otpInput?.focus();
    return;
  }

  disableStep2(true);
  setStatus(statusOtp, 'Verificando código…', 'warn');

  try {
    await confirmationResult.confirm(code);

    // Registrar log de acceso en Firestore
    try {
      await addDoc(collection(db, 'logs_acceso'), {
        email:     emailActual,
        nombre:    usuarioData?.nombre ?? '',
        area:      pickMapParams().get('area') ?? 'general',
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent.slice(0, 200)
      });
    } catch (logErr) {
      console.warn('No se pudo registrar el log de acceso:', logErr);
    }

    // Redirigir a PROD con parámetros del mapa
    const mapParams = pickMapParams();
    const target = `${PROD_BASE}${paramsToString(
      mapParams.toString() ? mapParams : (loadMapParams() ?? new URLSearchParams())
    )}`;

    setStatus(statusOtp, '✅ Acceso verificado. Ingresando…', 'ok');
    window.location.replace(target);

  } catch (err) {
    console.error('Error paso 2:', err);
    setStatus(statusOtp, describeError(err), 'err');
    disableStep2(false);
  }
});

// Permitir confirmar con Enter en el campo OTP
otpInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnIngresar?.click();
});

// --- Botón volver ---
btnVolver?.addEventListener('click', () => {
  stepOtp.style.display   = 'none';
  stepEmail.style.display = 'block';
  setStatus(statusEmail, '', '');
  disableStep1(false);
  confirmationResult = null;
  if (otpInput) otpInput.value = '';
  // Resetear reCAPTCHA para permitir reintento
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch {}
    recaptchaVerifier = null;
  }
});

// --- Descripción de errores ---
function describeError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-phone-number')
    return 'El número de celular registrado no es válido. Contacta al administrador.';
  if (code === 'auth/invalid-verification-code')
    return 'Código incorrecto. Verifica el SMS e intenta de nuevo.';
  if (code === 'auth/code-expired')
    return 'El código expiró. Vuelve al paso anterior para solicitar uno nuevo.';
  if (code === 'auth/too-many-requests')
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (code === 'auth/quota-exceeded')
    return 'Cuota de SMS excedida. Intenta más tarde.';
  if (code === 'auth/captcha-check-failed')
    return 'Error de verificación reCAPTCHA. Recarga la página e intenta de nuevo.';
  return `Error: ${err?.message || err}`;
}

// --- Inicialización ---
setCtxPill();
