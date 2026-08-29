/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.greenbasket.greenbasket',
  appName: 'Green Basket',
  webDir: 'out',
  plugins: {
    FirebaseAuthentication: {
      // Only the phone provider is used; loading the rest costs startup time.
      providers: ["phone"],
      // The native layer verifies the app and sends the SMS, but must not sign
      // in itself: an OTP is single-use, and the session has to land on the JS
      // SDK, which is what Firestore reads authenticate with.
      skipNativeAuth: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
