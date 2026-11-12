# Did I Order This?

A delivery-email check for #BuildHybridAI 2026. The AI reads what an email claims. Code checks that claim against a purchase and tracking ledger kept on this device.

This repository is a work in progress. The judging README will be written once the happy path is live.

## License

Apache-2.0.


## Sideload the Chrome extension

The hosted sample inbox at https://did-i-order-this.vercel.app is the judging path. The extension is optional and checks only the Gmail thread that is open, on this device.

1. Build with `npm install` and `npm run build --workspace=@did-i-order-this/extension`.
2. In Chrome, open `chrome://extensions`, turn on Developer mode, and load unpacked from `extension/dist`.
3. Open Gmail in a tab, then open the side panel from the extension action. The content script sends the open thread text only. The side panel runs on-device AI. Cloud checks go through the hosted site, not the extension.

The file is never uploaded. There is no Gmail API access.
