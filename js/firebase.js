// =============================================================================
// js/firebase.js — GIS Pucobre
// Módulo compartido de Firebase — importar desde acceso.js e index.js
//
// IMPORTANTE: Las credenciales aquí son de acceso restringido por dominio
// en la consola de Firebase. Para mayor seguridad en producción, inyectar
// via variables de entorno en el proceso de build (GitHub Actions Secrets).
// =============================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getFirestore  } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { getAuth       } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';

// ─── Configuración Firebase ──────────────────────────────────────────────────
// ACCIÓN REQUERIDA: Restringir esta API Key en Firebase Console →
//   https://console.firebase.google.com → Configuración del proyecto → Clave de API web
//   Restricción recomendada: HTTP referrers → propiedadsuperficial.github.io/*
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyB3kW9ep7iOKDp87T2-er5-CuZKerA4puY",
  authDomain:        "gis-pucobre.firebaseapp.com",
  projectId:         "gis-pucobre",
  storageBucket:     "gis-pucobre.appspot.com",
  messagingSenderId: "654550355942",
  appId:             "1:654550355942:web:06a8bd8014a0faa86f5027",
  measurementId:     "G-2CSXPQN2SC"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
