export const MESSAGE = {
  EMAIL_TEXT: "DIO_EMAIL_TEXT",
  GET_EMAIL: "DIO_GET_EMAIL",
} as const;

export const HOSTED_APP_URL = "https://did-i-order-this.vercel.app";

export type ExtractedEmail = {
  text: string;
  fromDomain: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
};

export type EmailTextMessage = {
  type: typeof MESSAGE.EMAIL_TEXT;
  email: ExtractedEmail | null;
  reason?: string;
};

export type GetEmailMessage = { type: typeof MESSAGE.GET_EMAIL };
