# Tester card

About 5 minutes. No account. Nothing to install, unless you also try the Chrome extension.

Please use the live site, not a screenshot or a mockup. Do not send the contents of your real inbox, passwords, recovery phrases, or screenshots that show them.

## 1. Open the sample inbox

On your phone or computer, open:

[https://did-i-order-this.vercel.app/app/](https://did-i-order-this.vercel.app/app/)

If the header does not say **1 order and 0 expected parcels are stored on this device.**, tap **Reset demo data**.

## 2. Check the first email

1. Tap the first thread, **DHL Express Desk**, **Your parcel is held. Pay the release fee.** (on a phone, swipe the thread row).
2. Tap **Check this email**.
3. If a dialog asks to check in the cloud, either button is fine. The first time, the dialog can take up to about 12 seconds to appear.
4. You should see **Warning** and **You're not expecting any parcel right now.**

Note the headline, the label under it (**Checked on this device**, **Checked in the cloud**, or the prepared-claim line), and whether anything looked broken.

## 3. Check the matching shipment

1. Tap **Load the matching shipment demo**. The header should say **1 order and 1 expected parcel are stored on this device.**
2. Tap **Check this email** on the UPS thread.
3. You should see **Safe** and **This tracking number matches a shipment you are expecting.**

Note the headline and the label under it.

## 4. Send back

Send a short note, and a screenshot only if something broke, with:

- The date
- Your device and browser (for example iPhone and Safari, or Chrome on a laptop)
- What you saw in steps 2 and 3 (verdict, headline, label)
- Anything that failed, looked wrong, or was hard to do

Results are logged in [testers.md](testers.md).

## Optional: the Chrome extension on your own Gmail

Only if you already use desktop Chrome and are willing to sideload an unpacked extension. Steps are in [docs/TESTING.md, section 5](../TESTING.md#5-chrome-extension-desktop-chrome-138-or-later). Open a real delivery or billing thread, open the side panel, tap **Check this email**, and tell us the verdict and headline. The extension never sends the email to the cloud.
