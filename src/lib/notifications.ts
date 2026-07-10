/** Notification Service for FreshKart
 *  Placeholder implementations for email and SMS notifications.
 *  These will be wired to actual providers (SendGrid, Twilio) tomorrow.
 */

export type NotificationChannel = "email" | "sms" | "push";
export type NotificationType =
  | "ORDER_PLACED"
  | "ORDER_CONFIRMED"
  | "ORDER_PACKED"
  | "ORDER_SHIPPED"
  | "ORDER_DELIVERED"
  | "ORDER_CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURN_APPROVED"
  | "RETURN_PICKED_UP"
  | "RETURN_REFUNDED"
  | "PAYMENT_RECEIVED"
  | "PRICE_UPDATED"
  | "LOW_STOCK";

export interface NotificationPayload {
  type: NotificationType;
  userId: string;
  email?: string;
  phone?: string;
  orderId?: string;
  orderNumber?: string;
  businessName?: string;
  total?: number;
  status?: string;
  items?: { name: string; qty: number }[];
  extra?: Record<string, string>;
}

/** Email notification service — placeholder for SendGrid integration */
export class EmailNotificationService {
  private enabled: boolean;

  constructor() {
    // Enable when SENDGRID_API_KEY is configured
    this.enabled = !!process.env.SENDGRID_API_KEY;
  }

  async sendOrderConfirmation(payload: NotificationPayload): Promise<void> {
    if (!this.enabled) {
      console.log("[EMAIL PLACEHOLDER] Order confirmation would be sent to:", payload.email);
      return;
    }
    // TODO: Integrate SendGrid
    // await sgMail.send({ to: payload.email, templateId: "d-order-confirmation", dynamicTemplateData: payload });
  }

  async sendStatusUpdate(payload: NotificationPayload): Promise<void> {
    if (!this.enabled) {
      console.log("[EMAIL PLACEHOLDER] Status update would be sent to:", payload.email, "Status:", payload.status);
      return;
    }
    // TODO: Integrate SendGrid
  }

  async sendReturnUpdate(payload: NotificationPayload): Promise<void> {
    if (!this.enabled) {
      console.log("[EMAIL PLACEHOLDER] Return update would be sent to:", payload.email);
      return;
    }
    // TODO: Integrate SendGrid
  }

  async sendInvoice(payload: NotificationPayload & { invoiceUrl: string }): Promise<void> {
    if (!this.enabled) {
      console.log("[EMAIL PLACEHOLDER] Invoice would be sent to:", payload.email);
      return;
    }
    // TODO: Integrate SendGrid
  }
}

/** SMS notification service — placeholder for Twilio integration */
export class SmsNotificationService {
  private enabled: boolean;

  constructor() {
    // Enable when TWILIO_SID and TWILIO_AUTH_TOKEN are configured
    this.enabled = !!(process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN);
  }

  async sendOrderSMS(payload: NotificationPayload): Promise<void> {
    if (!this.enabled) {
      console.log("[SMS PLACEHOLDER] Order SMS would be sent to:", payload.phone);
      return;
    }
    const message = `FreshKart: Your order ${payload.orderNumber} has been placed successfully. Total: Rs. ${payload.total}. Track at fresh-kart-six.vercel.app/orders`;
    console.log("[SMS]", payload.phone, message);
    // TODO: Integrate Twilio
    // await twilioClient.messages.create({ to: payload.phone, from: TWILIO_PHONE, body: message });
  }

  async sendStatusSMS(payload: NotificationPayload): Promise<void> {
    if (!this.enabled) {
      console.log("[SMS PLACEHOLDER] Status SMS would be sent to:", payload.phone, "Status:", payload.status);
      return;
    }
    const statusLabels: Record<string, string> = {
      ORDER_CONFIRMED: "confirmed",
      ORDER_PACKED: "packed",
      ORDER_SHIPPED: "out for delivery",
      ORDER_DELIVERED: "delivered",
    };
    const message = `FreshKart: Your order ${payload.orderNumber} is now ${statusLabels[payload.type] || payload.status}.`;
    console.log("[SMS]", payload.phone, message);
    // TODO: Integrate Twilio
  }

  async sendReturnSMS(payload: NotificationPayload): Promise<void> {
    if (!this.enabled) {
      console.log("[SMS PLACEHOLDER] Return SMS would be sent to:", payload.phone);
      return;
    }
    const message = `FreshKart: Return request for order ${payload.orderNumber} has been ${payload.status}. Refund of Rs. ${payload.total} will be processed soon.`;
    console.log("[SMS]", payload.phone, message);
    // TODO: Integrate Twilio
  }
}

/** Unified notification dispatcher */
export class NotificationDispatcher {
  private email: EmailNotificationService;
  private sms: SmsNotificationService;

  constructor() {
    this.email = new EmailNotificationService();
    this.sms = new SmsNotificationService();
  }

  async dispatch(payload: NotificationPayload, channels: NotificationChannel[]): Promise<void> {
    const promises: Promise<void>[] = [];

    if (channels.includes("email") && payload.email) {
      switch (payload.type) {
        case "ORDER_PLACED":
          promises.push(this.email.sendOrderConfirmation(payload));
          break;
        case "ORDER_CONFIRMED":
        case "ORDER_PACKED":
        case "ORDER_SHIPPED":
        case "ORDER_DELIVERED":
          promises.push(this.email.sendStatusUpdate(payload));
          break;
        case "RETURN_REQUESTED":
        case "RETURN_APPROVED":
        case "RETURN_PICKED_UP":
        case "RETURN_REFUNDED":
          promises.push(this.email.sendReturnUpdate(payload));
          break;
      }
    }

    if (channels.includes("sms") && payload.phone) {
      switch (payload.type) {
        case "ORDER_PLACED":
          promises.push(this.sms.sendOrderSMS(payload));
          break;
        case "ORDER_CONFIRMED":
        case "ORDER_PACKED":
        case "ORDER_SHIPPED":
        case "ORDER_DELIVERED":
          promises.push(this.sms.sendStatusSMS(payload));
          break;
        case "RETURN_APPROVED":
        case "RETURN_REFUNDED":
          promises.push(this.sms.sendReturnSMS(payload));
          break;
      }
    }

    await Promise.all(promises);
  }

  isEmailEnabled(): boolean {
    return this.email["enabled"];
  }

  isSmsEnabled(): boolean {
    return this.sms["enabled"];
  }
}

/** Singleton instance */
export const notifications = new NotificationDispatcher();

/** Helper: Send order status notification */
export async function notifyOrderStatus(
  payload: Omit<NotificationPayload, "type">,
  status: NotificationType
): Promise<void> {
  await notifications.dispatch(
    { ...payload, type: status },
    ["email", "sms"]
  );
}

/** Helper: Send return status notification */
export async function notifyReturnStatus(
  payload: Omit<NotificationPayload, "type">,
  status: NotificationType
): Promise<void> {
  await notifications.dispatch(
    { ...payload, type: status },
    ["email", "sms"]
  );
}
