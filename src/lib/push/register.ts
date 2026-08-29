/**
 * Device registration for push notifications (Android app only).
 *
 * The browser build never runs any of this: `IS_MOBILE_BUILD` is a build-time
 * constant, so on web the whole module tree-shakes away along with the plugin
 * import.
 *
 * A device's FCM token is stored on the signed-in user's own profile
 * (`users/{uid}.fcmTokens`) rather than in a separate collection, because the
 * security rules already let a person write their own user document and
 * nothing else — no rule changes, and a token can never be attached to
 * somebody else's account. One person can carry several devices, so tokens are
 * a set, added with `arrayUnion`.
 *
 * Sending is a server concern: see `src/lib/server/fcm.ts` and
 * `/api/notifications/broadcast`. Nothing here can send a notification, which
 * is deliberate — a client that could would be a client that could spam every
 * customer.
 */
import { arrayUnion, doc, getFirestore, updateDoc } from "firebase/firestore";
import { IS_MOBILE_BUILD } from "../order-route";

/** Guards against double-registering when the auth state re-settles. */
let registeredFor: string | null = null;

/**
 * Ask for notification permission, register with FCM, and save the resulting
 * token against `userId`.
 *
 * Safe to call repeatedly — it no-ops on web, and once per user on device.
 * Never throws: a refused permission is a normal outcome, not an error the
 * sign-in flow should have to handle.
 */
export async function registerForPush(userId: string): Promise<void> {
  if (!IS_MOBILE_BUILD || !userId || registeredFor === userId) return;
  registeredFor = userId;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Android 13+ shows a runtime prompt; older versions resolve as granted.
    let status = await PushNotifications.checkPermissions();
    if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== "granted") {
      registeredFor = null;
      return;
    }

    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener("registration", (token) => {
      void saveToken(userId, token.value);
    });

    await PushNotifications.addListener("registrationError", () => {
      // Nothing actionable on the device — without a token this install simply
      // receives no pushes, and the next sign-in tries again.
      registeredFor = null;
    });

    // Tapping a notification opens the screen it points at. The sender puts
    // that path in `data.link` (see `src/lib/server/fcm.ts`).
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const link = action.notification.data?.link;
      if (typeof link === "string" && link.startsWith("/")) {
        window.location.assign(link);
      }
    });

    await PushNotifications.register();
  } catch {
    // A device without Play Services, or a build without google-services.json,
    // simply gets no push. It must never block signing in.
    registeredFor = null;
  }
}

async function saveToken(userId: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(getFirestore(), "users", userId), {
      fcmTokens: arrayUnion(token),
    });
  } catch {
    /* A failed token write costs this device its pushes, nothing more. */
  }
}

/** Forget the device registration so the next sign-in re-registers. */
export function resetPushRegistration(): void {
  registeredFor = null;
}
