// Change this to your Telegram username (without the @) to turn on the
// shoutout banner. You can also set VITE_TELEGRAM_USERNAME at build time.
const DEFAULT_TELEGRAM_USERNAME = 'hotdogsasopas';

const configuredUsername = import.meta.env?.VITE_TELEGRAM_USERNAME || DEFAULT_TELEGRAM_USERNAME;

export const TELEGRAM_USERNAME = String(configuredUsername).trim().replace(/^@/, '');
export const SHOUTOUTS_ENABLED = TELEGRAM_USERNAME.length > 0;

export const SHOUTOUT_TEXT_MIN = 3;
export const SHOUTOUT_TEXT_MAX = 120;

export const SHOUTOUT_DURATIONS = [
  { id: '1h', label: '1 hour', shortLabel: '1 hr', durationMs: 60 * 60 * 1000, price: 25 },
  { id: '3h', label: '3 hours', shortLabel: '3 hrs', durationMs: 3 * 60 * 60 * 1000, price: 60 },
  { id: '6h', label: '6 hours', shortLabel: '6 hrs', durationMs: 6 * 60 * 60 * 1000, price: 80 },
  { id: '12h', label: '12 hours', shortLabel: '12 hrs', durationMs: 12 * 60 * 60 * 1000, price: 140 },
];

export function getShoutoutDuration(durationId) {
  return SHOUTOUT_DURATIONS.find((duration) => duration.id === durationId) || null;
}

export function formatPeso(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH')}`;
}

export function getShoutoutTelegramUrl(paymentMessage) {
  if (!TELEGRAM_USERNAME) return '';
  const base = `https://t.me/${TELEGRAM_USERNAME}`;
  return paymentMessage ? `${base}?text=${encodeURIComponent(paymentMessage)}` : base;
}

export function buildPaymentMessage({ requestId, text, duration, price, slot }) {
  const lines = [
    'Hi! I would like to book a GRCBuddy shoutout.',
    '',
    `Request ID: ${requestId}`,
    `Duration: ${duration.label}`,
    `Amount: ${formatPeso(price)}`,
  ];

  if (slot) lines.push(`Requested slot: ${slot}`);

  lines.push(
    `Banner text: "${text}"`,
    '',
    'I will send the payment here. Please confirm once received. Thank you!'
  );

  return lines.join('\n');
}
